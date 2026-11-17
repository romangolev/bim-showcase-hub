export const BSH_KEYS = {
  personal: {
    layout: 'bsh.layout.v2',
    layoutV1: 'bsh.layout.v1',
    openModels: 'bsh.models.open',
    modelOwner: 'bsh.models.owner',
    recentModels: 'bsh.models.recent',
    pinned: 'bsh.docs.pinned',
    hiddenModels: 'bsh.models.hidden',
    hubHint: 'bsh.hint.hubs.dismissed.v1',
    summaryView: 'bsh.summary.view.v1',
    summaryAction: 'bsh.summary.action.v1',
    dashboardAction: 'bsh.dashboard.action.v1',
    dashboardView: 'bsh.dashboard.view.v1',
  },
  preference: {
    theme: 'bsh-theme',
    settings: 'bsh-settings-v1',
    layoutLocked: 'bsh.layout.locked',
    treeView: 'bsh.tree.view',
    treeWidth: 'bsh.tree.width',
    summaryCollapsed: 'bsh.summary.collapsed',
    dashboardCollapsed: 'bsh.dashboard.collapsed',
  },
} as const;

export const FORGET_EVENT = 'bsh:forget';

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(read: () => Storage, key: string) {
  try {
    read().removeItem(key);
  } catch {
    return;
  }
}

function scrubIfcIdentity() {
  const settings = readJson<unknown>(BSH_KEYS.preference.settings, null);
  if (typeof settings !== 'object' || settings === null) return;
  const ifc = (settings as { ifc?: unknown }).ifc;
  if (typeof ifc !== 'object' || ifc === null) return;
  writeJson(BSH_KEYS.preference.settings, {
    ...settings,
    ifc: { ...ifc, author: '', organisation: '' },
  });
}

export function forgetPersonal(): void {
  for (const key of Object.values(BSH_KEYS.personal)) {
    remove(() => window.localStorage, key);
    remove(() => window.sessionStorage, key);
  }
  scrubIfcIdentity();
  window.dispatchEvent(new Event(FORGET_EVENT));
}
