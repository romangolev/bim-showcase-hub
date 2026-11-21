import {
  MAX_COMBINED_MODELS,
  MAX_LOADED_MEMBERS,
} from '../../shared/combined.js';
import { joinWith, type ModelContext } from '../api/modelContext.js';
import { rememberModel } from '../api/modelStore.js';
import {
  closeModel,
  contextOf,
  isOpen,
  liveWeight,
  modelUrnsOf,
  type OpenModelsState,
  type OpenModelsStore,
} from '../api/openModels.js';
import { MODEL_LIMIT_MESSAGE } from './modelSet.js';

export interface PickedModel {
  urn: string;
  context: ModelContext;
}

export type OpenMode = 'tabs' | 'together' | 'add-to-active' | 'replace';

export type SkipReason =
  | 'tab-limit'
  | 'combined-limit'
  | 'already-open'
  | 'unopenable';

export interface OpenRequest {
  models: readonly PickedModel[];
  mode: OpenMode;
  partial?: boolean;
}

export interface OpenReveal {
  urn: string;
  context: ModelContext;
}

export interface OpenOutcome {
  opened: PickedModel[];
  skipped: { model: PickedModel; reason: SkipReason }[];
  reveal: OpenReveal | null;
  notice: string | null;
}

export interface OpenPreview {
  notice: string | null;
  blocked: boolean;
  admitted: number;
}

interface Plan {
  admit: PickedModel[];
  skipped: OpenOutcome['skipped'];
  notice: string | null;
  closeActive: string | null;
}

export function loadedMembers(state: OpenModelsState): number {
  return state.models.reduce(
    (sum, model) => sum + liveWeight(state, model.urn),
    0,
  );
}

export function tabLimitMessage(openCount: number): string {
  const room = MAX_LOADED_MEMBERS - openCount;
  const open =
    openCount === 0
      ? ''
      : `${openCount} ${openCount === 1 ? 'model is' : 'models are'} already loaded. `;
  return room < 1
    ? `A viewer loads up to ${MAX_LOADED_MEMBERS} models. ${open}Close a model to open another.`
    : `A viewer loads up to ${MAX_LOADED_MEMBERS} models. ${open}Select ${room} or fewer to open them as tabs.`;
}

function leftOut(
  admitted: number,
  total: number,
  holder: string,
  cap: number,
): string {
  const left = total - admitted;
  return `Opened ${admitted} of ${total} models. ${left} ${left === 1 ? 'was' : 'were'} left out: ${holder} ${cap}.`;
}

function rejectAll(
  models: readonly PickedModel[],
  reason: SkipReason,
  notice: string | null,
): Plan {
  return {
    admit: [],
    skipped: models.map((model) => ({ model, reason })),
    notice,
    closeActive: null,
  };
}

function planTabs(
  state: OpenModelsState,
  models: readonly PickedModel[],
  partial: boolean,
): Plan {
  const head = partial ? models.slice(0, MAX_LOADED_MEMBERS) : models;
  const fresh = head.filter((model) => !isOpen(state, model.urn)).length;
  const loaded = loadedMembers(state);
  if (loaded + fresh > MAX_LOADED_MEMBERS) {
    return rejectAll(models, 'tab-limit', tabLimitMessage(loaded));
  }
  const rest = models.slice(head.length);
  return {
    admit: [...head],
    skipped: rest.map((model) => ({ model, reason: 'tab-limit' as const })),
    notice:
      rest.length > 0
        ? leftOut(head.length, models.length, 'tabs hold', MAX_LOADED_MEMBERS)
        : null,
    closeActive: null,
  };
}

function planTogether(models: readonly PickedModel[], partial: boolean): Plan {
  if (!partial && models.length > MAX_COMBINED_MODELS) {
    return rejectAll(models, 'combined-limit', MODEL_LIMIT_MESSAGE);
  }
  const head = models.slice(0, MAX_COMBINED_MODELS);
  const rest = models.slice(head.length);
  return {
    admit: head,
    skipped: rest.map((model) => ({
      model,
      reason: 'combined-limit' as const,
    })),
    notice:
      rest.length > 0
        ? leftOut(
            head.length,
            models.length,
            'a combined viewer holds',
            MAX_COMBINED_MODELS,
          )
        : null,
    closeActive: null,
  };
}

function planAdd(state: OpenModelsState, models: readonly PickedModel[]): Plan {
  const active = state.active;
  if (!active) return rejectAll(models, 'unopenable', null);
  const members = new Set(modelUrnsOf(state, active));
  const admit: PickedModel[] = [];
  const skipped: OpenOutcome['skipped'] = [];
  for (const model of models) {
    if (members.has(model.urn) || isOpen(state, model.urn)) {
      skipped.push({ model, reason: 'already-open' });
    } else if (members.size >= MAX_COMBINED_MODELS) {
      skipped.push({ model, reason: 'combined-limit' });
    } else {
      members.add(model.urn);
      admit.push(model);
    }
  }
  const full = skipped.some((entry) => entry.reason === 'combined-limit');
  return {
    admit,
    skipped,
    notice: full ? MODEL_LIMIT_MESSAGE : null,
    closeActive: null,
  };
}

function planReplace(
  state: OpenModelsState,
  models: readonly PickedModel[],
): Plan {
  const active = state.active;
  const target = models[0];
  if (!active || !target || active === target.urn) {
    return planTabs(state, models, false);
  }
  const plan = planTabs(closeModel(state, active), models, false);
  if (plan.admit.length === 0) return plan;
  const dropped = modelUrnsOf(state, active).length;
  return {
    ...plan,
    notice:
      dropped > 1 ? `Closed the combined tab and its ${dropped} models` : null,
    closeActive: active,
  };
}

function planOpen(state: OpenModelsState, req: OpenRequest): Plan {
  const partial = req.partial === true;
  switch (req.mode) {
    case 'tabs':
      return planTabs(state, req.models, partial);
    case 'together':
      return planTogether(req.models, partial);
    case 'add-to-active':
      return planAdd(state, req.models);
    case 'replace':
      return planReplace(state, req.models);
  }
}

export function previewOpen(
  state: OpenModelsState,
  req: OpenRequest,
): OpenPreview {
  const plan = planOpen(state, req);
  return {
    notice: plan.notice,
    blocked: req.models.length > 0 && plan.admit.length === 0,
    admitted: plan.admit.length,
  };
}

const EMPTY: OpenModelsState = {
  models: [],
  active: null,
  live: [],
  visible: [],
};

export function openModels(
  store: OpenModelsStore | null,
  req: OpenRequest,
): OpenOutcome {
  const state = store?.getState() ?? EMPTY;
  const plan = planOpen(state, req);
  const outcome: OpenOutcome = {
    opened: plan.admit,
    skipped: plan.skipped,
    reveal: null,
    notice: plan.notice,
  };
  const [first] = plan.admit;
  const last = plan.admit.at(-1);
  if (!first || !last) return outcome;
  for (const model of plan.admit) rememberModel(model.urn, model.context);
  switch (req.mode) {
    case 'tabs':
    case 'replace':
      if (plan.closeActive) store?.close(plan.closeActive);
      for (const model of plan.admit) store?.open(model.urn, model.context);
      outcome.reveal = { urn: last.urn, context: last.context };
      break;
    case 'together': {
      const extra = joinWith(plan.admit.slice(1).map((model) => model.urn));
      outcome.reveal = {
        urn: first.urn,
        context: extra ? { ...first.context, with: extra } : first.context,
      };
      break;
    }
    case 'add-to-active': {
      const active = state.active;
      if (!active || !store) break;
      for (const model of plan.admit) store.addTo(active, model.urn);
      outcome.reveal = {
        urn: active,
        context: contextOf(store.getState(), active) ?? {},
      };
      break;
    }
  }
  return outcome;
}
