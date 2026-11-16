import {
  type ModelContext,
  parseModelContext,
  sameModelContext,
} from './modelContext.js';
import { hasModelContext } from './modelStore.js';

export const OPEN_MODELS_KEY = 'bsh.models.open';
export const MAX_LOADED_MODELS = 4;

export interface OpenModel {
  urn: string;
  context: ModelContext;
}

export interface OpenModelsState {
  models: readonly OpenModel[];
  active: string | null;
  live: readonly string[];
}

export const EMPTY_OPEN_MODELS: OpenModelsState = {
  models: [],
  active: null,
  live: [],
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

export function touchLive(
  state: OpenModelsState,
  urn: string,
  limit = MAX_LOADED_MODELS,
): OpenModelsState {
  if (!isOpen(state, urn)) return state;
  if (state.live[state.live.length - 1] === urn) return state;
  const live = [...state.live.filter((id) => id !== urn), urn];
  while (live.length > Math.max(1, limit)) {
    const victim = live.findIndex((id) => id !== urn && id !== state.active);
    if (victim === -1) break;
    live.splice(victim, 1);
  }
  return { ...state, live };
}

export function activateModel(
  state: OpenModelsState,
  urn: string,
  limit = MAX_LOADED_MODELS,
): OpenModelsState {
  if (!isOpen(state, urn)) return state;
  const next = state.active === urn ? state : { ...state, active: urn };
  return touchLive(next, urn, limit);
}

export function openModel(
  state: OpenModelsState,
  urn: string,
  context: ModelContext = {},
  limit = MAX_LOADED_MODELS,
): OpenModelsState {
  if (!urn) return state;
  const existing = state.models.find((model) => model.urn === urn);
  let models = state.models;
  if (!existing) {
    models = [...models, { urn, context: parseModelContext(context) }];
  } else if (
    hasModelContext(context) &&
    !sameModelContext(existing.context, context)
  ) {
    models = models.map((model) =>
      model.urn === urn ? { urn, context: parseModelContext(context) } : model,
    );
  }
  const next = models === state.models ? state : { ...state, models };
  return activateModel(next, urn, limit);
}

export function closeModel(
  state: OpenModelsState,
  urn: string,
): OpenModelsState {
  const index = state.models.findIndex((model) => model.urn === urn);
  if (index === -1) return state;
  const models = state.models.filter((model) => model.urn !== urn);
  let active = state.active;
  if (active === urn) {
    active = (models[index] ?? models[index - 1])?.urn ?? null;
  }
  return {
    models,
    active,
    live: state.live.filter((id) => id !== urn),
  };
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
      const { urn, context } = entry as Record<string, unknown>;
      if (typeof urn !== 'string' || !urn) continue;
      if (models.some((model) => model.urn === urn)) continue;
      models.push({
        urn,
        context: parseModelContext(context),
      });
    }
  }
  const active =
    typeof record.active === 'string' &&
    models.some((model) => model.urn === record.active)
      ? record.active
      : (models[0]?.urn ?? null);
  return { models, active, live: [] };
}

export interface OpenModelsStore {
  getState: () => OpenModelsState;
  subscribe: (listener: () => void) => () => void;
  open: (urn: string, context?: ModelContext) => void;
  activate: (urn: string) => void;
  show: (urn: string) => void;
  close: (urn: string) => void;
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
  limit = MAX_LOADED_MODELS,
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
    close: (urn) => apply(closeModel(state, urn)),
  };
}
