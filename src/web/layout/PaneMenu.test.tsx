import { describe, expect, it, vi } from 'vitest';
import type { Command } from '../commands/types.js';
import { layoutCommands } from './layoutCommandList.js';
import type { LayoutApi } from './layoutContext.js';
import { layoutMenuEntries } from './PaneMenu.js';

const layout = {
  mode: 'dock',
  locked: false,
  presenting: false,
  canPresent: true,
  isOpen: () => true,
  togglePane: vi.fn(),
  addInstance: vi.fn(),
  setPresenting: vi.fn(),
  setLocked: vi.fn(),
  resetLayout: vi.fn(),
  focusPane: vi.fn(),
} as unknown as LayoutApi;

const host = { openModal: () => undefined };

describe('layoutMenuEntries', () => {
  it('names the lock entry from the command and explains a blocked reset', () => {
    const locked = { ...layout, locked: true } as LayoutApi;
    const entries = layoutMenuEntries(locked, host);
    const labels = entries.flatMap((entry) =>
      entry.kind === 'separator' ? [] : [entry.label],
    );
    expect(labels).toContain('Unlock layout');
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
    const labels = layoutMenuEntries(layout, host, [
      ...layoutCommands(layout),
      future,
    ]).flatMap((entry) => (entry.kind === 'separator' ? [] : [entry.label]));
    expect(labels).toContain('Future layout action');
  });
});
