import type { PropertyRow } from '../../shared/types.js';
import { readySignature } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

interface InFlight {
  names: Set<string>;
  promise: Promise<PropertyRow[]>;
}

interface Batch {
  names: Set<string>;
  promise: Promise<PropertyRow[]>;
}

interface Settled {
  names: Set<string>;
  rows: PropertyRow[];
}

interface AdapterReads {
  inFlight: InFlight | null;
  batch: Batch | null;
  settled: Settled | null;
  generation: number;
}

const reads = new WeakMap<ViewerAdapter, AdapterReads>();
const signatures = new WeakMap<AdapterReads, string>();

function readsFor(adapter: ViewerAdapter): AdapterReads {
  const signature =
    typeof adapter.getModels === 'function'
      ? readySignature(adapter.getModels())
      : '';
  let entry = reads.get(adapter);
  if (!entry || signatures.get(entry) !== signature) {
    entry = { inFlight: null, batch: null, settled: null, generation: 0 };
    reads.set(adapter, entry);
    signatures.set(entry, signature);
  }
  return entry;
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

function startBatch(adapter: ViewerAdapter, entry: AdapterReads): Batch {
  const names = new Set<string>();
  const promise = Promise.resolve().then(() => {
    entry.batch = null;
    const union = new Set(names);
    const generation = entry.generation;
    const read = adapter.getLeafProperties([...union]);
    const inFlight: InFlight = { names: union, promise: read };
    entry.inFlight = inFlight;
    const release = () => {
      if (entry.inFlight === inFlight) entry.inFlight = null;
    };
    read.then((rows) => {
      release();
      if (entry.generation === generation)
        entry.settled = { names: union, rows };
    }, release);
    return read;
  });
  return { names, promise };
}

export async function readLeafRows(
  adapter: ViewerAdapter,
  propertyNames: readonly string[],
): Promise<PropertyRow[]> {
  const entry = readsFor(adapter);
  if (entry.settled && covers(entry.settled.names, propertyNames)) {
    return project(entry.settled.rows, propertyNames);
  }
  if (entry.inFlight && covers(entry.inFlight.names, propertyNames)) {
    return project(await entry.inFlight.promise, propertyNames);
  }
  if (!entry.batch) entry.batch = startBatch(adapter, entry);
  for (const name of propertyNames) entry.batch.names.add(name);
  return project(await entry.batch.promise, propertyNames);
}

export function forgetLeafRows(adapter: ViewerAdapter): void {
  const entry = reads.get(adapter);
  if (!entry) return;
  entry.settled = null;
  entry.inFlight = null;
  entry.generation += 1;
}
