import type { PropertyRow } from '../../shared/types.js';
import type { ModelInfo } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

interface Pending {
  names: Set<string>;
  promise: Promise<PropertyRow[]>;
}

interface KeyReads {
  inFlight: Pending | null;
  batch: Pending | null;
  settled: { names: Set<string>; rows: PropertyRow[] } | null;
}

interface AdapterReads {
  generation: number;
  keys: Map<string, KeyReads>;
}

const WHOLE = '';
const reads = new WeakMap<ViewerAdapter, AdapterReads>();

function readsFor(adapter: ViewerAdapter): AdapterReads {
  let entry = reads.get(adapter);
  if (!entry) {
    const created: AdapterReads = { generation: 0, keys: new Map() };
    entry = created;
    reads.set(adapter, created);
    if (typeof adapter.onModelsChange === 'function') {
      const ready = new Set(
        adapter
          .getModels()
          .filter((model) => model.status === 'ready')
          .map((model) => model.id),
      );
      adapter.onModelsChange((models) => {
        const now = new Set<string>();
        for (const model of models) {
          if (model.status !== 'ready') {
            created.keys.delete(model.id);
            continue;
          }
          now.add(model.id);
          if (!ready.has(model.id)) created.keys.delete(model.id);
        }
        for (const id of [...created.keys.keys()]) {
          if (id !== WHOLE && !models.some((model) => model.id === id)) {
            created.keys.delete(id);
          }
        }
        ready.clear();
        for (const id of now) ready.add(id);
      });
    }
  }
  return entry;
}

function keyReads(entry: AdapterReads, key: string): KeyReads {
  let reads = entry.keys.get(key);
  if (!reads) {
    reads = { inFlight: null, batch: null, settled: null };
    entry.keys.set(key, reads);
  }
  return reads;
}

function project(rows: PropertyRow[], names: readonly string[]): PropertyRow[] {
  return rows.map((row) => {
    const properties: PropertyRow['properties'] = {};
    for (const name of names) properties[name] = row.properties[name] ?? null;
    const projected: PropertyRow = {
      dbId: row.dbId,
      name: row.name,
      properties,
    };
    if (row.modelId !== undefined) projected.modelId = row.modelId;
    if (row.modelName !== undefined) projected.modelName = row.modelName;
    return projected;
  });
}

function covers(have: Set<string>, want: readonly string[]): boolean {
  return want.every((name) => have.has(name));
}

function startBatch(
  adapter: ViewerAdapter,
  entry: AdapterReads,
  key: KeyReads,
  modelIds: readonly string[] | undefined,
): Pending {
  const names = new Set<string>();
  const generation = entry.generation;
  const promise = Promise.resolve().then(() => {
    key.batch = null;
    const union = new Set(names);
    const read = modelIds
      ? adapter.getLeafProperties([...union], modelIds)
      : adapter.getLeafProperties([...union]);
    const inFlight: Pending = { names: union, promise: read };
    key.inFlight = inFlight;
    const release = () => {
      if (key.inFlight === inFlight) key.inFlight = null;
    };
    read.then((rows) => {
      release();
      if (entry.generation === generation && rows.length > 0) {
        key.settled = { names: union, rows };
      }
    }, release);
    return read;
  });
  return { names, promise };
}

function readKey(
  adapter: ViewerAdapter,
  entry: AdapterReads,
  id: string,
  names: readonly string[],
  modelIds?: readonly string[],
): Promise<PropertyRow[]> {
  const key = keyReads(entry, id);
  if (key.settled && covers(key.settled.names, names)) {
    return Promise.resolve(key.settled.rows);
  }
  if (key.inFlight && covers(key.inFlight.names, names)) {
    return key.inFlight.promise;
  }
  if (!key.batch) key.batch = startBatch(adapter, entry, key, modelIds);
  for (const name of names) key.batch.names.add(name);
  return key.batch.promise;
}

function shownModels(adapter: ViewerAdapter): ModelInfo[] | null {
  if (typeof adapter.getModels !== 'function') return null;
  return adapter
    .getModels()
    .filter((model) => model.status === 'ready' && model.visible);
}

function tag(rows: PropertyRow[], model: ModelInfo): PropertyRow[] {
  return rows.map((row) => ({
    ...row,
    modelId: model.id,
    modelName: model.name,
  }));
}

export async function readLeafRows(
  adapter: ViewerAdapter,
  propertyNames: readonly string[],
): Promise<PropertyRow[]> {
  const entry = readsFor(adapter);
  const models = shownModels(adapter);
  if (models === null) {
    return project(
      await readKey(adapter, entry, WHOLE, propertyNames),
      propertyNames,
    );
  }
  const known = new Set(adapter.getModels().map((model) => model.id));
  for (const id of entry.keys.keys()) {
    if (id !== WHOLE && !known.has(id)) entry.keys.delete(id);
  }
  const results = await Promise.allSettled(
    models.map(async (model) =>
      tag(
        await readKey(adapter, entry, model.id, propertyNames, [model.id]),
        model,
      ),
    ),
  );
  const rows: PropertyRow[] = [];
  let failure: unknown = null;
  for (const result of results) {
    if (result.status === 'fulfilled') rows.push(...result.value);
    else failure ??= result.reason;
  }
  if (failure !== null && rows.length === 0) throw failure;
  return project(rows, propertyNames);
}

export function forgetLeafRows(adapter: ViewerAdapter): void {
  const entry = reads.get(adapter);
  if (!entry) return;
  entry.generation += 1;
  entry.keys.clear();
}
