import type { ComponentType } from 'react';
import type { Command } from '../commands/types.js';
import type { IconName } from '../components/icons.js';
import { requestDeepSearch } from '../components/tree/deepSearchSignal.js';
import { currentAdapter } from '../viewer/activeAdapterStore.js';
import { clearColoring } from '../viewer/modelColoring.js';
import { federationCommands } from '../viewer/savedFederations.js';
import { PANEL_SEPARATOR, type PanelId } from './panelIds.js';
import {
  ChartInstancePane,
  ColorsPane,
  DashboardPane,
  ExportPane,
  MeasurementsPane,
  ModelPaneBody,
  ModelsPane,
  PropertiesInstancePane,
  SearchPane,
  SummaryInstancePane,
  SummaryPane,
  TreePane,
  VersionsPane,
  ViewsPane,
} from './panes.js';

export type PaneId =
  | 'tree'
  | 'viewer'
  | 'summary'
  | 'dashboard'
  | 'models'
  | 'versions'
  | 'colors'
  | 'export'
  | 'measurements'
  | 'views'
  | 'search'
  | 'chart'
  | 'modelSummary'
  | 'properties';

export type PlacementDirection = 'left' | 'right' | 'below';

export type Placement =
  | { kind: 'root' }
  | { kind: 'edge'; direction: PlacementDirection; size: number }
  | { kind: 'tab'; reference: PaneId }
  | {
      kind: 'beside';
      reference: PaneId;
      direction: PlacementDirection;
      size: number;
    };

export interface PaneInstances {
  component: ComponentType<{ instance: string }>;
  source: 'models' | 'user';
}

export interface PaneCommandContext {
  isOpen: (id: PaneId) => boolean;
  toggle: (id: PanelId) => void;
  create: (kind: PaneId) => void;
  focus: (id: PanelId) => void;
  toggleDisabled?: string;
  createDisabled?: string;
}

export interface PaneDefinition {
  id: PaneId;
  title: string;
  description: string;
  category: string;
  keywords: string;
  icon: IconName;
  component: ComponentType | null;
  minSize: { width: number; height: number };
  defaultPlacement: Placement;
  closable: boolean;
  requires: 'viewer' | 'none';
  opensWithModel?: boolean;
  instances?: PaneInstances;
  commands?: (ctx: PaneCommandContext) => readonly Command[];
}

export const TREE_WIDTH_DEFAULT = 320;

export const PANES: readonly PaneDefinition[] = [
  {
    id: 'tree',
    title: 'Documents',
    description: 'Browse hubs, projects, folders and model versions.',
    category: 'Workspace',
    keywords: 'tree files hubs projects folders versions browse',
    icon: 'folder',
    component: TreePane,
    minSize: { width: 260, height: 160 },
    defaultPlacement: {
      kind: 'edge',
      direction: 'left',
      size: TREE_WIDTH_DEFAULT,
    },
    closable: false,
    requires: 'none',
    commands: (ctx) => [
      {
        id: 'pane.focus.tree',
        title: 'Go to Documents',
        group: 'Panes',
        icon: 'folder',
        menu: 'hook',
        run: () => ctx.focus('tree'),
      },
      {
        id: 'docs.search.deep',
        title: 'Search project files',
        group: 'Documents',
        icon: 'search',
        keywords: 'deep search whole project files filters',
        menu: 'hook',
        run: () => {
          ctx.focus('tree');
          requestDeepSearch();
        },
      },
    ],
  },
  {
    id: 'viewer',
    title: 'Viewer',
    description: 'Show models in the Autodesk Viewer.',
    category: 'Viewer',
    keywords: 'model 3d view scene autodesk',
    icon: 'model',
    component: null,
    minSize: { width: 360, height: 280 },
    defaultPlacement: { kind: 'root' },
    closable: true,
    requires: 'none',
    instances: { component: ModelPaneBody, source: 'models' },
  },
  {
    id: 'summary',
    title: 'Model summary',
    description: 'Key properties of the active model at a glance.',
    category: 'Viewer',
    keywords: 'properties overview totals key values model',
    icon: 'table',
    component: SummaryPane,
    minSize: { width: 280, height: 160 },
    defaultPlacement: {
      kind: 'beside',
      reference: 'viewer',
      direction: 'right',
      size: 340,
    },
    closable: true,
    requires: 'viewer',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Chart the properties of the active model.',
    category: 'Analysis',
    keywords: 'chart charts graph properties analysis',
    icon: 'chart',
    component: DashboardPane,
    minSize: { width: 320, height: 120 },
    defaultPlacement: {
      kind: 'beside',
      reference: 'viewer',
      direction: 'below',
      size: 220,
    },
    closable: true,
    requires: 'viewer',
  },
  {
    id: 'models',
    title: 'Models',
    description: 'Models open in the active viewer.',
    category: 'Viewer',
    keywords: 'layers loaded combined scene list',
    icon: 'layers',
    component: ModelsPane,
    minSize: { width: 240, height: 160 },
    defaultPlacement: { kind: 'tab', reference: 'tree' },
    closable: true,
    requires: 'viewer',
    commands: () => federationCommands(),
  },
  {
    id: 'measurements',
    title: 'Measurements',
    description: 'Distances, angles and areas measured in the active viewer.',
    category: 'Viewer',
    keywords: 'measure distance angle area length dimension',
    icon: 'table',
    component: MeasurementsPane,
    minSize: { width: 240, height: 160 },
    defaultPlacement: { kind: 'tab', reference: 'models' },
    closable: true,
    requires: 'viewer',
  },
  {
    id: 'views',
    title: 'Sheets and views',
    description:
      'Sheets and 3D views of the active model, with favorites and a start view.',
    category: 'Viewer',
    keywords: 'sheets views plans levels 3d 2d start favorite',
    icon: 'model',
    component: ViewsPane,
    minSize: { width: 240, height: 160 },
    defaultPlacement: { kind: 'tab', reference: 'models' },
    closable: true,
    requires: 'viewer',
  },
  {
    id: 'versions',
    title: 'Version history',
    description:
      'Versions of one file, newest first. Open, pin or compare them.',
    category: 'Workspace',
    keywords: 'versions history revisions compare latest file',
    icon: 'layers',
    component: VersionsPane,
    minSize: { width: 260, height: 160 },
    defaultPlacement: { kind: 'tab', reference: 'tree' },
    closable: true,
    requires: 'none',
  },
  {
    id: 'colors',
    title: 'Colors',
    description:
      'Color the model by a property, a chart or rules, with a legend.',
    category: 'Analysis',
    keywords: 'color colour legend theme paint property rules',
    icon: 'layers',
    component: ColorsPane,
    minSize: { width: 260, height: 160 },
    defaultPlacement: { kind: 'tab', reference: 'models' },
    closable: true,
    requires: 'viewer',
    opensWithModel: false,
    commands: (_ctx) => [
      {
        id: 'colors.clear',
        title: 'Clear model colours',
        group: 'Viewer',
        icon: 'layers',
        menu: 'hook',
        run: () => {
          const adapter = currentAdapter();
          if (adapter) clearColoring(adapter);
        },
      },
    ],
  },
  {
    id: 'export',
    title: 'Export',
    description:
      'Choose the properties, scope and format, then export the model data.',
    category: 'Data',
    keywords: 'export excel csv json table properties download',
    icon: 'table',
    component: ExportPane,
    minSize: { width: 300, height: 160 },
    defaultPlacement: {
      kind: 'beside',
      reference: 'viewer',
      direction: 'right',
      size: 380,
    },
    closable: true,
    requires: 'viewer',
    opensWithModel: false,
  },
  {
    id: 'search',
    title: 'Search elements',
    description:
      'Find elements by name or property value and save them as a set.',
    category: 'Data',
    keywords: 'find search elements query selection set filter',
    icon: 'search',
    component: SearchPane,
    minSize: { width: 260, height: 160 },
    defaultPlacement: {
      kind: 'beside',
      reference: 'viewer',
      direction: 'right',
      size: 320,
    },
    closable: true,
    requires: 'viewer',
    opensWithModel: false,
    commands: (ctx) => [
      {
        id: 'pane.focus.search',
        title: 'Search elements',
        group: 'Panes',
        icon: 'search',
        keywords: 'find element',
        menu: 'hook',
        run: () =>
          ctx.isOpen('search') ? ctx.focus('search') : ctx.toggle('search'),
      },
    ],
  },
  {
    id: 'chart',
    title: 'Chart',
    description: 'A chart of chosen model properties.',
    category: 'Analysis',
    keywords: 'graph dashboard properties analysis add',
    icon: 'chart',
    component: null,
    minSize: { width: 320, height: 120 },
    defaultPlacement: {
      kind: 'beside',
      reference: 'viewer',
      direction: 'below',
      size: 220,
    },
    closable: true,
    requires: 'viewer',
    instances: {
      component: ChartInstancePane,
      source: 'user',
    },
  },
  {
    id: 'modelSummary',
    title: 'Model summary',
    description: 'A second summary with its own scope and properties.',
    category: 'Data',
    keywords: 'properties overview totals key values add',
    icon: 'table',
    component: null,
    minSize: { width: 280, height: 160 },
    defaultPlacement: {
      kind: 'beside',
      reference: 'viewer',
      direction: 'right',
      size: 340,
    },
    closable: true,
    requires: 'viewer',
    instances: {
      component: SummaryInstancePane,
      source: 'user',
    },
  },
  {
    id: 'properties',
    title: 'Properties',
    description: 'Properties of the current selection.',
    category: 'Data',
    keywords: 'selection elements attributes metadata add',
    icon: 'item',
    component: null,
    minSize: { width: 240, height: 160 },
    defaultPlacement: {
      kind: 'beside',
      reference: 'viewer',
      direction: 'right',
      size: 320,
    },
    closable: true,
    requires: 'viewer',
    instances: {
      component: PropertiesInstancePane,
      source: 'user',
    },
  },
];

const BY_ID = new Map(PANES.map((pane) => [pane.id, pane]));

export function isPaneId(value: unknown): value is PaneId {
  return typeof value === 'string' && BY_ID.has(value as PaneId);
}

export function paneById(id: PaneId): PaneDefinition {
  const pane = BY_ID.get(id);
  if (!pane) {
    throw new Error(`Unknown pane ${id}`);
  }
  return pane;
}

export function isRequired(id: PaneId): boolean {
  return !paneById(id).closable;
}

export const PANE_IDS: readonly PaneId[] = PANES.map((pane) => pane.id);

export { instancePanelId, type PanelId } from './panelIds.js';

export interface ParsedPanel {
  kind: PaneId;
  instance: string | null;
}

export function parsePanelId(id: unknown): ParsedPanel | null {
  if (typeof id !== 'string') return null;
  if (isPaneId(id)) return { kind: id, instance: null };
  const at = id.indexOf(PANEL_SEPARATOR);
  if (at <= 0) return null;
  const kind = id.slice(0, at);
  const instance = id.slice(at + 1);
  if (!isPaneId(kind) || !instance || !paneById(kind).instances) return null;
  return { kind, instance };
}

export function paneKind(id: unknown): PaneId | null {
  return parsePanelId(id)?.kind ?? null;
}

export function isInstancePanel(id: unknown): boolean {
  return Boolean(parsePanelId(id)?.instance);
}

export function definitionOf(id: PanelId): PaneDefinition {
  const kind = paneKind(id);
  if (!kind) throw new Error(`Unknown panel ${id}`);
  return paneById(kind);
}

export function followersOf(kind: PaneId): PaneId[] {
  return PANES.filter((pane) => pane.requires === kind && !pane.instances).map(
    (pane) => pane.id,
  );
}

export function isFollower(id: PaneId): boolean {
  const pane = paneById(id);
  return pane.requires !== 'none' && !pane.instances;
}

export function isUserFamily(kind: PaneId): boolean {
  return paneById(kind).instances?.source === 'user';
}

export function userFamilies(): PaneDefinition[] {
  return PANES.filter((pane) => pane.instances?.source === 'user');
}

export function isUserInstance(id: unknown): boolean {
  const parsed = parsePanelId(id);
  return Boolean(parsed?.instance && isUserFamily(parsed.kind));
}

export const FOLLOWERS: readonly PaneId[] = PANE_IDS.filter(isFollower);

function toggleCommand(
  pane: PaneDefinition,
  ctx: PaneCommandContext,
): Command | null {
  if (!pane.closable || pane.instances) return null;
  return {
    id: `pane.toggle.${pane.id}`,
    title: `${ctx.isOpen(pane.id) ? 'Close' : 'Open'} ${pane.title} pane`,
    group: 'Panes',
    icon: pane.icon,
    keywords: 'show hide toggle',
    menu: 'toggle',
    pane: pane.id,
    ...(ctx.toggleDisabled ? { disabled: ctx.toggleDisabled } : {}),
    run: () => ctx.toggle(pane.id),
  };
}

function createCommand(
  pane: PaneDefinition,
  ctx: PaneCommandContext,
): Command | null {
  if (pane.instances?.source !== 'user') return null;
  return {
    id: `pane.new.${pane.id}`,
    title: `New ${pane.title.toLowerCase()}`,
    group: 'Panes',
    icon: pane.icon,
    menu: 'create',
    pane: pane.id,
    ...(ctx.createDisabled ? { disabled: ctx.createDisabled } : {}),
    run: () => ctx.create(pane.id),
  };
}

export function paneCommandsFor(
  pane: PaneDefinition,
  ctx: PaneCommandContext,
): Command[] {
  const commands = [toggleCommand(pane, ctx), createCommand(pane, ctx)].filter(
    (command): command is Command => command !== null,
  );
  for (const command of pane.commands?.(ctx) ?? []) {
    const at = commands.findIndex((entry) => entry.id === command.id);
    if (at >= 0) commands[at] = command;
    else commands.push(command);
  }
  return commands;
}

export function paneCommands(ctx: PaneCommandContext): Command[] {
  return PANES.flatMap((pane) => paneCommandsFor(pane, ctx));
}

export function hasPlainPanel(id: PaneId): boolean {
  return paneById(id).component !== null;
}

export function isPanelClosable(id: PanelId): boolean {
  const parsed = parsePanelId(id);
  if (!parsed) return false;
  const definition = paneById(parsed.kind);
  return parsed.instance ? Boolean(definition.instances) : definition.closable;
}
