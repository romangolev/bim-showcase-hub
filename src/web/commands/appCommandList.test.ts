import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { TOOLS } from '../tools/index.js';
import type { ToolContext } from '../tools/kernel/ViewerTool.js';
import { type AppCommandState, appCommands } from './appCommandList.js';

const state: AppCommandState = {
  theme: 'dark',
  toggleTheme: vi.fn(),
  signedIn: true,
  signingOut: false,
  signOut: vi.fn(),
};

beforeEach(() => installMemoryStorage());

describe('appCommands', () => {
  it('covers theme, settings windows, each tool and sign out', () => {
    const ids = appCommands(state).map((command) => command.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'theme.toggle',
        'settings.settings',
        'settings.summary-settings',
        'settings.dashboard-settings',
        'paint.settings',
        'excel.settings',
        'glb.settings',
        'ifc.settings',
        'account.signout',
      ]),
    );
  });

  it('names the opposite theme and opens the tool modal through the host', () => {
    const list = appCommands(state);
    expect(list.find((c) => c.id === 'theme.toggle')?.title).toBe(
      'Switch to light theme',
    );
    const openModal = vi.fn();
    list.find((c) => c.id === 'glb.settings')?.run({ openModal });
    expect(openModal).toHaveBeenCalledWith('tool-glb-settings');
  });

  it('disables viewer exports without a model and sign out without a session', () => {
    const list = appCommands({ ...state, signedIn: false });
    expect(list.find((c) => c.id === 'glb.export')?.disabled).toBe(
      'Open a model first',
    );
    expect(list.find((c) => c.id === 'account.signout')?.disabled).toBe(
      'You are not signed in',
    );
  });

  it('applies a summary preset to the global summary settings', () => {
    const list = appCommands(state);
    const command = list.find(
      (c) => c.id === 'summary.preset.starter.doors-check',
    );
    expect(command?.title).toBe('Apply summary preset: Doors check');
    command?.run({ openModal: vi.fn() });
    expect(PANE_SETTINGS.summary.properties.read()).toEqual([
      'Category',
      'Family',
      'Type Name',
    ]);
  });
});

describe('tool export commands', () => {
  const ctx = {
    adapter: {},
    id: (base: string) => base,
    fileName: () => 'm.rvt',
    current: (tool: { settings: { initial: unknown } }) =>
      tool.settings.initial,
    report: vi.fn(),
  } as unknown as ToolContext;

  it('turns toolbar exports into live commands and flags a disabled tool', () => {
    const snapshot = TOOLS.snapshot();
    const live = TOOLS.commands(ctx, snapshot);
    const excel = live.find((c) => c.id === 'excel.export');
    expect(excel?.title).toBe('Export to Excel');
    expect(excel?.disabled).toBeUndefined();
    const off = TOOLS.commands(ctx, { ...snapshot, glb: { enabled: false } });
    expect(off.find((c) => c.id === 'glb.export')?.disabled).toBe(
      'Turned off in Geometry export settings',
    );
  });
});
