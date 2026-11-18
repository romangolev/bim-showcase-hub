import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { PIN_LIMIT, readPins, togglePin } from './pins.js';

beforeEach(() => {
  installMemoryStorage();
});

describe('command pins', () => {
  it('starts empty and pins a command at the front', () => {
    expect(readPins()).toEqual([]);
    expect(togglePin('theme.toggle')).toEqual({
      pinned: true,
      evicted: null,
    });
    expect(togglePin('layout.lock')).toEqual({ pinned: true, evicted: null });
    expect(readPins()).toEqual(['layout.lock', 'theme.toggle']);
  });

  it('unpins a command when it is toggled again', () => {
    togglePin('a');
    expect(togglePin('a')).toEqual({ pinned: false, evicted: null });
    expect(readPins()).toEqual([]);
  });

  it('evicts the oldest pin when a ninth one arrives', () => {
    const ids = Array.from({ length: PIN_LIMIT }, (_, index) => `cmd-${index}`);
    for (const id of ids) togglePin(id);
    expect(readPins()).toHaveLength(PIN_LIMIT);
    expect(togglePin('cmd-new')).toEqual({
      pinned: true,
      evicted: 'cmd-0',
    });
    const pins = readPins();
    expect(pins).toHaveLength(PIN_LIMIT);
    expect(pins[0]).toBe('cmd-new');
    expect(pins).not.toContain('cmd-0');
  });

  it('sanitises stored pins to unique non-empty ids within the limit', () => {
    window.localStorage.setItem(
      'bsh.commands.pinned.v1',
      JSON.stringify([
        'a',
        'a',
        '',
        3,
        null,
        ...Array.from({ length: PIN_LIMIT + 4 }, (_, index) => `x${index}`),
      ]),
    );
    const pins = readPins();
    expect(pins.slice(0, 2)).toEqual(['a', 'x0']);
    expect(pins).toHaveLength(PIN_LIMIT);
    expect(pins.every((id) => id.length > 0)).toBe(true);
  });
});
