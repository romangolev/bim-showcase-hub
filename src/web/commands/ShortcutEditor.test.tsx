import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { fireEvent, render, screen } from '../test/render.js';
import { ShortcutEditor } from './ShortcutEditor.js';
import {
  resetViewerShortcuts,
  viewerShortcutKeys,
} from './viewerShortcutMap.js';

let restore: ReturnType<typeof setStorageAdapter>;
let defaultAgent: string;

function agent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
}

beforeEach(() => {
  defaultAgent = navigator.userAgent;
  restore = setStorageAdapter(memoryAdapter());
  resetViewerShortcuts();
});

afterEach(() => {
  agent(defaultAgent);
  setStorageAdapter(restore);
});

describe('ShortcutEditor', () => {
  it('captures a new chord for one command', () => {
    render(<ShortcutEditor />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Change Isolate selection' }),
    );
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Change Isolate selection' }),
      { key: 'j' },
    );
    expect(viewerShortcutKeys('viewer.isolate')).toBe('j');
  });

  it('refuses a taken chord and says who owns it', () => {
    render(<ShortcutEditor />);
    const change = screen.getByRole('button', {
      name: 'Change Isolate selection',
    });
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'h' });
    expect(screen.getByRole('status').textContent).toContain('Hide selection');
    expect(viewerShortcutKeys('viewer.isolate')).toBe('i');
  });

  it('refuses a reserved chord', () => {
    agent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    render(<ShortcutEditor />);
    const change = screen.getByRole('button', {
      name: 'Change Isolate selection',
    });
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('status').textContent).toContain('Reserved');
    expect(viewerShortcutKeys('viewer.isolate')).toBe('i');
  });

  it('cancels with Escape and resets one row', () => {
    render(<ShortcutEditor />);
    const change = screen.getByRole('button', {
      name: 'Change Isolate selection',
    });
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'Escape' });
    expect(change.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'j' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset Isolate selection' }),
    );
    expect(viewerShortcutKeys('viewer.isolate')).toBe('i');
  });

  it('leaves the row unbound on Tab', () => {
    render(<ShortcutEditor />);
    const change = screen.getByRole('button', {
      name: 'Change Isolate selection',
    });
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'Tab' });
    expect(change.getAttribute('aria-pressed')).toBe('false');
    expect(viewerShortcutKeys('viewer.isolate')).toBe('i');
  });

  it('resets every row at once', () => {
    render(<ShortcutEditor />);
    const change = screen.getByRole('button', {
      name: 'Change Isolate selection',
    });
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'j' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset all shortcuts' }),
    );
    expect(viewerShortcutKeys('viewer.isolate')).toBe('i');
    expect(viewerShortcutKeys('viewer.hide')).toBe('h');
  });
});
