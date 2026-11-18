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

interface Discovery {
  controller: AbortController;
  waiters: number;
  promise: Promise<PropertyInfo[]>;
}

interface KeyReads {
  inFlight: Pending | null;
  batch: Pending | null;
  settled: { names: Set<string>; rows: PropertyRow[] } | null;
  discovery: Discovery | null;
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

function sameNames(have: Set<string>, want: readonly string[]): boolean {
  return (
    have.size === want.length && want.every((name, i) => [...have][i] === name)
  );
}

function covers(have: Set<string>, want: readonly string[]): boolean {
  return want.every((name) => have.has(name));
}

function startBatch(
  adapter: ViewerAdapter,
  entry: AdapterReads,
  key: KeyReads,
  model: ModelInfo,
): Pending {
  const generation = entry.generation;
  const pending: Pending = {
    names: new Set<string>(key.settled?.names),
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
    const read = adapter
      .getLeafProperties([...pending.names], [model.id], {
        signal: pending.controller.signal,
        onProgress: (progress) => {
          pending.last = progress;
          for (const listener of pending.listeners) listener(progress);
        },
      })
      .then((rows) => tagRows(rows, model));
    const release = () => {
      if (key.inFlight === pending) key.inFlight = null;
    };
    read.then((rows) => {
      release();
      if (
        entry.generation === generation &&
        (rows.length > 0 || pending.last?.total === 0)
      ) {
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
  model: ModelInfo,
  names: readonly string[],
  options: ReadOptions,
): Promise<PropertyRow[]> {
  const key = keyReads(entry, model.id);
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
    key.batch = startBatch(adapter, entry, key, model);
  }
  for (const name of names) key.batch.names.add(name);
  return attach(key.batch, options);
}

function shownModels(adapter: ViewerAdapter): ModelInfo[] {
  return adapter
    .getModels()
    .filter((model) => model.status === 'ready' && model.visible);
}

export interface LeafReadOptions extends ReadOptions {
  modelIds?: readonly string[];
  onFailed?: (modelNames: string[]) => void;
}

export async function readLeafRows(
  adapter: ViewerAdapter,
  propertyNames: readonly string[],
  { modelIds, onFailed, ...options }: LeafReadOptions = {},
): Promise<PropertyRow[]> {
  throwIfAborted(options.signal);
  const entry = readsFor(adapter);
  const progress = sumProgress(options.onProgress);
  const models = shownModels(adapter).filter(
    (model) => !modelIds || modelIds.includes(model.id),
  );
  const known = new Set(adapter.getModels().map((model) => model.id));
  for (const id of entry.keys.keys()) {
    if (!known.has(id)) entry.keys.delete(id);
  }
  const results = await Promise.allSettled(
    models.map((model) =>
      readKey(adapter, entry, model, propertyNames, {
        ...options,
        onProgress: progress(model.id),
      }),
    ),
  );
  throwIfAborted(options.signal);
  const parts: PropertyRow[][] = [];
  const failed: string[] = [];
  let failure: unknown = null;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const cached = keyReads(entry, models[index]?.id ?? '').settled;
      parts.push(
        cached?.rows === result.value && sameNames(cached.names, propertyNames)
          ? result.value
          : project(result.value, propertyNames),
      );
    } else {
      failed.push(models[index]?.name ?? '');
      failure ??= result.reason;
    }
  });
  const only = parts.length === 1 ? parts[0] : undefined;
  const rows = only ?? parts.flat();
  if (failure !== null && rows.length === 0) throw failure;
  if (failed.length > 0) onFailed?.(failed);
  return rows;
}

export function peekLeafRows(
  adapter: ViewerAdapter,
  modelIds?: readonly string[],
): PropertyRow[] | null {
  const entry = reads.get(adapter);
  const models = shownModels(adapter).filter(
    (model) => !modelIds || modelIds.includes(model.id),
  );
  if (!entry || models.length === 0) return null;
  const parts: PropertyRow[][] = [];
  for (const model of models) {
    const settled = entry.keys.get(model.id)?.settled;
    if (!settled) return null;
    parts.push(settled.rows);
  }
  return parts.flat();
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
  signal: AbortSignal | undefined,
): Promise<PropertyInfo[]> {
  const key = keyReads(entry, id);
  if (key.discovered) return Promise.resolve(key.discovered);
  if (signal?.aborted) return Promise.reject(abortError());
  let discovery = key.discovery;
  if (!discovery || discovery.controller.signal.aborted) {
    const generation = entry.generation;
    const controller = new AbortController();
    const promise = adapter.discoverProperties([id], {
      signal: controller.signal,
    });
    const created: Discovery = { controller, waiters: 0, promise };
    discovery = created;
    key.discovery = created;
    const release = () => {
      if (key.discovery === created) key.discovery = null;
    };
    promise.then((infos) => {
      release();
      if (
        entry.generation === generation &&
        !controller.signal.aborted &&
        infos.length > 0
      ) {
        key.discovered = infos;
      }
    }, release);
  }
  const shared = discovery;
  shared.waiters += 1;
  return new Promise<PropertyInfo[]>((resolve, reject) => {
    let done = false;
    const leave = () => {
      done = true;
      shared.waiters -= 1;
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (done) return;
      leave();
      if (shared.waiters === 0) {
        shared.controller.abort();
        if (key.discovery === shared) key.discovery = null;
      }
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    shared.promise.then(
      (infos) => {
        if (done) return;
        leave();
        resolve(infos);
      },
      (err: unknown) => {
        if (done) return;
        leave();
        reject(err);
      },
    );
  });
}

export async function discoverLeafProperties(
  adapter: ViewerAdapter,
  options: Pick<ReadOptions, 'signal'> = {},
): Promise<PropertyInfo[]> {
  const entry = readsFor(adapter);
  const results = await Promise.allSettled(
    shownModels(adapter).map((model) =>
      discoverKey(adapter, entry, model.id, options.signal),
    ),
  );
  throwIfAborted(options.signal);
  const lists: PropertyInfo[][] = [];
  let failure: unknown = null;
  for (const result of results) {
    if (result.status === 'fulfilled') lists.push(result.value);
    else failure ??= result.reason;
  }
  if (failure !== null && lists.length === 0) throw failure;
  return mergeInfos(lists);
}
