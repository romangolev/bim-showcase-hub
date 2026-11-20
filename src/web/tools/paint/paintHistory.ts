import { isRecord } from '../../../shared/guards.js';
import {
  applyPaintPlan,
  type PaintBatch,
  resetPaint,
} from '../../extensions/paintBrushes.js';
import { defineRecordFamily } from '../../storage.js';
import type { ModelDbId, ModelInfo } from '../../viewer/modelSet.js';
import type { Rgba, ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { modelKey } from '../kernel/modelKey.js';

export const PAINT_RECORD_FORMAT = 1;
export const PAINT_KEY_PREFIX = 'bsh.paint.';
export const DEFAULT_HISTORY_DEPTH = 20;
export const MIN_HISTORY_DEPTH = 1;
export const MAX_HISTORY_DEPTH = 50;
export const MAX_PAINT_ITEMS = 200_000;
export const MAX_RECORD_BYTES = 1_000_000;
export const ID_BYTES = 7;
export const MAX_HISTORY_ENTRIES = 5;
export const REPLAY_TREE_TIMEOUT_MS = 2000;

export const UNDO_PAINT_MESSAGE = 'Undid the last paint';
export const REDO_PAINT_MESSAGE = 'Redid the paint';
export const NOTHING_TO_UNDO_MESSAGE = 'Nothing to undo';
export const NOTHING_TO_REDO_MESSAGE = 'Nothing to redo';

export interface PaintTarget {
  urn: string;
  version: string;
}

export interface PaintOp {
  action: string;
  at: number;
  rgba: Rgba;
  dbIds: number[];
}

export interface PaintModelRecord {
  format: 1;
  urn: string;
  version: string;
  ops: PaintOp[];
  cursor: number;
}

export interface PaintHistoryEntry {
  action: string;
  at: number;
  rgba: Rgba;
  count: number;
  models: number;
}

interface ModelRecord {
  model: ModelInfo;
  record: PaintModelRecord;
}

export const PAINT_RECORDS = defineRecordFamily<PaintModelRecord, PaintTarget>({
  prefix: PAINT_KEY_PREFIX,
  keyOf: (target) =>
    `${PAINT_KEY_PREFIX}${modelKey(`${target.urn}\u0000${target.version}`)}`,
  initial: emptyRecord({ urn: '', version: '' }),
  sanitize: readPaintRecord,
});

let lastPaintAt = 0;

export function clampHistoryDepth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_HISTORY_DEPTH;
  }
  return Math.min(
    MAX_HISTORY_DEPTH,
    Math.max(MIN_HISTORY_DEPTH, Math.round(value)),
  );
}

export function targetOf(model: ModelInfo): PaintTarget {
  return { urn: model.urn || model.id, version: model.version ?? '' };
}

function emptyRecord(target: PaintTarget): PaintModelRecord {
  return {
    format: PAINT_RECORD_FORMAT,
    urn: target.urn,
    version: target.version,
    ops: [],
    cursor: 0,
  };
}

function readDbIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const entry of value) {
    if (
      typeof entry !== 'number' ||
      !Number.isInteger(entry) ||
      entry <= 0 ||
      seen.has(entry)
    ) {
      continue;
    }
    seen.add(entry);
    out.push(entry);
    if (out.length >= MAX_PAINT_ITEMS) break;
  }
  return out;
}

function paintIds(value: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const entry of value) {
    if (!Number.isInteger(entry) || entry <= 0 || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

function readRgba(value: unknown): Rgba | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const channels: number[] = [];
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return null;
    channels.push(Math.min(1, Math.max(0, entry)));
  }
  return channels as unknown as Rgba;
}

function readOp(value: unknown): PaintOp | null {
  if (!isRecord(value)) return null;
  const { action, at, rgba, dbIds } = value;
  if (typeof action !== 'string' || !action || action.length > 64) return null;
  const color = readRgba(rgba);
  if (!color) return null;
  const ids = readDbIds(dbIds);
  if (ids.length === 0) return null;
  return {
    action,
    at: typeof at === 'number' && Number.isFinite(at) ? at : 0,
    rgba: color,
    dbIds: ids,
  };
}

export function readPaintRecord(raw: unknown): PaintModelRecord {
  if (!isRecord(raw) || raw.format !== PAINT_RECORD_FORMAT) {
    return emptyRecord({ urn: '', version: '' });
  }
  const urn = typeof raw.urn === 'string' ? raw.urn.slice(0, 1024) : '';
  const version =
    typeof raw.version === 'string' ? raw.version.slice(0, 128) : '';
  const ops: PaintOp[] = [];
  if (Array.isArray(raw.ops)) {
    for (const entry of raw.ops) {
      const op = readOp(entry);
      if (op) ops.push(op);
    }
  }
  const cursor =
    typeof raw.cursor === 'number' && Number.isInteger(raw.cursor)
      ? Math.min(ops.length, Math.max(0, raw.cursor))
      : ops.length;
  return { format: PAINT_RECORD_FORMAT, urn, version, ops, cursor };
}

function stored(model: ModelInfo): PaintModelRecord {
  const target = targetOf(model);
  const value = PAINT_RECORDS.get(target).read();
  return value.urn === target.urn && value.version === target.version
    ? value
    : emptyRecord(target);
}

function save(model: ModelInfo, record: PaintModelRecord): void {
  PAINT_RECORDS.get(targetOf(model)).write(record);
}

function readyModels(adapter: ViewerAdapter): ModelInfo[] {
  return adapter.getModels().filter((model) => model.status === 'ready');
}

function modelRecords(adapter: ViewerAdapter): ModelRecord[] {
  return readyModels(adapter).map((model) => ({
    model,
    record: stored(model),
  }));
}

function nextPaintAt(): number {
  lastPaintAt = Math.max(Date.now(), lastPaintAt + 1);
  return lastPaintAt;
}

function newPaintAction(): string {
  return `paint-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const APPLIED_ACTIONS = new WeakMap<ViewerAdapter, Set<string>>();

function appliedActions(adapter: ViewerAdapter): Set<string> {
  let set = APPLIED_ACTIONS.get(adapter);
  if (!set) {
    set = new Set();
    APPLIED_ACTIONS.set(adapter, set);
  }
  return set;
}

export function forgetAppliedPaint(adapter: ViewerAdapter): void {
  APPLIED_ACTIONS.delete(adapter);
}

function applied(adapter: ViewerAdapter, op: PaintOp): boolean {
  return appliedActions(adapter).has(op.action);
}

function batchesFor(
  adapter: ViewerAdapter,
  records: readonly ModelRecord[],
): PaintBatch[] {
  const byColor = new Map<string, PaintBatch>();
  for (const { model, record } of records) {
    const final = new Map<number, Rgba>();
    for (const op of record.ops.slice(0, record.cursor)) {
      if (!applied(adapter, op)) continue;
      for (const dbId of op.dbIds) final.set(dbId, op.rgba);
    }
    for (const [dbId, color] of final) {
      const key = color.join(',');
      const batch = byColor.get(key);
      const item: ModelDbId = { modelId: model.id, dbId };
      if (batch) batch.items.push(item);
      else byColor.set(key, { color, items: [item] });
    }
  }
  return [...byColor.values()];
}

function applyRecords(
  adapter: ViewerAdapter,
  records: readonly ModelRecord[],
  clear: boolean,
): number {
  const batches = batchesFor(adapter, records);
  applyPaintPlan(adapter, batches, clear);
  return batches.reduce((total, batch) => total + batch.items.length, 0);
}

function trimToBudget(ops: PaintOp[]): PaintOp[] {
  let bytes = 0;
  for (const op of ops) bytes += op.dbIds.length * ID_BYTES + 80;
  let start = 0;
  while (bytes > MAX_RECORD_BYTES && start < ops.length - 1) {
    const dropped = ops[start];
    if (!dropped) break;
    bytes -= dropped.dbIds.length * ID_BYTES + 80;
    start += 1;
  }
  return start === 0 ? ops : ops.slice(start);
}

export function recordPaint(
  adapter: ViewerAdapter,
  color: Rgba,
  depth: number,
): boolean {
  const selection = adapter.getModelSelection();
  if (selection.length === 0) return false;
  const rgba = readRgba(color);
  if (!rgba) return false;
  const models = new Map(
    readyModels(adapter).map((model) => [model.id, model]),
  );
  const grouped = new Map<string, number[]>();
  for (const { modelId, dbId } of selection) {
    if (!models.has(modelId)) continue;
    if (!Number.isInteger(dbId) || dbId <= 0) continue;
    const ids = grouped.get(modelId) ?? [];
    ids.push(dbId);
    grouped.set(modelId, ids);
  }
  if (grouped.size === 0) return false;
  const limit = clampHistoryDepth(depth);
  const at = nextPaintAt();
  const action = newPaintAction();
  const appliedSet = appliedActions(adapter);
  appliedSet.add(action);
  const batches: PaintBatch[] = [];
  for (const [modelId, selected] of grouped) {
    const model = models.get(modelId);
    if (!model) continue;
    const ids = paintIds(selected);
    if (ids.length === 0) continue;
    const current = stored(model);
    const applied = current.ops.slice(0, current.cursor);
    applied.push({ action, at, rgba, dbIds: ids });
    const ops = trimToBudget(applied.slice(-limit));
    save(model, { ...current, ops, cursor: ops.length });
    batches.push({
      color: rgba,
      items: ids.map((dbId) => ({ modelId, dbId })),
    });
  }
  if (batches.length === 0) return false;
  applyPaintPlan(adapter, batches);
  adapter.clearSelection();
  return true;
}

export function canUndoPaint(adapter: ViewerAdapter): boolean {
  return modelRecords(adapter).some(({ record }) =>
    record.ops.slice(0, record.cursor).some((op) => applied(adapter, op)),
  );
}

export function canRedoPaint(adapter: ViewerAdapter): boolean {
  return modelRecords(adapter).some(({ record }) =>
    record.ops.slice(record.cursor).some((op) => applied(adapter, op)),
  );
}

export function undoPaint(adapter: ViewerAdapter): boolean {
  const records = modelRecords(adapter);
  let latest: PaintOp | undefined;
  for (const { record } of records) {
    for (const op of record.ops.slice(0, record.cursor)) {
      if (!applied(adapter, op)) continue;
      if (!latest || op.at >= latest.at) latest = op;
    }
  }
  if (!latest) return false;
  const action = latest.action;
  const updated = new Map<string, PaintModelRecord>();
  for (const { model, record } of records) {
    let cursor = record.cursor;
    while (cursor > 0 && record.ops[cursor - 1]?.action === action) cursor -= 1;
    if (cursor === record.cursor) continue;
    const next = { ...record, cursor };
    save(model, next);
    updated.set(model.id, next);
  }
  if (updated.size === 0) return false;
  applyRecords(
    adapter,
    records.map(({ model, record }) => ({
      model,
      record: updated.get(model.id) ?? record,
    })),
    true,
  );
  return true;
}

export function redoPaint(adapter: ViewerAdapter): boolean {
  const records = modelRecords(adapter);
  let earliest: PaintOp | undefined;
  for (const { record } of records) {
    for (const op of record.ops.slice(record.cursor)) {
      if (!applied(adapter, op)) continue;
      if (!earliest || op.at <= earliest.at) earliest = op;
    }
  }
  if (!earliest) return false;
  const action = earliest.action;
  const updated = new Map<string, PaintModelRecord>();
  for (const { model, record } of records) {
    let cursor = record.cursor;
    while (
      cursor < record.ops.length &&
      record.ops[cursor]?.action === action
    ) {
      cursor += 1;
    }
    if (cursor === record.cursor) continue;
    const next = { ...record, cursor };
    save(model, next);
    updated.set(model.id, next);
  }
  if (updated.size === 0) return false;
  applyRecords(
    adapter,
    records.map(({ model, record }) => ({
      model,
      record: updated.get(model.id) ?? record,
    })),
    true,
  );
  return true;
}

export function paintHistoryEntries(
  adapter: ViewerAdapter,
  limit = MAX_HISTORY_ENTRIES,
): PaintHistoryEntry[] {
  const byAction = new Map<
    string,
    PaintHistoryEntry & { modelIds: Set<string> }
  >();
  for (const { model, record } of modelRecords(adapter)) {
    for (const op of record.ops.slice(0, record.cursor)) {
      const entry = byAction.get(op.action);
      if (entry) {
        entry.count += op.dbIds.length;
        entry.modelIds.add(model.id);
        entry.models = entry.modelIds.size;
        continue;
      }
      byAction.set(op.action, {
        action: op.action,
        at: op.at,
        rgba: op.rgba,
        count: op.dbIds.length,
        models: 1,
        modelIds: new Set([model.id]),
      });
    }
  }
  return [...byAction.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, limit))
    .map(({ modelIds: _modelIds, ...entry }) => entry);
}

export function clearPaintState(adapter: ViewerAdapter): void {
  for (const model of adapter.getModels()) {
    PAINT_RECORDS.forget(targetOf(model));
  }
  forgetAppliedPaint(adapter);
  resetPaint(adapter);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function waitForTree(adapter: ViewerAdapter): Promise<void> {
  return withTimeout(adapter.getVisible(), REPLAY_TREE_TIMEOUT_MS).then(
    () => undefined,
    () => undefined,
  );
}

export async function replayPaint(adapter: ViewerAdapter): Promise<number> {
  const records = modelRecords(adapter).filter(
    ({ record }) => record.cursor > 0,
  );
  if (records.length === 0) return 0;
  await waitForTree(adapter);
  const appliedSet = appliedActions(adapter);
  for (const { record } of records) {
    for (const op of record.ops.slice(0, record.cursor)) {
      appliedSet.add(op.action);
    }
  }
  return applyRecords(adapter, records, false);
}

export function paintSwatch(rgba: Rgba): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(rgba[0])}${channel(rgba[1])}${channel(rgba[2])}`;
}
