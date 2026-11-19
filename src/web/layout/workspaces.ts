import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord } from '../storage.js';
import type { LayoutStep } from './defaultLayout.js';
import {
  LAYOUT_VERSION,
  type LayoutModel,
  parseLayout,
} from './layoutState.js';
import {
  type PaneAppearances,
  sanitizePaneAppearances,
} from './paneAppearance.js';
import type { PaneId } from './paneRegistry.js';

export const WORKSPACES_KEY = BSH_KEYS.personal.workspaces;
const WORKSPACES_VERSION = 1;
const WORKSPACE_NAME_MAX = 40;
export const MAX_WORKSPACES = 20;
const WORKSPACE_KIND = 'bsh.workspace';

export interface Workspace {
  id: string;
  name: string;
  layout: LayoutModel;
  appearances: PaneAppearances;
}

export interface WorkspaceStore {
  version: typeof WORKSPACES_VERSION;
  items: Workspace[];
}

type PresetId = 'review' | 'data' | 'present' | 'coordination';

export interface WorkspacePreset {
  id: PresetId;
  name: string;
  description: string;
  steps: readonly LayoutStep[] | null;
  collapsed: readonly PaneId[];
  dismissed: readonly PaneId[];
}

export const PRESETS: readonly WorkspacePreset[] = [
  {
    id: 'review',
    name: 'Review',
    description: 'Documents, viewer, summary and a collapsed dashboard.',
    steps: [
      { id: 'tree', placement: { kind: 'edge', direction: 'left', size: 320 } },
      { id: 'viewer', placement: { kind: 'root' } },
      { id: 'models', placement: { kind: 'tab', reference: 'tree' } },
      {
        id: 'summary',
        placement: {
          kind: 'beside',
          reference: 'viewer',
          direction: 'right',
          size: 340,
        },
      },
      {
        id: 'dashboard',
        placement: {
          kind: 'beside',
          reference: 'viewer',
          direction: 'below',
          size: 220,
        },
      },
    ],
    collapsed: ['dashboard'],
    dismissed: [],
  },
  {
    id: 'data',
    name: 'Data',
    description: 'The dashboard and model summary open at full height.',
    steps: [
      { id: 'tree', placement: { kind: 'edge', direction: 'left', size: 280 } },
      { id: 'viewer', placement: { kind: 'root' } },
      { id: 'models', placement: { kind: 'tab', reference: 'tree' } },
      {
        id: 'summary',
        placement: {
          kind: 'beside',
          reference: 'viewer',
          direction: 'right',
          size: 380,
        },
      },
      {
        id: 'dashboard',
        placement: {
          kind: 'beside',
          reference: 'viewer',
          direction: 'below',
          size: 300,
        },
      },
    ],
    collapsed: [],
    dismissed: [],
  },
  {
    id: 'present',
    name: 'Present',
    description: 'The viewer alone, with the present mode controls.',
    steps: null,
    collapsed: [],
    dismissed: [],
  },
  {
    id: 'coordination',
    name: 'Coordination',
    description:
      'Viewer, models list and summary; Documents and charts hidden.',
    steps: [
      { id: 'tree', placement: { kind: 'edge', direction: 'left', size: 280 } },
      { id: 'viewer', placement: { kind: 'root' } },
      {
        id: 'models',
        placement: {
          kind: 'beside',
          reference: 'viewer',
          direction: 'right',
          size: 300,
        },
      },
      {
        id: 'summary',
        placement: {
          kind: 'beside',
          reference: 'viewer',
          direction: 'right',
          size: 320,
        },
      },
    ],
    collapsed: ['tree'],
    dismissed: ['dashboard'],
  },
];

export interface WorkspaceApplyTarget {
  layout?: LayoutModel;
  steps?: readonly LayoutStep[] | null;
  collapsed?: readonly PaneId[];
  dismissed?: readonly PaneId[];
  treeWidth?: number;
}

export type WorkspaceDialog =
  | { kind: 'save' }
  | { kind: 'import' }
  | { kind: 'rename'; id: string }
  | null;

export interface WorkspaceApi {
  presets: readonly WorkspacePreset[];
  items: readonly Workspace[];
  active: string | null;
  canRevert: boolean;
  canPresent: boolean;
  dialog: WorkspaceDialog;
  openDialog: (dialog: WorkspaceDialog) => void;
  closeDialog: () => void;
  applyPreset: (id: PresetId) => void;
  applySaved: (id: string) => void;
  save: (name: string) => Workspace | null;
  rename: (id: string, name: string) => boolean;
  remove: (id: string) => void;
  revert: () => void;
  importText: (text: string) => string | null;
  exportText: () => string;
  download: () => void;
  copyJson: () => void;
  copyLink: () => void;
}

export function cleanWorkspaceName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, WORKSPACE_NAME_MAX);
  return name || null;
}

function newWorkspaceId(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyWorkspaces(): WorkspaceStore {
  return { version: WORKSPACES_VERSION, items: [] };
}

export const WORKSPACES_RECORD = defineRecord<WorkspaceStore>({
  key: WORKSPACES_KEY,
  initial: emptyWorkspaces(),
  sanitize: sanitizeWorkspaces,
});

function sanitizeWorkspace(raw: unknown, seen: Set<string>): Workspace | null {
  if (!isRecord(raw)) return null;
  const name = cleanWorkspaceName(raw.name);
  if (!name) return null;
  const id =
    typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 64
      ? raw.id
      : newWorkspaceId();
  if (seen.has(id)) return null;
  const layout = parseLayout(
    JSON.stringify({ version: LAYOUT_VERSION, layout: raw.layout }),
  );
  if (!layout?.dock) return null;
  seen.add(id);
  return {
    id,
    name,
    layout,
    appearances: sanitizePaneAppearances(raw.appearances),
  };
}

export function sanitizeWorkspaces(raw: unknown): WorkspaceStore {
  if (!isRecord(raw)) return emptyWorkspaces();
  if (raw.version !== WORKSPACES_VERSION) return emptyWorkspaces();
  if (!Array.isArray(raw.items)) return emptyWorkspaces();
  const seen = new Set<string>();
  const items: Workspace[] = [];
  for (const entry of raw.items) {
    if (items.length >= MAX_WORKSPACES) break;
    const workspace = sanitizeWorkspace(entry, seen);
    if (workspace) items.push(workspace);
  }
  return { version: WORKSPACES_VERSION, items };
}

export function saveWorkspace(
  store: WorkspaceStore,
  name: string,
  layout: LayoutModel,
  appearances: PaneAppearances,
): { store: WorkspaceStore; workspace: Workspace } | { error: 'full' } | null {
  const clean = cleanWorkspaceName(name);
  if (!clean || !layout.dock) return null;
  const existing = store.items.find(
    (item) => item.name.toLowerCase() === clean.toLowerCase(),
  );
  if (!existing && store.items.length >= MAX_WORKSPACES) {
    return { error: 'full' };
  }
  const workspace: Workspace = {
    id: existing?.id ?? newWorkspaceId(),
    name: clean,
    layout,
    appearances,
  };
  const items = existing
    ? store.items.map((item) => (item.id === workspace.id ? workspace : item))
    : [workspace, ...store.items];
  return {
    store: { version: WORKSPACES_VERSION, items },
    workspace,
  };
}

export function renameWorkspace(
  store: WorkspaceStore,
  id: string,
  name: string,
): WorkspaceStore {
  const clean = cleanWorkspaceName(name);
  if (!clean) return store;
  const target = store.items.find((item) => item.id === id);
  if (!target || target.name === clean) return store;
  const clash = store.items.some(
    (item) => item.id !== id && item.name.toLowerCase() === clean.toLowerCase(),
  );
  if (clash) return store;
  return {
    ...store,
    items: store.items.map((item) =>
      item.id === id ? { ...item, name: clean } : item,
    ),
  };
}

export function removeWorkspace(
  store: WorkspaceStore,
  id: string,
): WorkspaceStore {
  const items = store.items.filter((item) => item.id !== id);
  return items.length === store.items.length ? store : { ...store, items };
}

export function activeNameOf(
  items: readonly Workspace[],
  active: string | null,
): string | null {
  return items.find((item) => item.id === active)?.name ?? null;
}

export function serializeWorkspace(workspace: {
  name: string;
  layout: LayoutModel;
  appearances: PaneAppearances;
}): string {
  return JSON.stringify({
    kind: WORKSPACE_KIND,
    version: WORKSPACES_VERSION,
    name: workspace.name,
    layout: workspace.layout,
    appearances: workspace.appearances,
  });
}

type ParsedWorkspace = { workspace: Workspace } | { error: string };

export function parseWorkspace(raw: string): ParsedWorkspace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'This is not valid JSON.' };
  }
  if (!isRecord(parsed) || parsed.kind !== WORKSPACE_KIND) {
    return { error: 'This is not a BIM Showcase Hub workspace.' };
  }
  if (parsed.version !== WORKSPACES_VERSION) {
    return {
      error: `This workspace is version ${String(parsed.version)}; this app reads version ${WORKSPACES_VERSION}.`,
    };
  }
  const name = cleanWorkspaceName(parsed.name) ?? 'Imported layout';
  const layout = parseLayout(
    JSON.stringify({ version: LAYOUT_VERSION, layout: parsed.layout }),
  );
  if (!layout?.dock) return { error: 'This workspace has no valid layout.' };
  return {
    workspace: {
      id: newWorkspaceId(),
      name,
      layout,
      appearances: sanitizePaneAppearances(parsed.appearances),
    },
  };
}

export function workspaceFileName(name: string | null): string {
  const base = cleanWorkspaceName(name) ?? 'layout';
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'layout'}.json`;
}
