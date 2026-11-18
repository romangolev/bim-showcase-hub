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
    saved: 'bsh.saved.v1',
    recentCommands: 'bsh.commands.recent.v1',
  },
  preference: {
    theme: 'bsh-theme',
    settings: 'bsh-settings-v1',
    layoutLocked: 'bsh.layout.locked',
    layoutInstances: 'bsh.layout.instances.v1',
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

const forgetHooks: Array<() => void> = [];

export function onForgetPersonal(hook: () => void): void {
  forgetHooks.push(hook);
}

export function forgetPersonal(): void {
  for (const key of Object.values(BSH_KEYS.personal)) {
    remove(() => window.localStorage, key);
    remove(() => window.sessionStorage, key);
  }
  for (const hook of forgetHooks) hook();
  window.dispatchEvent(new Event(FORGET_EVENT));
}
