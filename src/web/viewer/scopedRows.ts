import type { PropertyRow } from '../../shared/types.js';
import {
  ALL_MODELS,
  type ModelScope,
  resolveScope,
  unavailableModels,
} from './modelScope.js';
import type { ModelDbId, ModelInfo } from './modelSet.js';
import type { ReadOptions } from './propertyReads.js';
import {
  applyScope,
  type ElementScope,
  resolveElementScope,
  scopeElementItems,
  scopeNoteFor,
} from './propertyScope.js';
import { peekLeafRows, readLeafRows } from './sharedLeafRows.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export interface ScopedReadRequest extends ReadOptions {
  names: readonly string[];
  models?: ModelScope;
  elements?: ElementScope;
  items?: readonly ModelDbId[];
}

export interface ScopedRead {
  rows: PropertyRow[];
  total: number;
  failed: string[];
  unavailable: ModelInfo[];
  elements: ElementScope;
  scopeNote?: string;
}

interface ResolvedScope {
  modelIds: readonly string[] | undefined;
  elements: ElementScope;
  items: readonly ModelDbId[];
  scopeNote: string | undefined;
}

type ScopingRequest = Pick<ScopedReadRequest, 'models' | 'elements' | 'items'>;

async function resolveScoped(
  adapter: ViewerAdapter,
  { models, elements, items }: ScopingRequest,
): Promise<ResolvedScope> {
  const model = resolveScope(models ?? ALL_MODELS, adapter.getModels());
  const requested = elements ?? 'all';
  const resolved = resolveElementScope(requested);
  return {
    modelIds: model === ALL_MODELS ? undefined : [model],
    elements: resolved,
    items: items ?? (await scopeElementItems(adapter, resolved)),
    scopeNote: scopeNoteFor(requested),
  };
}

function scopedResult(
  adapter: ViewerAdapter,
  rows: PropertyRow[],
  scope: ResolvedScope,
  failedNames: readonly string[],
): ScopedRead {
  const models = adapter.getModels();
  const unavailable = unavailableModels(models);
  const unavailableNames = new Set(unavailable.map((model) => model.name));
  return {
    rows: applyScope(
      rows,
      { elements: scope.elements },
      scope.items,
      models[0]?.id,
    ),
    total: rows.length,
    failed: failedNames.filter((name) => !unavailableNames.has(name)),
    unavailable,
    elements: scope.elements,
    ...(scope.scopeNote ? { scopeNote: scope.scopeNote } : {}),
  };
}

export async function readScopedRows(
  adapter: ViewerAdapter,
  { names, signal, onProgress, ...request }: ScopedReadRequest,
): Promise<ScopedRead> {
  const scope = await resolveScoped(adapter, request);
  let failed: string[] = [];
  const rows = await readLeafRows(adapter, names, {
    signal,
    onProgress,
    ...(scope.modelIds ? { modelIds: scope.modelIds } : {}),
    onFailed: (names) => {
      failed = names;
    },
  });
  return scopedResult(adapter, rows, scope, failed);
}

export async function peekScopedRows(
  adapter: ViewerAdapter,
  request: Omit<ScopedReadRequest, 'names' | 'signal' | 'onProgress'>,
): Promise<ScopedRead | null> {
  const scope = await resolveScoped(adapter, request);
  const rows = peekLeafRows(adapter, scope.modelIds);
  return rows ? scopedResult(adapter, rows, scope, []) : null;
}
