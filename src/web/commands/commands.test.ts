import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { filterCommands, fuzzyScore } from './fuzzy.js';
import { readRecents, recordRecent } from './recents.js';
import { CommandRegistry } from './registry.js';
import type { Command } from './types.js';

function command(id: string, title: string, extra: Partial<Command> = {}) {
  return { id, title, group: 'Test', run: () => undefined, ...extra };
}

describe('CommandRegistry', () => {
  it('merges sources and lets the higher priority win an id clash', () => {
    const registry = new CommandRegistry();
    registry.register('shell', () => [
      command('a', 'A'),
      command('export', 'Export', { disabled: 'Open a model first' }),
    ]);
    const off = registry.register(
      'viewer',
      () => [command('export', 'Export')],
      10,
    );
    const live = registry.list().find((c) => c.id === 'export');
    expect(live?.disabled).toBeUndefined();
    expect(registry.list()).toHaveLength(2);
    off();
    expect(registry.list().find((c) => c.id === 'export')?.disabled).toBe(
      'Open a model first',
    );
  });

  it('skips a provider that throws', () => {
    const registry = new CommandRegistry();
    registry.register('bad', () => {
      throw new Error('boom');
    });
    registry.register('good', () => [command('a', 'A')]);
    expect(registry.list().map((c) => c.id)).toEqual(['a']);
  });

  it('re-registering a name replaces it and evaluates lazily', () => {
    const registry = new CommandRegistry();
    let title = 'one';
    registry.register('s', () => [command('a', title)]);
    title = 'two';
    expect(registry.list()[0]?.title).toBe('two');
    registry.register('s', () => []);
    expect(registry.list()).toHaveLength(0);
  });
});

describe('fuzzy filter', () => {
  it('matches subsequences and rejects non-matches', () => {
    expect(fuzzyScore('xlsx', 'Export to Excel')).toBeNull();
    expect(fuzzyScore('etx', 'Export to Excel')).not.toBeNull();
  });

  it('ranks prefix and boundary matches first, and searches keywords', () => {
    const list = [
      command('1', 'Reset layout'),
      command('2', 'Toggle theme'),
      command('3', 'Close summary', { keywords: 'hide table' }),
    ];
    expect(filterCommands(list, 'the')[0]?.id).toBe('2');
    expect(filterCommands(list, 'hide').map((c) => c.id)).toEqual(['3']);
    expect(filterCommands(list, '')).toHaveLength(3);
  });
});

describe('recents', () => {
  beforeEach(() => installMemoryStorage());

  it('keeps the most recent unique ids, capped', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'c']) recordRecent(id);
    expect(readRecents()).toEqual(['c', 'f', 'e', 'd', 'b']);
  });

  it('ignores corrupt storage', () => {
    window.localStorage.setItem('bsh.commands.recent.v1', '{"x":1}');
    expect(readRecents()).toEqual([]);
  });
});
