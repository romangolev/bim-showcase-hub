import type { PropertyRow } from '../../shared/types.js';
import { tagRows } from './modelScope.js';
import type { ModelInfo } from './modelSet.js';
import {
  abortError,
  mergeInfos,
  type PropertyInfo,
  type ReadOptions,
  type ReadProgress,
  sumProgress,
  throwIfAborted,
} from './propertyReads.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

interface Pending {
  names: Set<string>;
  controller: AbortController;
  waiters: number;
  listeners: Set<(progress: ReadProgress) => void>;
  last: ReadProgress | null;
  promise: Promise<PropertyRow[]>;
}

interface KeyReads {
  inFlight: Pending | null;
  batch: Pending | null;
  settled: { names: Set<string>; rows: PropertyRow[] } | null;
  discovery: Promise<PropertyInfo[]> | null;
  discovered: PropertyInfo[] | null;
}

interface AdapterReads {
  generation: number;
  keys: Map<string, KeyReads>;
}

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
          if (!models.some((model) => model.id === id)) {
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
    reads = {
      inFlight: null,
      batch: null,
      settled: null,
      discovery: null,
      discovered: null,
    };
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
  const generation = entry.generation;
  const pending: Pending = {
    names: new Set<string>(),
    controller: new AbortController(),
    waiters: 0,
    listeners: new Set(),
    last: null,
    promise: Promise.resolve([]),
  };
  pending.promise = Promise.resolve().then(() => {
    if (key.batch === pending) key.batch = null;
    throwIfAborted(pending.controller.signal);
    key.inFlight = pending;
    const read = adapter.getLeafProperties([...pending.names], modelIds, {
      signal: pending.controller.signal,
      onProgress: (progress) => {
        pending.last = progress;
        for (const listener of pending.listeners) listener(progress);
      },
    });
    const release = () => {
      if (key.inFlight === pending) key.inFlight = null;
    };
    read.then((rows) => {
      release();
      if (entry.generation === generation && rows.length > 0) {
        key.settled = { names: pending.names, rows };
      }
    }, release);
    return read;
  });
  return pending;
}

function attach(
  pending: Pending,
  { signal, onProgress }: ReadOptions,
): Promise<PropertyRow[]> {
  if (signal?.aborted) return Promise.reject(abortError());
  pending.waiters += 1;
  if (onProgress) {
    pending.listeners.add(onProgress);
    if (pending.last) onProgress(pending.last);
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const leave = () => {
      done = true;
      pending.waiters -= 1;
      if (onProgress) pending.listeners.delete(onProgress);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (done) return;
      leave();
      if (pending.waiters === 0) pending.controller.abort();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    pending.promise.then(
      (rows) => {
        if (done) return;
        leave();
        resolve(rows);
      },
      (err: unknown) => {
        if (done) return;
        leave();
        reject(err);
      },
    );
  });
}

function readKey(
  adapter: ViewerAdapter,
  entry: AdapterReads,
  id: string,
  names: readonly string[],
  modelIds: readonly string[] | undefined,
  options: ReadOptions,
): Promise<PropertyRow[]> {
  const key = keyReads(entry, id);
  if (key.settled && covers(key.settled.names, names)) {
    const { rows } = key.settled;
    options.onProgress?.({ done: rows.length, total: rows.length });
    return Promise.resolve(rows);
  }
  if (
    key.inFlight &&
    !key.inFlight.controller.signal.aborted &&
    covers(key.inFlight.names, names)
  ) {
    return attach(key.inFlight, options);
  }
  if (!key.batch || key.batch.controller.signal.aborted) {
    key.batch = startBatch(adapter, entry, key, modelIds);
  }
  for (const name of names) key.batch.names.add(name);
  return attach(key.batch, options);
}

function shownModels(adapter: ViewerAdapter): ModelInfo[] {
  return adapter
    .getModels()
    .filter((model) => model.status === 'ready' && model.visible);
}

export async function readLeafRows(
  adapter: ViewerAdapter,
  propertyNames: readonly string[],
  options: ReadOptions = {},
): Promise<PropertyRow[]> {
  throwIfAborted(options.signal);
  const entry = readsFor(adapter);
  const progress = sumProgress(options.onProgress);
  const models = shownModels(adapter);
  const known = new Set(adapter.getModels().map((model) => model.id));
  for (const id of entry.keys.keys()) {
    if (!known.has(id)) entry.keys.delete(id);
  }
  const results = await Promise.allSettled(
    models.map(async (model) =>
      tagRows(
        await readKey(adapter, entry, model.id, propertyNames, [model.id], {
          ...options,
          onProgress: progress(model.id),
        }),
        model,
      ),
    ),
  );
  throwIfAborted(options.signal);
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

function discoverKey(
  adapter: ViewerAdapter,
  entry: AdapterReads,
  id: string,
): Promise<PropertyInfo[]> {
  const key = keyReads(entry, id);
  if (key.discovered) return Promise.resolve(key.discovered);
  if (key.discovery) return key.discovery;
  const generation = entry.generation;
  const discovery = adapter.discoverProperties([id]);
  key.discovery = discovery;
  const release = () => {
    if (key.discovery === discovery) key.discovery = null;
  };
  discovery.then((infos) => {
    release();
    if (entry.generation === generation && infos.length > 0) {
      key.discovered = infos;
    }
  }, release);
  return discovery;
}

function untilAborted<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

export async function discoverLeafProperties(
  adapter: ViewerAdapter,
  options: Pick<ReadOptions, 'signal'> = {},
): Promise<PropertyInfo[]> {
  const entry = readsFor(adapter);
  const results = await untilAborted(
    Promise.allSettled(
      shownModels(adapter).map((model) =>
        discoverKey(adapter, entry, model.id),
      ),
    ),
    options.signal,
  );
  const lists: PropertyInfo[][] = [];
  let failure: unknown = null;
  for (const result of results) {
    if (result.status === 'fulfilled') lists.push(result.value);
    else failure ??= result.reason;
  }
  if (failure !== null && lists.length === 0) throw failure;
  return mergeInfos(lists);
}
