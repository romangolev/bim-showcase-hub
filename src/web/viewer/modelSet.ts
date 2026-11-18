import { MAX_COMBINED_MODELS, type Vec3 } from '../../shared/combined.js';

export type { Vec3 };

export const MODEL_LIMIT_MESSAGE = `A combined view holds up to ${MAX_COMBINED_MODELS} models. Remove one to add another.`;
export const DUPLICATE_MODEL_MESSAGE =
  'This version is already open in this viewer.';
export const EMPTY_SOURCE_MESSAGE = 'A model URN is required';

export type ModelStatus = 'loading' | 'ready' | 'error';

export interface ModelMeta {
  version?: string;
  path?: string;
}

export interface ModelSource extends ModelMeta {
  urn: string;
  name?: string;
}

export type FailureReason =
  | 'processing'
  | 'access'
  | 'missing'
  | 'dimension'
  | 'region'
  | 'no-viewable'
  | 'unknown';

export class ModelLoadError extends Error {
  constructor(
    readonly reason: FailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'ModelLoadError';
  }
}

export function reasonOf(err: unknown): FailureReason {
  return err instanceof ModelLoadError ? err.reason : 'unknown';
}

export interface ModelInfo {
  id: string;
  urn: string;
  name: string;
  version?: string;
  path?: string;
  visible: boolean;
  status: ModelStatus;
  error?: string;
  reason?: FailureReason;
  propertiesError?: string;
}

export interface ModelDbId {
  modelId: string;
  dbId: number;
}

export const VIEWER_CLOSED_MESSAGE = 'The viewer is closed';

export const CANCELLED_MESSAGE =
  'The model was removed or the viewer reloaded before it finished loading.';

export type ModelSetErrorCode =
  | 'limit'
  | 'duplicate'
  | 'empty'
  | 'closed'
  | 'cancelled';

export class ModelSetError extends Error {
  constructor(
    readonly code: ModelSetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ModelSetError';
  }
}

export function modelIdFor(urn: string): string {
  return urn;
}

export function uniqueSources(sources: readonly ModelSource[]): ModelSource[] {
  if (sources.length === 0) {
    throw new ModelSetError('empty', EMPTY_SOURCE_MESSAGE);
  }
  const seen = new Set<string>();
  const unique: ModelSource[] = [];
  for (const source of sources) {
    if (!source.urn) throw new ModelSetError('empty', EMPTY_SOURCE_MESSAGE);
    if (seen.has(source.urn)) continue;
    seen.add(source.urn);
    unique.push(source);
  }
  return unique;
}

export function checkCapacity(
  current: number,
  adding: number,
  cap = MAX_COMBINED_MODELS,
): void {
  if (current + adding > cap) {
    throw new ModelSetError('limit', MODEL_LIMIT_MESSAGE);
  }
}

export function readySignature(models: readonly ModelInfo[]): string {
  return models
    .filter((model) => model.status === 'ready' && model.visible)
    .map((model) => model.id)
    .join('\n');
}

export function loadFailure(models: readonly ModelInfo[]): ModelLoadError {
  const reason = models.find((model) => model.error)?.reason ?? 'unknown';
  return new ModelLoadError(reason, loadFailureMessage(models));
}

export function loadFailureMessage(models: readonly ModelInfo[]): string {
  const first = models.find((model) => model.error)?.error ?? 'Load failed';
  if (models.length <= 1) return first;
  return `None of the ${models.length} models could be loaded. ${first}`;
}

interface Entry<H> {
  info: ModelInfo;
  handle?: H;
  token: number;
}

export class ModelSet<H> {
  private readonly entries = new Map<string, Entry<H>>();
  private readonly listeners = new Set<(models: ModelInfo[]) => void>();
  private serial = 0;
  private tokens = 0;

  constructor(private readonly cap = MAX_COMBINED_MODELS) {}

  get size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  list(): ModelInfo[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.info }));
  }

  get(id: string): ModelInfo | undefined {
    const entry = this.entries.get(id);
    return entry ? { ...entry.info } : undefined;
  }

  token(id: string): number | undefined {
    return this.entries.get(id)?.token;
  }

  handle(id: string): H | undefined {
    return this.entries.get(id)?.handle;
  }

  ready(): { info: ModelInfo; handle: H }[] {
    const out: { info: ModelInfo; handle: H }[] = [];
    for (const entry of this.entries.values()) {
      if (entry.info.status === 'ready' && entry.handle !== undefined) {
        out.push({ info: { ...entry.info }, handle: entry.handle });
      }
    }
    return out;
  }

  idOf(handle: H): string | undefined {
    for (const [id, entry] of this.entries) {
      if (entry.handle === handle) return id;
    }
    return undefined;
  }

  activeCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.info.status !== 'error') count += 1;
    }
    return count;
  }

  primaryId(): string | undefined {
    return this.ready()[0]?.info.id;
  }

  add(source: ModelSource): ModelInfo {
    if (!source.urn) throw new ModelSetError('empty', EMPTY_SOURCE_MESSAGE);
    const id = modelIdFor(source.urn);
    const existing = this.entries.get(id);
    if (existing && existing.info.status !== 'error') {
      throw new ModelSetError('duplicate', DUPLICATE_MODEL_MESSAGE);
    }
    checkCapacity(this.activeCount(), 1, this.cap);
    if (!existing) this.serial += 1;
    const info: ModelInfo = {
      id,
      urn: source.urn,
      name:
        source.name?.trim() || existing?.info.name || `Model ${this.serial}`,
      ...(source.version ? { version: source.version } : {}),
      ...(source.path ? { path: source.path } : {}),
      visible: true,
      status: 'loading',
    };
    this.tokens += 1;
    this.entries.set(id, { info, token: this.tokens });
    this.emit();
    return { ...info };
  }

  resolve(id: string, handle: H, token?: number): boolean {
    const entry = this.entries.get(id);
    if (!entry || (token !== undefined && entry.token !== token)) return false;
    const {
      error: _error,
      reason: _reason,
      propertiesError: _propertiesError,
      ...rest
    } = entry.info;
    entry.handle = handle;
    entry.info = { ...rest, status: 'ready' };
    this.emit();
    return true;
  }

  fail(
    id: string,
    message: string,
    token?: number,
    reason: FailureReason = 'unknown',
  ): boolean {
    const entry = this.entries.get(id);
    if (!entry || (token !== undefined && entry.token !== token)) return false;
    entry.handle = undefined;
    entry.info = { ...entry.info, status: 'error', error: message, reason };
    this.emit();
    return true;
  }

  remove(id: string): { info: ModelInfo; handle?: H } | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    this.entries.delete(id);
    if (this.entries.size === 0) this.serial = 0;
    this.emit();
    return { info: { ...entry.info }, handle: entry.handle };
  }

  shown(): { info: ModelInfo; handle: H }[] {
    return this.ready().filter(({ info }) => info.visible);
  }

  setPropertiesError(id: string, message?: string): void {
    const entry = this.entries.get(id);
    if (!entry || entry.info.propertiesError === message) return;
    const { propertiesError: _previous, ...rest } = entry.info;
    entry.info = message ? { ...rest, propertiesError: message } : rest;
    this.emit();
  }

  setVisible(id: string, visible: boolean): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.info.visible === visible) return false;
    entry.info = { ...entry.info, visible };
    this.emit();
    return true;
  }

  clear(): H[] {
    const handles: H[] = [];
    for (const entry of this.entries.values()) {
      if (entry.handle !== undefined) handles.push(entry.handle);
    }
    const had = this.entries.size > 0;
    this.entries.clear();
    this.serial = 0;
    if (had) this.emit();
    return handles;
  }

  onChange(cb: (models: ModelInfo[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  private emit(): void {
    const snapshot = this.list();
    for (const cb of [...this.listeners]) {
      try {
        cb(snapshot.map((model) => ({ ...model })));
      } catch (err) {
        console.error(err);
      }
    }
  }
}

export interface ModelBox {
  id: string;
  min: Vec3;
  max: Vec3;
}

export interface ModelSpread {
  farApart: boolean;
  distanceMeters: number;
  largestDiagonalMeters: number;
}

export const FAR_APART_FACTOR = 10;

const UNIT_METERS: Record<string, number> = {
  m: 1,
  meter: 1,
  meters: 1,
  ft: 0.3048,
  'ft-us': 0.3048006096,
  sft: 0.3048006096,
  in: 0.0254,
  cm: 0.01,
  mm: 0.001,
  km: 1000,
};

export function metersPerUnit(unit: string | null | undefined): number {
  return UNIT_METERS[(unit ?? 'm').toLowerCase()] ?? 1;
}

export function centerOf(box: Pick<ModelBox, 'min' | 'max'>): Vec3 {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function diagonal(box: Pick<ModelBox, 'min' | 'max'>): number {
  return distance(box.min, box.max);
}

export function spreadOf(
  boxes: readonly ModelBox[],
  unitMeters = 1,
): ModelSpread | null {
  if (boxes.length < 2) return null;
  const centers = boxes.map(centerOf);
  let far = 0;
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      far = Math.max(far, distance(centers[i] as Vec3, centers[j] as Vec3));
    }
  }
  const largest = Math.max(...boxes.map(diagonal));
  return {
    farApart: far > largest * FAR_APART_FACTOR,
    distanceMeters: far * unitMeters,
    largestDiagonalMeters: largest * unitMeters,
  };
}

export function togetherOffsets(
  boxes: readonly ModelBox[],
  anchorId: string,
): Record<string, Vec3> {
  const anchor = boxes.find((box) => box.id === anchorId);
  if (!anchor) return {};
  const target = centerOf(anchor);
  const offsets: Record<string, Vec3> = {};
  for (const box of boxes) {
    if (box.id === anchorId) continue;
    const center = centerOf(box);
    offsets[box.id] = [
      target[0] - center[0],
      target[1] - center[1],
      target[2] - center[2],
    ];
  }
  return offsets;
}

export function formatKm(meters: number): string {
  const km = meters / 1000;
  if (km >= 10) return Math.round(km).toLocaleString('en-US');
  if (km >= 1) return km.toFixed(1);
  return km.toFixed(2);
}

export function farApartMessage(
  spread: Pick<ModelSpread, 'distanceMeters'>,
): string {
  return `Some models are far apart in model space (about ${formatKm(spread.distanceMeters)} km). They are shown at their real positions.`;
}
