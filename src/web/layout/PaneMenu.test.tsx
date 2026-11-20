import { describe, expect, it, vi } from 'vitest';
import type { Command } from '../commands/types.js';
import type { MenuEntry } from '../components/Menu.js';
import { layoutCommands } from './layoutCommandList.js';
import type { LayoutApi } from './layoutContext.js';
import { layoutMenuEntries, paneMenuEntries } from './PaneMenu.js';

const layout = {
  mode: 'dock',
  locked: false,
  presenting: false,
  canPresent: true,
  canAddInstance: true,
  maximized: null,
  isOpen: () => true,
  isCollapsed: () => false,
  location: () => 'dock',
  togglePane: vi.fn(),
  toggleMaximize: vi.fn(),
  addInstance: vi.fn(),
  setPresenting: vi.fn(),
  setLocked: vi.fn(),
  setCollapsed: vi.fn(),
  resetLayout: vi.fn(),
  movePane: vi.fn(),
  startResize: vi.fn(),
  focusPane: vi.fn(),
  workspaces: {
    canRevert: false,
    openDialog: vi.fn(),
    download: vi.fn(),
    copyJson: vi.fn(),
    copyLink: vi.fn(),
    revert: vi.fn(),
  },
} as unknown as LayoutApi;

const host = { openModal: () => undefined, openPaneSettings: () => undefined };

const tabEntries: MenuEntry[] = [
  {
    id: 'tab.remember',
    label: 'Remember view state',
    checked: true,
    onSelect: vi.fn(),
  },
];

function labels(entries: MenuEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.kind === 'separator' ? [] : [entry.label],
  );
}

describe('layoutMenuEntries', () => {
  it('names the lock entry from the command and explains a blocked reset', () => {
    const locked = { ...layout, locked: true } as LayoutApi;
    const entries = layoutMenuEntries(locked, host);
    const names = labels(entries);
    expect(names).toContain('Unlock layout');
    expect(
      entries.find(
        (entry) => entry.kind !== 'separator' && entry.id === 'layout.reset',
      ),
    ).toMatchObject({
      description: 'Unlock the layout first',
      disabled: true,
    });
  });

  it('keeps a layout command that has no menu slot yet', () => {
    const future: Command = {
      id: 'layout.future',
      title: 'Future layout action',
      group: 'Layout',
      run: vi.fn(),
    };
    expect(
      labels(
        layoutMenuEntries(layout, host, [...layoutCommands(layout), future]),
      ),
    ).toContain('Future layout action');
  });
});

describe('paneMenuEntries', () => {
  it('appends the model tab entries after the close entry', () => {
    const entries = paneMenuEntries(layout, 'viewer:u1', host, tabEntries);
    const names = labels(entries);
    expect(names).toContain('Remember view state');
    expect(names.indexOf('Close')).toBeLessThan(
      names.indexOf('Remember view state'),
    );
    expect(names.indexOf('Remember view state')).toBeLessThan(
      names.indexOf('Lock layout'),
    );
  });

  it('keeps the model tab entries while the layout is locked', () => {
    const locked = { ...layout, locked: true } as LayoutApi;
    const entries = paneMenuEntries(locked, 'viewer:u1', host, tabEntries);
    const names = labels(entries);
    expect(names).toEqual(['Maximize', 'Unlock layout', 'Remember view state']);
  });

  it('leaves a pane menu without tab entries alone', () => {
    const entries = paneMenuEntries(layout, 'viewer:u1', host, []);
    expect(labels(entries)).not.toContain('Remember view state');
  });
});
