import { describe, expect, it, vi } from 'vitest';
import { layoutCommands } from './layoutCommandList.js';
import type { LayoutApi } from './layoutContext.js';

function layout(over: Partial<LayoutApi> = {}): LayoutApi {
  return {
    mode: 'dock',
    locked: false,
    presenting: false,
    canAddInstance: true,
    canPresent: true,
    isOpen: (id: string) => id === 'summary',
    togglePane: vi.fn(),
    addInstance: vi.fn(),
    setPresenting: vi.fn(),
    setLocked: vi.fn(),
    resetLayout: vi.fn(),
    focusPane: vi.fn(),
    workspaces: {
      openDialog: vi.fn(),
      download: vi.fn(),
      copyJson: vi.fn(),
      copyLink: vi.fn(),
      revert: vi.fn(),
      canRevert: false,
    },
    ...over,
  } as unknown as LayoutApi;
}

const host = { openModal: () => undefined };

describe('layoutCommands', () => {
  it('disables save and revert in the stacked layout', () => {
    const list = layoutCommands(
      layout({
        mode: 'stacked',
        workspaces: { canRevert: true } as LayoutApi['workspaces'],
      }),
    );
    for (const id of ['layout.workspace.save', 'layout.workspace.revert']) {
      expect(list.find((c) => c.id === id)?.disabled).toBe(
        'Available in the wide layout',
      );
    }
  });

  it('names open and close from the current pane state', () => {
    const list = layoutCommands(layout());
    const titles = Object.fromEntries(list.map((c) => [c.id, c.title]));
    expect(titles['pane.toggle.summary']).toBe('Close Model summary pane');
    expect(titles['pane.toggle.dashboard']).toBe('Open Dashboard pane');
    expect(titles['layout.present']).toBe('Present');
  });

  it('runs pane, present, lock and reset actions', () => {
    const api = layout();
    const list = layoutCommands(api);
    const run = (id: string) => list.find((c) => c.id === id)?.run(host);
    run('pane.toggle.dashboard');
    run('layout.present');
    run('layout.lock');
    run('layout.reset');
    run('pane.focus.tree');
    expect(api.togglePane).toHaveBeenCalledWith('dashboard');
    expect(api.setPresenting).toHaveBeenCalledWith(true);
    expect(api.setLocked).toHaveBeenCalledWith(true);
    expect(api.resetLayout).toHaveBeenCalled();
    expect(api.focusPane).toHaveBeenCalledWith('tree');
  });

  it('disables edits while locked and layout work in the stacked layout', () => {
    const locked = layoutCommands(layout({ locked: true }));
    expect(locked.find((c) => c.id === 'pane.toggle.summary')?.disabled).toBe(
      'Unlock the layout first',
    );
    expect(locked.find((c) => c.id === 'layout.reset')?.disabled).toBe(
      'Unlock the layout first',
    );
    expect(locked.find((c) => c.id === 'layout.lock')?.title).toBe(
      'Unlock layout',
    );
    const stacked = layoutCommands(layout({ mode: 'stacked' }));
    expect(stacked.find((c) => c.id === 'layout.present')?.disabled).toBe(
      'Available in the wide layout',
    );
  });

  it('disables Present with a reason when no model is open, but keeps Exit enabled', () => {
    const present = (over: Partial<LayoutApi>) =>
      layoutCommands(layout(over)).find((c) => c.id === 'layout.present');
    expect(present({ canPresent: false })?.disabled).toBe('Open a model first');
    expect(
      present({ canPresent: false, presenting: true })?.disabled,
    ).toBeUndefined();
  });

  it('explains why a new chart is unavailable without a model', () => {
    const list = layoutCommands(layout({ canAddInstance: false }));
    expect(list.find((c) => c.id === 'pane.new.chart')?.disabled).toBe(
      'Open a model first',
    );
  });

  it('offers a Properties pane next to the other families', () => {
    const list = layoutCommands(layout({}));
    expect(list.find((c) => c.id === 'pane.new.properties')?.disabled).toBe(
      undefined,
    );
    expect(
      layoutCommands(layout({ canAddInstance: false })).find(
        (c) => c.id === 'pane.new.properties',
      )?.disabled,
    ).toBe('Open a model first');
  });
});
