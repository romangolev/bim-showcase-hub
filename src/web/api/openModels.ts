import {
  MAX_COMBINED_MODELS,
  MAX_LOADED_MEMBERS,
  type Vec3,
} from '../../shared/combined.js';
import {
  joinWith,
  type ModelContext,
  parseModelContext,
  parseWith,
  sameModelContext,
  withUrns,
} from './modelContext.js';
import { hasModelContext, MODEL_STORE_KEY, recallModel } from './modelStore.js';

export const OPEN_MODELS_KEY = 'bsh.models.open';
export const MODEL_OWNER_KEY = 'bsh.models.owner';

export interface OpenModel {
  urn: string;
  context: ModelContext;
  offsets?: Record<string, Vec3>;
  spread?: number;
}

function parseOffsets(value: unknown): Record<string, Vec3> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const out: Record<string, Vec3> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (
      Array.isArray(raw) &&
      raw.length === 3 &&
      raw.every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      out[id] = [raw[0], raw[1], raw[2]] as Vec3;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function withView(
  model: OpenModel,
  view: { offsets?: Record<string, Vec3> | null; spread?: number | null },
): OpenModel {
  const next: OpenModel = { urn: model.urn, context: model.context };
  const offsets = view.offsets === undefined ? model.offsets : view.offsets;
  const spread = view.spread === undefined ? model.spread : view.spread;
  if (offsets && Object.keys(offsets).length > 0) next.offsets = offsets;
  if (typeof spread === 'number') next.spread = spread;
  return next;
}

function dropMember(
  model: OpenModel,
  dropped: string,
  next: Pick<OpenModel, 'urn' | 'context'>,
): OpenModel {
  return withView(next, {
    offsets: model.offsets
      ? Object.fromEntries(
          Object.entries(model.offsets).filter(([id]) => id !== dropped),
        )
      : null,
    spread: model.spread ?? null,
  });
}

export function setModelView(
  state: OpenModelsState,
  urn: string,
  view: { offsets?: Record<string, Vec3> | null; spread?: number | null },
): OpenModelsState {
  const index = state.models.findIndex((model) => model.urn === urn);
  const current = state.models[index];
  if (!current) return state;
  const next = withView(current, view);
  if (
    JSON.stringify(next.offsets) === JSON.stringify(current.offsets) &&
    next.spread === current.spread
  ) {
    return state;
  }
  const models = [...state.models];
  models[index] = next;
  return { ...state, models };
}

export interface OpenModelsState {
  models: readonly OpenModel[];
  active: string | null;
  live: readonly string[];
  visible: readonly string[];
}

export const EMPTY_OPEN_MODELS: OpenModelsState = {
  models: [],
  active: null,
  live: [],
  visible: [],
};

export function isOpen(state: OpenModelsState, urn: string): boolean {
  return state.models.some((model) => model.urn === urn);
}

export function contextOf(
  state: OpenModelsState,
  urn: string,
): ModelContext | null {
  return state.models.find((model) => model.urn === urn)?.context ?? null;
}

export function liveWeight(state: OpenModelsState, urn: string): number {
  return Math.max(1, modelUrnsOf(state, urn).length);
}

function fitLive(
  state: OpenModelsState,
  live: readonly string[],
  keep: string,
  limit: number,
): string[] {
  const kept = [...live];
  let total = kept.reduce((sum, id) => sum + liveWeight(state, id), 0);
  while (total > limit) {
    const victim = kept.findIndex(
      (id) => id !== keep && id !== state.active && !state.visible.includes(id),
    );
    if (victim === -1) break;
    total -= liveWeight(state, kept[victim] as string);
    kept.splice(victim, 1);
  }
  return kept;
}

function withLive(
  state: OpenModelsState,
  live: readonly string[],
): OpenModelsState {
  const same =
    live.length === state.live.length &&
    live.every((id, index) => state.live[index] === id);
  return same ? state : { ...state, live: [...live] };
}

export function touchLive(
  state: OpenModelsState,
  urn: string,
  limit = MAX_LOADED_MEMBERS,
): OpenModelsState {
  if (!isOpen(state, urn)) return state;
  const order = [...state.live.filter((id) => id !== urn), urn];
  return withLive(state, fitLive(state, order, urn, limit));
}

export function setVisible(
  state: OpenModelsState,
  urns: readonly string[],
): OpenModelsState {
  const visible = urns.filter((urn) => isOpen(state, urn));
  const same =
    visible.length === state.visible.length &&
    visible.every((urn) => state.visible.includes(urn));
  return same ? state : { ...state, visible };
}

export function activateModel(
  state: OpenModelsState,
  urn: string,
  limit = MAX_LOADED_MEMBERS,
): OpenModelsState {
  if (!isOpen(state, urn)) return state;
  const next = state.active === urn ? state : { ...state, active: urn };
  return touchLive(next, urn, limit);
}

function entryContext(urn: string, context: ModelContext): ModelContext {
  const parsed = parseModelContext(context);
  const extra = joinWith(parseWith(parsed.with, urn));
  const { with: _with, ...rest } = parsed;
  return extra ? { ...rest, with: extra } : rest;
}

export function openModel(
  state: OpenModelsState,
  urn: string,
  context: ModelContext = {},
  limit = MAX_LOADED_MEMBERS,
): OpenModelsState {
  if (!urn) return state;
  const existing = state.models.find((model) => model.urn === urn);
  let models = state.models;
  const incoming = entryContext(urn, context);
  if (!existing) {
    models = [...models, { urn, context: incoming }];
  } else {
    const merged: ModelContext = hasModelContext(incoming)
      ? { ...incoming }
      : { ...existing.context, ...incoming };
    const extra =
      context.with !== undefined ? incoming.with : existing.context.with;
    if (extra) merged.with = extra;
    else delete merged.with;
    if (!sameModelContext(existing.context, merged)) {
      models = models.map((model) =>
        model.urn === urn ? { ...model, context: merged } : model,
      );
    }
  }
  const next = models === state.models ? state : { ...state, models };
  return activateModel(next, urn, limit);
}

export function closeModel(
  state: OpenModelsState,
  urn: string,
  limit = MAX_LOADED_MEMBERS,
): OpenModelsState {
  const index = state.models.findIndex((model) => model.urn === urn);
  if (index === -1) return state;
  const models = state.models.filter((model) => model.urn !== urn);
  let active = state.active;
  if (active === urn) {
    active = (models[index] ?? models[index - 1])?.urn ?? null;
  }
  const next = {
    models,
    active,
    live: state.live.filter((id) => id !== urn),
    visible: state.visible.filter((id) => id !== urn),
  };
  return active && active !== state.active
    ? touchLive(next, active, limit)
    : next;
}

export function modelUrnsOf(state: OpenModelsState, urn: string): string[] {
  const entry = state.models.find((model) => model.urn === urn);
  return entry ? [urn, ...withUrns(entry.context)] : [];
}

export function addToModel(
  state: OpenModelsState,
  target: string,
  urn: string,
  limit = MAX_LOADED_MEMBERS,
): OpenModelsState {
  const entry = state.models.find((model) => model.urn === target);
  if (!entry || !urn) return state;
  const current = modelUrnsOf(state, target);
  if (current.includes(urn) || current.length >= MAX_COMBINED_MODELS) {
    return state;
  }
  const extra = joinWith([...withUrns(entry.context), urn]);
  const next = {
    ...state,
    models: state.models.map((model) =>
      model.urn === target
        ? { ...model, context: { ...entry.context, with: extra } }
        : model,
    ),
  };
  return next.live.includes(target)
    ? withLive(next, fitLive(next, next.live, target, limit))
    : next;
}

function rename(list: readonly string[], from: string, to: string): string[] {
  return list.map((id) => (id === from ? to : id));
}

export function removeFromModel(
  state: OpenModelsState,
  target: string,
  urn: string,
  contextFor: (urn: string) => ModelContext = () => ({}),
  limit = MAX_LOADED_MEMBERS,
): OpenModelsState {
  const entry = state.models.find((model) => model.urn === target);
  if (!entry) return state;
  const extras = withUrns(entry.context);
  if (urn !== target) {
    if (!extras.includes(urn)) return state;
    const next = joinWith(extras.filter((id) => id !== urn));
    const { with: _with, ...rest } = entry.context;
    const context = next ? { ...rest, with: next } : rest;
    return {
      ...state,
      models: state.models.map((model) =>
        model.urn === target
          ? dropMember(model, urn, { urn: target, context })
          : model,
      ),
    };
  }
  if (extras.length === 0) return closeModel(state, target, limit);
  const tabs = new Set(state.models.map((model) => model.urn));
  const primary = extras.find((urn) => !tabs.has(urn));
  if (!primary) {
    const [host, ...others] = extras as [string, ...string[]];
    const merged = closeModel(state, target, limit);
    const into = merged.models.find((model) => model.urn === host);
    if (!into) return merged;
    const joined = joinWith([...withUrns(into.context), ...others]);
    const { with: _with, ...single } = into.context;
    return activateModel(
      {
        ...merged,
        models: merged.models.map((model) =>
          model.urn === host
            ? {
                ...model,
                context: joined ? { ...single, with: joined } : single,
              }
            : model,
        ),
      },
      state.active === target ? host : (merged.active ?? host),
      limit,
    );
  }
  const others = extras.filter((urn) => urn !== primary);
  const base = parseModelContext(contextFor(primary));
  const { with: _with, ...single } = base;
  const rest = joinWith(others);
  const context: ModelContext = rest ? { ...single, with: rest } : single;
  return {
    models: state.models.map((model) =>
      model.urn === target
        ? dropMember(model, target, { urn: primary, context })
        : model,
    ),
    active: state.active === target ? primary : state.active,
    live: rename(state.live, target, primary),
    visible: rename(state.visible, target, primary),
  };
}

export function keepOnlyModel(
  state: OpenModelsState,
  urn: string,
): OpenModelsState {
  const model = state.models.find((entry) => entry.urn === urn);
  if (!model) return state;
  return { models: [model], active: urn, live: [], visible: [] };
}

export function serializeOpenModels(state: OpenModelsState): string {
  return JSON.stringify({ models: state.models, active: state.active });
}

export function parseOpenModels(raw: string | null): OpenModelsState {
  if (!raw) return EMPTY_OPEN_MODELS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_OPEN_MODELS;
  }
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_OPEN_MODELS;
  const record = parsed as Record<string, unknown>;
  const models: OpenModel[] = [];
  if (Array.isArray(record.models)) {
    for (const entry of record.models) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { urn, context, offsets, spread } = entry as Record<
        string,
        unknown
      >;
      if (typeof urn !== 'string' || !urn) continue;
      if (models.some((model) => model.urn === urn)) continue;
      models.push(
        withView(
          { urn, context: parseModelContext(context) },
          {
            offsets: parseOffsets(offsets) ?? null,
            spread: typeof spread === 'number' ? spread : null,
          },
        ),
      );
    }
  }
  const active =
    typeof record.active === 'string' &&
    models.some((model) => model.urn === record.active)
      ? record.active
      : (models[0]?.urn ?? null);
  return { models, active, live: [], visible: [] };
}

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function remove(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    return;
  }
}

export function forgetModels(): void {
  remove(sessionStore(), OPEN_MODELS_KEY);
  remove(local(), MODEL_STORE_KEY);
  remove(local(), MODEL_OWNER_KEY);
}

export interface ModelOwner {
  id?: string;
  name: string;
}

export function ownerKey(owner: ModelOwner): string {
  return owner.id ? `id:${owner.id}` : `name:${owner.name}`;
}

function sameOwner(stored: string, owner: ModelOwner): boolean {
  const key = ownerKey(owner);
  if (stored === key) return true;
  if (stored.startsWith('id:')) return false;
  const name = stored.startsWith('name:') ? stored.slice(5) : stored;
  return name === owner.name;
}

export function claimModels(owner: ModelOwner): boolean {
  const storage = local();
  let stored: string | null = null;
  try {
    stored = storage?.getItem(MODEL_OWNER_KEY) ?? null;
  } catch {
    stored = null;
  }
  const changed = stored !== null && !sameOwner(stored, owner);
  if (changed) forgetModels();
  try {
    storage?.setItem(MODEL_OWNER_KEY, ownerKey(owner));
  } catch {
    return changed;
  }
  return changed;
}

export interface OpenModelsStore {
  getState: () => OpenModelsState;
  subscribe: (listener: () => void) => () => void;
  open: (urn: string, context?: ModelContext) => void;
  activate: (urn: string) => void;
  show: (urn: string) => void;
  setVisible: (urns: readonly string[]) => void;
  close: (urn: string) => void;
  keepOnly: (urn: string) => void;
  addTo: (target: string, urn: string) => void;
  removeFrom: (target: string, urn: string) => void;
  setView: (
    urn: string,
    view: { offsets?: Record<string, Vec3> | null; spread?: number | null },
  ) => void;
  clear: () => void;
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function createOpenModelsStore(
  storage: Storage | null = sessionStore(),
  limit = MAX_LOADED_MEMBERS,
  contextFor: (urn: string) => ModelContext = (urn) => recallModel(urn) ?? {},
): OpenModelsStore {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(OPEN_MODELS_KEY) ?? null;
  } catch {
    raw = null;
  }
  let state = parseOpenModels(raw);
  const listeners = new Set<() => void>();
  const save = (previous: OpenModelsState) => {
    if (previous.models === state.models && previous.active === state.active) {
      return;
    }
    try {
      storage?.setItem(OPEN_MODELS_KEY, serializeOpenModels(state));
    } catch {
      return;
    }
  };
  const apply = (next: OpenModelsState) => {
    if (next === state) return;
    const previous = state;
    state = next;
    save(previous);
    for (const listener of [...listeners]) listener();
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open: (urn, context) => apply(openModel(state, urn, context, limit)),
    activate: (urn) => apply(activateModel(state, urn, limit)),
    show: (urn) => apply(touchLive(state, urn, limit)),
    setVisible: (urns) => apply(setVisible(state, urns)),
    close: (urn) => apply(closeModel(state, urn, limit)),
    keepOnly: (urn) => apply(keepOnlyModel(state, urn)),
    addTo: (target, urn) => apply(addToModel(state, target, urn, limit)),
    removeFrom: (target, urn) =>
      apply(removeFromModel(state, target, urn, contextFor, limit)),
    setView: (urn, view) => apply(setModelView(state, urn, view)),
    clear: () => {
      remove(storage, OPEN_MODELS_KEY);
      if (state.models.length === 0) return;
      state = EMPTY_OPEN_MODELS;
      for (const listener of [...listeners]) listener();
    },
  };
}
