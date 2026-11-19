import { isRecord } from '../../shared/guards.js';

export type SavedData = Record<string, unknown>;

export const SAVED_KIND_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

export interface SavedKindSpec<T extends SavedData = SavedData> {
  kind: string;
  version: number;
  label: string;
  sanitize: (data: unknown) => T | null;
  migrate?: (data: unknown, fromVersion: number) => unknown;
}

export interface SavedKindEntry {
  kind: string;
  version: number;
  label: string;
  sanitize: (data: unknown) => unknown;
  migrate?: (data: unknown, fromVersion: number) => unknown;
}

export interface PreparedSavedData {
  data: SavedData;
  version: number;
  migrated: boolean;
}

const registry = new Map<string, SavedKindEntry>();

export function registerSavedKind<T extends SavedData>(
  spec: SavedKindSpec<T>,
): SavedKindSpec<T> {
  if (!SAVED_KIND_PATTERN.test(spec.kind)) {
    throw new Error(`Invalid saved kind: ${spec.kind}`);
  }
  if (!Number.isInteger(spec.version) || spec.version < 1) {
    throw new Error(`Invalid saved kind version for ${spec.kind}`);
  }
  if (!spec.label.trim()) {
    throw new Error(`Saved kind ${spec.kind} needs a label`);
  }
  if (registry.has(spec.kind)) {
    throw new Error(`Saved kind already registered: ${spec.kind}`);
  }
  registry.set(spec.kind, {
    kind: spec.kind,
    version: spec.version,
    label: spec.label,
    sanitize: spec.sanitize,
    ...(spec.migrate ? { migrate: spec.migrate } : {}),
  });
  return spec;
}

export function getSavedKind(kind: string): SavedKindEntry | undefined {
  return registry.get(kind);
}

export function unregisterSavedKind(kind: string): void {
  registry.delete(kind);
}

export function savedKindVersions(): Record<string, number> {
  const versions: Record<string, number> = {};
  for (const kind of [...registry.keys()].sort()) {
    const entry = registry.get(kind);
    if (entry) versions[kind] = entry.version;
  }
  return versions;
}

export function prepareSavedData(
  kind: string,
  data: unknown,
  version: number,
): PreparedSavedData | null {
  const spec = registry.get(kind);
  if (!spec) {
    return isRecord(data) ? { data, version, migrated: false } : null;
  }
  const from =
    Number.isInteger(version) && version > 0
      ? Math.min(version, spec.version)
      : 1;
  if (version > spec.version) return null;
  let value = data;
  let migrated = false;
  if (from < spec.version) {
    if (!spec.migrate) return null;
    try {
      value = spec.migrate(value, from);
      migrated = true;
    } catch {
      return null;
    }
  }
  let clean: unknown;
  try {
    clean = spec.sanitize(value);
  } catch {
    return null;
  }
  if (!isRecord(clean)) return null;
  return { data: clean, version: spec.version, migrated };
}
