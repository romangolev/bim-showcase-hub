import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { ThemeProvider, useTheme } from './ThemeContext.js';
import { THEME_STORAGE_KEY } from './theme.js';

function stubScheme(initial: 'light' | 'dark') {
  let scheme = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query.includes('light') && scheme === 'light';
      },
      media: query,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    })),
  );
  return {
    listenerCount: () => listeners.size,
    set(next: 'light' | 'dark') {
      scheme = next;
      for (const listener of listeners) listener();
    },
  };
}

function Probe() {
  const { theme, source, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <output data-testid="theme">{theme}</output>
      <output data-testid="source">{source}</output>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
      <button type="button" onClick={() => setTheme('dark')}>
        force dark
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

function press(name: string) {
  act(() => {
    screen.getByRole('button', { name }).click();
  });
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeProvider', () => {
  it('defaults to the system scheme and marks the document', () => {
    installMemoryStorage();
    stubScheme('light');
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('source')).toHaveTextContent('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('falls back to dark when matchMedia is unavailable', () => {
    installMemoryStorage();
    vi.stubGlobal('matchMedia', undefined);
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('persists an explicit choice and prefers it over the system', () => {
    const storage = installMemoryStorage();
    stubScheme('dark');
    const { unmount } = renderProbe();
    press('toggle');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('source')).toHaveTextContent('user');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    unmount();
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('source')).toHaveTextContent('user');
  });

  it('ignores a stored value that is not a theme', () => {
    const storage = installMemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'sepia');
    stubScheme('dark');
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('source')).toHaveTextContent('system');
  });

  it('follows system changes only while there is no explicit choice', () => {
    installMemoryStorage();
    const media = stubScheme('dark');
    renderProbe();
    act(() => media.set('light'));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    press('force dark');
    expect(media.listenerCount()).toBe(0);
    act(() => media.set('light'));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  it('keeps working when storage throws', () => {
    const failing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: failing,
    });
    stubScheme('dark');
    renderProbe();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    press('toggle');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('throws outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
