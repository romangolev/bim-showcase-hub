import { useMemo } from 'react';
import {
  getSavedKind,
  prepareSavedData,
  registerSavedKind,
  type SavedData,
  type SavedKindSpec,
} from './savedKindRegistry.js';
import {
  getSaved,
  MAX_NAME_LENGTH,
  moveSaved,
  newSavedId,
  readSaved,
  removeSaved,
  renameSaved,
  type SavedItem,
  upsertSaved,
  useSavedItems,
} from './savedStore.js';

export interface SavedKindItem<T extends SavedData> {
  id: string;
  name: string;
  version: number;
  updatedAt: number;
  data: T;
}

export interface SavedKindHandle<T extends SavedData> {
  readonly kind: string;
  readonly version: number;
  readonly label: string;
  list(): SavedKindItem<T>[];
  get(id: string): SavedKindItem<T> | undefined;
  save(name: string, data: T, id?: string): SavedKindItem<T> | null;
  rename(id: string, name: string): boolean;
  remove(id: string): boolean;
  move(id: string, delta: -1 | 1): boolean;
}

function toItem<T extends SavedData>(item: SavedItem): SavedKindItem<T> | null {
  const prepared = prepareSavedData(item.kind, item.data, item.version);
  if (!prepared) return null;
  return {
    id: item.id,
    name: item.name,
    version: prepared.version,
    updatedAt: item.updatedAt,
    data: prepared.data as T,
  };
}

export function defineSavedKind<T extends SavedData>(
  spec: SavedKindSpec<T>,
): SavedKindHandle<T> {
  registerSavedKind(spec);
  const entry = getSavedKind(spec.kind);
  if (!entry) throw new Error(`Saved kind not registered: ${spec.kind}`);
  const list = (): SavedKindItem<T>[] =>
    readSaved(spec.kind).flatMap((item) => toItem<T>(item) ?? []);
  return {
    kind: spec.kind,
    version: entry.version,
    label: entry.label,
    list,
    get(id) {
      return list().find((item) => item.id === id);
    },
    save(name, data, id) {
      const clean = spec.sanitize(data);
      if (!clean) return null;
      const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
      if (!trimmed) return null;
      const item: SavedItem = {
        id: id ?? newSavedId(spec.kind),
        kind: spec.kind,
        name: trimmed,
        version: entry.version,
        updatedAt: Date.now(),
        data: clean,
      };
      if (!upsertSaved(item)) return null;
      return {
        id: item.id,
        name: item.name,
        version: item.version,
        updatedAt: item.updatedAt,
        data: clean,
      };
    },
    rename(id, name) {
      return renameSaved(spec.kind, id, name);
    },
    remove(id) {
      return getSaved(id)?.kind === spec.kind && removeSaved(id);
    },
    move(id, delta) {
      return moveSaved(id, delta);
    },
  };
}

export function useSavedKindItems<T extends SavedData>(
  handle: SavedKindHandle<T>,
): SavedKindItem<T>[] {
  const saved = useSavedItems(handle.kind);
  return useMemo(() => saved.flatMap((item) => toItem<T>(item) ?? []), [saved]);
}
