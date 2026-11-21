import { describe, expect, it, vi } from 'vitest';
import type { Command, CommandHost } from '../commands/types.js';
import { buildColoring } from '../extensions/colorBy.js';
import { COLORS_SETTINGS } from '../panels/colorsSettings.js';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { loadedMockAdapter } from '../test/mockAdapter.js';
import { publishActiveAdapter } from '../viewer/activeAdapterStore.js';
import { buildMockElements } from '../viewer/mockModel.js';
import { applyColoring, currentColoring } from '../viewer/modelColoring.js';
import { layoutCommands } from './layoutCommandList.js';
import type { LayoutApi } from './layoutContext.js';
import { layoutMenuEntries } from './PaneMenu.js';
import {
  FOLLOWERS,
  followersOf,
  hasPlainPanel,
  instancePanelId,
  isPaneId,
  isPanelClosable,
  isRequired,
  isUserFamily,
  isUserInstance,
  PANE_IDS,
  PANES,
  type PaneDefinition,
  paneById,
  paneCommands,
  paneCommandsFor,
  paneKind,
  parsePanelId,
  stackablePanes,
} from './paneRegistry.js';

describe('pane registry', () => {
  it('has unique ids and a definition for every id', () => {
    expect(new Set(PANE_IDS).size).toBe(PANES.length);
    for (const id of PANE_IDS) {
      expect(paneById(id).id).toBe(id);
    }
  });

  it('makes Documents the only required pane', () => {
    const tree = paneById('tree');
    expect(tree.closable).toBe(false);
    expect(isRequired('tree')).toBe(true);
    expect(PANES.filter((pane) => isRequired(pane.id))).toEqual([tree]);
    expect(isRequired('viewer')).toBe(false);
    expect(hasPlainPanel('viewer')).toBe(false);
    expect(hasPlainPanel('tree')).toBe(true);
  });

  it('places exactly one pane at the root and references only known panes', () => {
    expect(
      PANES.filter((pane) => pane.defaultPlacement.kind === 'root'),
    ).toHaveLength(1);
    for (const pane of PANES) {
      const placement = pane.defaultPlacement;
      if (placement.kind === 'beside') {
        expect(isPaneId(placement.reference)).toBe(true);
        expect(placement.reference).not.toBe(pane.id);
      }
    }
  });

  it('gives every pane a title, an icon and a positive minimum size', () => {
    for (const pane of PANES) {
      expect(pane.title.length).toBeGreaterThan(0);
      expect(pane.description.length).toBeGreaterThan(0);
      expect(pane.category.length).toBeGreaterThan(0);
      expect(pane.keywords.length).toBeGreaterThan(0);
      expect(pane.icon.length).toBeGreaterThan(0);
      expect(pane.minSize.width).toBeGreaterThan(0);
      expect(pane.minSize.height).toBeGreaterThan(0);
    }
  });

  it('rejects unknown ids', () => {
    expect(isPaneId('tree')).toBe(true);
    expect(isPaneId('terminal')).toBe(false);
    expect(isPaneId(3)).toBe(false);
    expect(() => paneById('terminal' as never)).toThrow();
  });

  it('maps model tab ids to the viewer pane kind', () => {
    const id = instancePanelId('viewer', 'dXJuOmE_dmVyc2lvbj0y');
    expect(id).toBe('viewer:dXJuOmE_dmVyc2lvbj0y');
    expect(parsePanelId(id)).toEqual({
      kind: 'viewer',
      instance: 'dXJuOmE_dmVyc2lvbj0y',
    });
    expect(paneKind(id)).toBe('viewer');
    expect(parsePanelId('viewer')).toEqual({ kind: 'viewer', instance: null });
    expect(isPanelClosable(id)).toBe(true);
    expect(isPanelClosable('tree')).toBe(false);
    expect(isPanelClosable('summary')).toBe(true);
  });

  it('derives the viewer followers from the registry in one place', () => {
    expect(FOLLOWERS).toEqual([
      'summary',
      'dashboard',
      'models',
      'colors',
      'export',
    ]);
    expect(followersOf('viewer')).toEqual([
      'summary',
      'dashboard',
      'models',
      'colors',
      'export',
    ]);
    expect(followersOf('tree')).toEqual([]);
    expect(paneById('colors').opensWithModel).toBe(false);
    expect(paneById('export').opensWithModel).toBe(false);
    expect(paneById('summary').opensWithModel).toBeUndefined();
  });

  it('orders the stacked layout from the registry', () => {
    expect(stackablePanes().map((pane) => pane.id)).toEqual([
      'viewer',
      'dashboard',
      'summary',
    ]);
    expect(stackablePanes().some((pane) => pane.id === 'tree')).toBe(false);
  });

  it('adds a pane hook’s commands after the generated toggle and create entries', () => {
    const ctx = {
      isOpen: () => false,
      toggle: vi.fn(),
      create: vi.fn(),
      focus: vi.fn(),
    };
    const focus: Command = {
      id: 'pane.focus.test',
      title: 'Go to Test',
      group: 'Panes',
      run: () => undefined,
    };
    const base: PaneDefinition = {
      id: 'chart',
      title: 'Chart',
      description: 'A chart.',
      category: 'Analysis',
      keywords: 'chart graph',
      icon: 'chart',
      component: null,
      minSize: { width: 1, height: 1 },
      defaultPlacement: { kind: 'root' },
      closable: true,
      requires: 'none',
      commands: () => [focus],
    };
    expect(
      paneCommandsFor(
        {
          ...base,
          instances: {
            component: () => null,
            source: 'user',
          },
        },
        ctx,
      ).map((command) => command.id),
    ).toEqual(['pane.new.chart', 'pane.focus.test']);
    expect(
      paneCommandsFor({ ...base, instances: undefined }, ctx).map(
        (command) => command.id,
      ),
    ).toEqual(['pane.toggle.chart', 'pane.focus.test']);
    const override: Command = {
      ...focus,
      id: 'pane.new.chart',
      title: 'Custom new chart',
    };
    const replaced = paneCommandsFor(
      {
        ...base,
        instances: {
          component: () => null,
          source: 'user',
        },
        commands: () => [override],
      },
      ctx,
    );
    expect(replaced.map((command) => command.id)).toEqual(['pane.new.chart']);
    expect(replaced[0]?.title).toBe('Custom new chart');
  });

  it('keeps the generated commands and the hook commands for every pane', () => {
    const ctx = {
      isOpen: () => true,
      toggle: vi.fn(),
      create: vi.fn(),
      focus: vi.fn(),
    };
    const commands = paneCommands(ctx);
    expect(
      commands.find((command) => command.id === 'pane.toggle.summary'),
    ).toBeDefined();
    expect(
      commands.find((command) => command.id === 'pane.new.chart'),
    ).toBeDefined();
    expect(
      commands.find((command) => command.id === 'pane.focus.tree'),
    ).toBeDefined();
  });

  it('rejects instances of panes without instances', () => {
    expect(parsePanelId('summary:x')).toBeNull();
    expect(parsePanelId('viewer:')).toBeNull();
    expect(parsePanelId('terminal:x')).toBeNull();
    expect(paneKind(42)).toBeNull();
  });

  it('lists Help and Activity log as closable workspace panes', () => {
    for (const id of ['help', 'activity'] as const) {
      const pane = paneById(id);
      expect(pane.category).toBe('Workspace');
      expect(pane.closable).toBe(true);
      expect(pane.stackOrder).toBeUndefined();
    }
  });

  it('registers user families as instance panes that are not companions', () => {
    expect(isUserFamily('chart')).toBe(true);
    expect(isUserFamily('viewer')).toBe(false);
    expect(parsePanelId('chart:3')).toEqual({ kind: 'chart', instance: '3' });
    expect(parsePanelId('chart')).toEqual({ kind: 'chart', instance: null });
    expect(isUserInstance('chart:3')).toBe(true);
    expect(isUserInstance('viewer:x')).toBe(false);
    expect(isPanelClosable('chart:3')).toBe(true);
    expect(hasPlainPanel('chart')).toBe(false);
    expect(FOLLOWERS).not.toContain('chart');
  });
});

function menuLayout(over: Partial<LayoutApi> = {}): LayoutApi {
  return {
    mode: 'dock',
    locked: false,
    presenting: false,
    canAddInstance: true,
    canPresent: true,
    isOpen: (id: string) => id === 'summary',
    togglePane: vi.fn(),
    addInstance: vi.fn(),
    focusPane: vi.fn(),
    setPresenting: vi.fn(),
    setLocked: vi.fn(),
    resetLayout: vi.fn(),
    workspaces: {
      canRevert: false,
      openDialog: vi.fn(),
      download: vi.fn(),
      copyJson: vi.fn(),
      copyLink: vi.fn(),
      revert: vi.fn(),
    },
    ...over,
  } as unknown as LayoutApi;
}

function entryIds(entries: ReturnType<typeof layoutMenuEntries>): string[] {
  return entries.flatMap((entry) =>
    entry.kind === 'separator' ? [] : [entry.id],
  );
}

function select(entries: ReturnType<typeof layoutMenuEntries>, id: string) {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry || entry.kind === 'separator') {
    throw new Error(`Missing menu entry ${id}`);
  }
  entry.onSelect();
}

describe('Panes menu entries', () => {
  it('maps every command to one entry and keeps the pane labels', () => {
    const layout = menuLayout();
    const commands = layoutCommands(layout);
    const entries = layoutMenuEntries(layout, undefined, commands);
    const ids = entryIds(entries);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of commands) {
      expect(ids).toContain(command.id);
    }
    const summary = entries.find((entry) => entry.id === 'pane.toggle.summary');
    expect(summary).toMatchObject({ label: 'Model summary', checked: true });
    const dashboard = entries.find(
      (entry) => entry.id === 'pane.toggle.dashboard',
    );
    expect(dashboard).toMatchObject({
      label: 'Dashboard',
      checked: false,
    });
  });

  it('reflects a pane commands() hook without dropping generated entries', () => {
    const layout = menuLayout();
    const entries = layoutMenuEntries(
      layout,
      undefined,
      layoutCommands(layout),
    );
    expect(
      entries.find((entry) => entry.id === 'pane.focus.tree'),
    ).toMatchObject({ label: 'Go to Documents' });
    expect(entryIds(entries)).toEqual(
      expect.arrayContaining([
        'pane.toggle.summary',
        'pane.new.chart',
        'pane.focus.tree',
      ]),
    );
  });

  it('keeps the menu-only labels and descriptions for layout actions', () => {
    const entries = layoutMenuEntries(menuLayout(), undefined);
    expect(
      entries.find((entry) => entry.id === 'layout.present'),
    ).toMatchObject({ label: 'Present' });
    expect(entries.find((entry) => entry.id === 'layout.lock')).toMatchObject({
      label: 'Lock layout',
      checked: false,
    });
    expect(entries.find((entry) => entry.id === 'layout.reset')).toMatchObject({
      label: 'Reset layout',
      description:
        'Resets the arrangement. Open models stay open; remembered viewer position and closed panes are cleared.',
    });
  });

  it('runs the command behind the entry', () => {
    const layout = menuLayout();
    const entries = layoutMenuEntries(
      layout,
      undefined,
      layoutCommands(layout),
    );
    select(entries, 'layout.present');
    expect(layout.setPresenting).toHaveBeenCalledWith(true);
    select(entries, 'pane.toggle.dashboard');
    expect(layout.togglePane).toHaveBeenCalledWith('dashboard');
  });
});

describe('colors.clear command', () => {
  it('clears a chart coloring and keeps the user’s own isolation', async () => {
    setStorageAdapter(memoryAdapter());
    COLORS_SETTINGS.write({
      ...COLORS_SETTINGS.read(),
      source: 'rules',
      rules: { ...COLORS_SETTINGS.read().rules, ghostRest: true },
    });
    const adapter = await loadedMockAdapter();
    const modelId = adapter.getModels()[0]?.id ?? '';
    const [first, second] = buildMockElements().map(({ dbId }) => dbId);
    const mine = [{ modelId, dbId: first ?? 0 }];
    adapter.isolateModelIds(mine);
    applyColoring(
      adapter,
      buildColoring(
        'chart',
        'Kind',
        [{ dbId: second ?? 0, name: 'b', properties: { Kind: 'A' }, modelId }],
        () => 'A',
        ['A'],
        ['#ff0000'],
      ),
    );
    publishActiveAdapter(adapter);
    const clear = paneById('colors')
      .commands?.({} as never)
      .find((command) => command.id === 'colors.clear');
    await clear?.run({} as CommandHost);
    publishActiveAdapter(null);
    expect(currentColoring(adapter)).toBeNull();
    expect(adapter.getIsolated()).toEqual(mine);
  });
});
