import {
  FORGET_EVENT,
  forgetPersonal,
  getStorageAdapter,
  isPersonalKey,
  isPreferenceKey,
} from '../storage.js';
import type { StorageArea } from '../storageAdapter.js';

export type StorageKind = 'personal' | 'preference' | 'other';

export interface StorageFamily {
  id: string;
  label: string;
  kind: StorageKind;
  keys: number;
  bytes: number;
}

export interface StorageTotals {
  keys: number;
  bytes: number;
}

export interface StorageReport {
  families: StorageFamily[];
  personal: StorageTotals;
  preference: StorageTotals;
  other: StorageTotals;
  total: StorageTotals;
}

interface FamilyRule {
  id: string;
  label: string;
  kind: StorageKind;
  matches: (key: string) => boolean;
}

const RULES: readonly FamilyRule[] = [
  {
    id: 'layout',
    label: 'Layout and pane setup',
    kind: 'personal',
    matches: (key) =>
      key === 'bsh.layout.v2' ||
      key === 'bsh.layout.instances.v1' ||
      key.startsWith('bsh.pane.'),
  },
  {
    id: 'workspaces',
    label: 'Named workspaces',
    kind: 'personal',
    matches: (key) => key === 'bsh.workspaces.v1',
  },
  {
    id: 'models',
    label: 'Models, recents and pins',
    kind: 'personal',
    matches: (key) =>
      key.startsWith('bsh.models.') || key === 'bsh.docs.pinned',
  },
  {
    id: 'views',
    label: 'Pane views',
    kind: 'personal',
    matches: (key) =>
      key.startsWith('bsh.summary.') || key.startsWith('bsh.dashboard.'),
  },
  {
    id: 'saved',
    label: 'Saved items',
    kind: 'personal',
    matches: (key) => key === 'bsh.saved.v1',
  },
  {
    id: 'paint',
    label: 'Paint marks and history',
    kind: 'personal',
    matches: (key) => key.startsWith('bsh.paint.'),
  },
  {
    id: 'commands',
    label: 'Recent commands',
    kind: 'personal',
    matches: (key) => key === 'bsh.commands.recent.v1',
  },
  {
    id: 'hints',
    label: 'Dismissed hints',
    kind: 'personal',
    matches: (key) => key.startsWith('bsh.hint.'),
  },
  {
    id: 'settings',
    label: 'App settings',
    kind: 'preference',
    matches: (key) => key === 'bsh-settings-v1',
  },
  {
    id: 'layout-lock',
    label: 'Layout lock',
    kind: 'preference',
    matches: (key) => key === 'bsh.layout.locked',
  },
  {
    id: 'tree',
    label: 'Documents view',
    kind: 'preference',
    matches: (key) => key === 'bsh.tree.view',
  },
  {
    id: 'topbar',
    label: 'Top bar',
    kind: 'preference',
    matches: (key) => key === 'bsh.topbar.v1',
  },
  {
    id: 'snapshot',
    label: 'Snapshot and present',
    kind: 'preference',
    matches: (key) => key === 'bsh.snapshot.v1',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    kind: 'preference',
    matches: (key) => key === 'bsh.notify.v1',
  },
  {
    id: 'command-pins',
    label: 'Pinned commands',
    kind: 'preference',
    matches: (key) => key === 'bsh.commands.pinned.v1',
  },
  {
    id: 'tools',
    label: 'Tool settings',
    kind: 'preference',
    matches: (key) => key.startsWith('bsh.tool.'),
  },
];

const FALLBACK: Record<StorageKind, string> = {
  personal: 'Other personal data',
  preference: 'Other preferences',
  other: 'Other app data',
};

function kindOf(key: string): StorageKind {
  if (isPersonalKey(key)) return 'personal';
  if (isPreferenceKey(key)) return 'preference';
  return 'other';
}

function familyOf(key: string, kind: StorageKind): FamilyRule {
  const known = RULES.find((rule) => rule.kind === kind && rule.matches(key));
  return (
    known ?? {
      id: `${kind}-other`,
      label: FALLBACK[kind],
      kind,
      matches: () => false,
    }
  );
}

function bytesOf(key: string, value: string): number {
  return (key.length + value.length) * 2;
}

const AREAS: readonly StorageArea[] = ['local', 'session'];

export function storageReport(): StorageReport {
  const adapter = getStorageAdapter();
  const families = new Map<string, StorageFamily>();
  const personal: StorageTotals = { keys: 0, bytes: 0 };
  const preference: StorageTotals = { keys: 0, bytes: 0 };
  const other: StorageTotals = { keys: 0, bytes: 0 };
  const total: StorageTotals = { keys: 0, bytes: 0 };
  for (const area of AREAS) {
    for (const key of adapter.keys(area)) {
      if (!key.startsWith('bsh')) continue;
      const value = adapter.get(area, key) ?? '';
      const bytes = bytesOf(key, value);
      const kind = kindOf(key);
      const rule = familyOf(key, kind);
      const entry = families.get(rule.id) ?? {
        id: rule.id,
        label: rule.label,
        kind,
        keys: 0,
        bytes: 0,
      };
      entry.keys += 1;
      entry.bytes += bytes;
      families.set(rule.id, entry);
      const bucket =
        kind === 'personal'
          ? personal
          : kind === 'preference'
            ? preference
            : other;
      bucket.keys += 1;
      bucket.bytes += bytes;
      total.keys += 1;
      total.bytes += bytes;
    }
  }
  const order = new Map(RULES.map((rule, index) => [rule.id, index]));
  const sorted = [...families.values()].sort(
    (a, b) =>
      (order.get(a.id) ?? RULES.length) - (order.get(b.id) ?? RULES.length) ||
      a.label.localeCompare(b.label),
  );
  return { families: sorted, personal, preference, other, total };
}

export function formatStorageBytes(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} KB`;
  return `${value} B`;
}

export interface ClearResult {
  keys: number;
  bytes: number;
}

export function clearLocalData({
  preferences,
}: {
  preferences: boolean;
}): ClearResult {
  const report = storageReport();
  forgetPersonal();
  let keys = report.personal.keys;
  let bytes = report.personal.bytes;
  if (preferences) {
    const adapter = getStorageAdapter();
    let removed = 0;
    for (const area of AREAS) {
      for (const key of adapter.keys(area)) {
        if (!isPreferenceKey(key)) continue;
        adapter.remove(area, key);
        removed += 1;
      }
    }
    keys += report.preference.keys;
    bytes += report.preference.bytes;
    if (removed > 0) window.dispatchEvent(new Event(FORGET_EVENT));
  }
  return { keys, bytes };
}
