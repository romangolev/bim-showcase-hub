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
  generation: number;
  names: Set<string>;
  controller: AbortController;
  waiters: number;
  listeners: Set<(progress: ReadProgress) => void>;
  last: ReadProgress | null;
  promise: Promise<PropertyRow[]>;
}

interface Discovery {
  generation: number;
  controller: AbortController;
  waiters: number;
  listeners: Set<(progress: ReadProgress) => void>;
  last: ReadProgress | null;
  promise: Promise<PropertyInfo[]>;
}

interface Settled {
  names: Set<string>;
  rows: PropertyRow[];
  stale: boolean;
}

interface KeyReads {
  version: string | undefined;
  generation: number;
  discoveryGeneration: number;
  inFlight: Pending | null;
  batch: Pending | null;
  settled: Settled | null;
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

function newKeyReads(version: string | undefined): KeyReads {
  return {
    version,
    generation: 0,
    discoveryGeneration: 0,
    inFlight: null,
    batch: null,
    settled: null,
    discovery: null,
    discovered: null,
  };
}

function invalidateKey(reads: KeyReads): void {
  reads.generation += 1;
  if (reads.settled) reads.settled.stale = true;
}

function keyReads(
  entry: AdapterReads,
  model: Pick<ModelInfo, 'id' | 'version'>,
): KeyReads {
  let reads = entry.keys.get(model.id);
  if (!reads) {
    reads = newKeyReads(model.version);
    entry.keys.set(model.id, reads);
    return reads;
  }
  if (reads.version !== model.version) {
    reads.version = model.version;
    reads.discovered = null;
    reads.discoveryGeneration += 1;
    invalidateKey(reads);
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
  const keyGeneration = key.generation;
  const pending: Pending = {
    generation: key.generation,
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
        key.generation === keyGeneration &&
        (rows.length > 0 || pending.last?.total === 0)
      ) {
        key.settled = { names: new Set(pending.names), rows, stale: false };
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
  const key = keyReads(entry, model);
  if (key.settled && !key.settled.stale && covers(key.settled.names, names)) {
    const { rows } = key.settled;
    options.onProgress?.({
      phase: 'rows',
      loaded: rows.length,
      total: rows.length,
      partial: false,
    });
    return Promise.resolve(rows);
  }
  if (
    key.inFlight &&
    key.inFlight.generation === key.generation &&
    !key.inFlight.controller.signal.aborted &&
    covers(key.inFlight.names, names)
  ) {
    return attach(key.inFlight, options);
  }
  if (
    !key.batch ||
    key.batch.generation !== key.generation ||
    key.batch.controller.signal.aborted
  ) {
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
        onProgress: progress.report(model.id),
      }),
    ),
  );
  progress.flush();
  throwIfAborted(options.signal);
  const parts: PropertyRow[][] = [];
  const failed: string[] = [];
  let failure: unknown = null;
  results.forEach((result, index) => {
    const model = models[index];
    if (!model) return;
    if (result.status === 'fulfilled') {
      const cached = keyReads(entry, model).settled;
      parts.push(
        cached?.rows === result.value && sameNames(cached.names, propertyNames)
          ? result.value
          : project(result.value, propertyNames),
      );
    } else {
      failed.push(model.name);
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
    const key = entry.keys.get(model.id);
    if (!key?.settled) return null;
    parts.push(key.settled.rows);
  }
  return parts.flat();
}

export function leafRowsStale(
  adapter: ViewerAdapter,
  modelIds?: readonly string[],
): boolean {
  const entry = reads.get(adapter);
  if (!entry) return false;
  return shownModels(adapter)
    .filter((model) => !modelIds || modelIds.includes(model.id))
    .some((model) => {
      const key = entry.keys.get(model.id);
      return (
        key !== undefined &&
        key.settled !== null &&
        (key.settled.stale || key.version !== model.version)
      );
    });
}

export function refreshLeafRows(
  adapter: ViewerAdapter,
  modelIds?: readonly string[],
): void {
  const entry = reads.get(adapter);
  if (!entry) return;
  for (const model of shownModels(adapter).filter(
    (item) => !modelIds || modelIds.includes(item.id),
  )) {
    const key = entry.keys.get(model.id);
    if (key) invalidateKey(key);
  }
}

export function refreshLeafProperties(adapter: ViewerAdapter): void {
  const entry = reads.get(adapter);
  if (!entry) return;
  for (const key of entry.keys.values()) {
    key.discoveryGeneration += 1;
    key.discovered = null;
  }
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
  model: ModelInfo,
  options: ReadOptions,
): Promise<PropertyInfo[]> {
  const { signal, onProgress } = options;
  const key = keyReads(entry, model);
  if (key.discovered) return Promise.resolve(key.discovered);
  if (signal?.aborted) return Promise.reject(abortError());
  let discovery = key.discovery;
  if (
    !discovery ||
    discovery.generation !== key.discoveryGeneration ||
    discovery.controller.signal.aborted
  ) {
    const generation = entry.generation;
    const keyGeneration = key.discoveryGeneration;
    const controller = new AbortController();
    const created: Discovery = {
      generation: keyGeneration,
      controller,
      waiters: 0,
      listeners: new Set(),
      last: null,
      promise: Promise.resolve([]),
    };
    created.promise = adapter.discoverProperties([model.id], {
      signal: controller.signal,
      onProgress: (progress) => {
        created.last = progress;
        for (const listener of created.listeners) listener(progress);
      },
    });
    discovery = created;
    key.discovery = created;
    const release = () => {
      if (key.discovery === created) key.discovery = null;
    };
    created.promise.then((infos) => {
      release();
      if (
        entry.generation === generation &&
        key.discoveryGeneration === keyGeneration &&
        !controller.signal.aborted &&
        infos.length > 0
      ) {
        key.discovered = infos;
      }
    }, release);
  }
  const shared = discovery;
  shared.waiters += 1;
  if (onProgress) {
    shared.listeners.add(onProgress);
    if (shared.last) onProgress(shared.last);
  }
  return new Promise<PropertyInfo[]>((resolve, reject) => {
    let done = false;
    const leave = () => {
      done = true;
      shared.waiters -= 1;
      if (onProgress) shared.listeners.delete(onProgress);
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
  options: ReadOptions = {},
): Promise<PropertyInfo[]> {
  const entry = readsFor(adapter);
  const progress = sumProgress(options.onProgress);
  const results = await Promise.allSettled(
    shownModels(adapter).map((model) =>
      discoverKey(adapter, entry, model, {
        ...options,
        ...(options.onProgress
          ? { onProgress: progress.report(model.id) }
          : {}),
      }),
    ),
  );
  progress.flush();
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
