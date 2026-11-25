import { useCallback, useEffect, useRef, useState } from 'react';
import {
  browserAdapter,
  type StorageAdapter,
  type StorageArea,
} from './storageAdapter.js';

export const BSH_KEYS = {
  personal: {
    layout: 'bsh.layout.v2',
    openModels: 'bsh.models.open',
    lastSession: 'bsh.models.session.v1',
    modelOwner: 'bsh.models.owner',
    recentModels: 'bsh.models.recent',
    pinned: 'bsh.docs.pinned',
    hiddenModels: 'bsh.models.hidden',
    modelTints: 'bsh.models.tints.v1',
    modelViews: 'bsh.models.views.v1',
    hubHint: 'bsh.hint.hubs.dismissed.v1',
    onboardingHints: 'bsh.hint.onboarding.v1',
    summaryView: 'bsh.summary.view.v1',
    summaryProperties: 'bsh.summary.properties.v1',
    summaryAction: 'bsh.summary.action.v1',
    dashboardAction: 'bsh.dashboard.action.v1',
    dashboardView: 'bsh.dashboard.view.v1',
    saved: 'bsh.saved.v1',
    recentCommands: 'bsh.commands.recent.v1',
    layoutInstances: 'bsh.layout.instances.v1',
    workspaces: 'bsh.workspaces.v1',
  },
  preference: {
    settings: 'bsh-settings-v1',
    layoutLocked: 'bsh.layout.locked',
    treeView: 'bsh.tree.view',
    snapshot: 'bsh.snapshot.v1',
    notifications: 'bsh.notify.v1',
    commandPins: 'bsh.commands.pinned.v1',
    viewerKeys: 'bsh.commands.viewer.keys.v1',
    shareInclude: 'bsh.share.v1',
    charts: 'bsh.charts.v1',
    topbar: 'bsh.topbar.v1',
  },
} as const;

export const BSH_PREFIXES = {
  pane: 'bsh.pane.',
  paint: 'bsh.paint.',
  tool: 'bsh.tool.',
  models: 'bsh.models.',
  summary: 'bsh.summary.',
  dashboard: 'bsh.dashboard.',
  hint: 'bsh.hint.',
} as const;

export const BSH_PERSONAL_PREFIXES: readonly string[] = [
  BSH_PREFIXES.pane,
  BSH_PREFIXES.paint,
];

export const BSH_PREFERENCE_PREFIXES: readonly string[] = [BSH_PREFIXES.tool];

export const FORGET_EVENT = 'bsh:forget';

let adapter: StorageAdapter = browserAdapter;

export function setStorageAdapter(next: StorageAdapter): StorageAdapter {
  const previous = adapter;
  adapter = next;
  return previous;
}

export function getStorageAdapter(): StorageAdapter {
  return adapter;
}

const personalKeys = new Set<string>(Object.values(BSH_KEYS.personal));
const preferenceKeys = new Set<string>(Object.values(BSH_KEYS.preference));

export function isPersonalKey(key: string): boolean {
  return (
    personalKeys.has(key) ||
    BSH_PERSONAL_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export function isPreferenceKey(key: string): boolean {
  return (
    preferenceKeys.has(key) ||
    BSH_PREFERENCE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export interface Codec<T> {
  encode: (value: T) => string;
  decode: (text: string) => unknown;
}

export const RAW_STRING: Codec<string> = {
  encode: (value) => value,
  decode: (text) => text,
};

const JSON_CODEC: Codec<unknown> = {
  encode: (value) => JSON.stringify(value),
  decode: (text) => JSON.parse(text),
};

export interface RecordSpec<T> {
  key: string;
  initial: T;
  sanitize: (raw: unknown) => T;
  area?: StorageArea;
  codec?: Codec<T>;
  cache?: boolean;
}

export interface PersistedRecord<T> {
  readonly key: string;
  readonly initial: T;
  readonly sanitize: (raw: unknown) => T;
  read(): T;
  has(): boolean;
  write(value: T): boolean;
  remove(): void;
}

type Listener = (value: unknown) => void;

const listeners = new Map<string, Set<Listener>>();

function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  const active = set;
  active.add(listener);
  return () => {
    active.delete(listener);
  };
}

function notify(key: string, value: unknown): void {
  queueMicrotask(() => {
    for (const listener of [...(listeners.get(key) ?? [])]) listener(value);
  });
}

export function defineRecord<T>(spec: RecordSpec<T>): PersistedRecord<T> {
  const { key, initial, sanitize, area = 'local' } = spec;
  const codec = (spec.codec ?? JSON_CODEC) as Codec<T>;
  let cached: { text: string; value: T } | null = null;
  const decode = (text: string | null): unknown => {
    if (text === null) return undefined;
    try {
      return codec.decode(text);
    } catch {
      return undefined;
    }
  };
  const peek = (): unknown => decode(adapter.get(area, key));
  return {
    key,
    initial,
    sanitize,
    read() {
      if (spec.cache) {
        const text = adapter.get(area, key);
        if (text !== null && cached?.text === text) return cached.value;
        const raw = decode(text);
        if (raw === undefined || text === null) return initial;
        cached = { text, value: sanitize(raw) };
        return cached.value;
      }
      const raw = peek();
      return raw === undefined ? initial : sanitize(raw);
    },
    has: () => peek() !== undefined,
    write(value) {
      const stored = adapter.set(area, key, codec.encode(value));
      if (stored) notify(key, value);
      return stored;
    },
    remove() {
      adapter.remove(area, key);
      notify(key, initial);
    },
  };
}

const familyDrops: Array<() => void> = [];

export interface RecordFamilySpec<T, A> {
  prefix: string;
  keyOf: (arg: A) => string;
  initial: T;
  sanitize: (raw: unknown) => T;
}

export interface RecordFamily<T, A> {
  get(arg: A): PersistedRecord<T>;
  forget(arg: A): void;
}

export function defineRecordFamily<T, A>(
  spec: RecordFamilySpec<T, A>,
): RecordFamily<T, A> {
  if (!BSH_PERSONAL_PREFIXES.includes(spec.prefix)) {
    throw new Error(`Unregistered personal prefix: ${spec.prefix}`);
  }
  const cache = new Map<string, PersistedRecord<T>>();
  familyDrops.push(() => cache.clear());
  const record = (key: string) =>
    cache.get(key) ?? defineRecord({ ...spec, key });
  const keyFor = (arg: A): string => {
    const key = spec.keyOf(arg);
    if (!key.startsWith(spec.prefix)) {
      throw new Error(`Key ${key} is outside prefix ${spec.prefix}`);
    }
    return key;
  };
  return {
    get(arg) {
      const key = keyFor(arg);
      const hit = record(key);
      cache.set(key, hit);
      return hit;
    },
    forget(arg) {
      const key = keyFor(arg);
      record(key).remove();
      cache.delete(key);
    },
  };
}

const forgetHooks: Array<() => void> = [];

export function onForgetPersonal(hook: () => void): void {
  forgetHooks.push(hook);
}

export function forgetPersonal(): void {
  for (const which of ['local', 'session'] as const) {
    for (const key of adapter.keys(which)) {
      if (isPersonalKey(key)) adapter.remove(which, key);
    }
    for (const key of personalKeys) adapter.remove(which, key);
  }
  for (const drop of familyDrops) drop();
  for (const hook of forgetHooks) hook();
  window.dispatchEvent(new Event(FORGET_EVENT));
}

export function usePersisted<T>(
  record: PersistedRecord<T>,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const [value, setState] = useState<T>(() => record.read());
  const valueRef = useRef(value);
  const [seenKey, setSeenKey] = useState(record.key);
  if (seenKey !== record.key) {
    const next = record.read();
    valueRef.current = next;
    setSeenKey(record.key);
    setState(next);
  }
  const setValue = useCallback((next: T) => {
    valueRef.current = next;
    setState(next);
  }, []);
  useEffect(() => {
    const onForget = () => {
      if (isPersonalKey(record.key)) {
        setValue(record.initial);
        return;
      }
      const next = record.read();
      if (JSON.stringify(next) !== JSON.stringify(valueRef.current)) {
        setValue(next);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === record.key) setValue(record.read());
    };
    const off = subscribe(record.key, (next) => setValue(next as T));
    window.addEventListener('storage', onStorage);
    window.addEventListener(FORGET_EVENT, onForget);
    return () => {
      off();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(FORGET_EVENT, onForget);
    };
  }, [record, setValue]);
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === 'function'
          ? (next as (p: T) => T)(valueRef.current)
          : next;
      setValue(resolved);
      if (!record.write(resolved)) notify(record.key, resolved);
    },
    [record, setValue],
  );
  const reset = useCallback(() => update(record.initial), [update, record]);
  return [value, update, reset];
}
