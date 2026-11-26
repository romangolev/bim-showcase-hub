import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STACKED_QUERY } from '../layout/breakpoint.js';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { AppSkeleton } from './AppSkeleton.js';

vi.mock('./TopBar.js', () => ({ TopBar: () => null }));
vi.mock('./Hint.js', () => ({
  Hint: ({ id }: { id: string }) => <div data-testid="hint">{id}</div>,
}));
vi.mock('../i18n/i18n.js', () => ({ useT: () => (key: string) => key }));

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppSkeleton hints', () => {
  it('shows no hint for the pending shell', () => {
    render(<AppSkeleton />);
    expect(screen.queryByTestId('hint')).toBeNull();
  });

  it('shows the palette hint on the signed-in shell with no models', () => {
    render(<AppSkeleton hints />);
    expect(screen.getByTestId('hint')).toHaveTextContent('palette');
  });

  it('counts the last session fallback when picking the hint', () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.lastSession,
      JSON.stringify({ models: [{ urn: 'abc123' }], active: 'abc123' }),
    );
    render(<AppSkeleton hints />);
    expect(screen.getByTestId('hint')).toHaveTextContent('move-panes');
  });

  it('hides the hint when the layout is locked', () => {
    window.localStorage.setItem(BSH_KEYS.preference.layoutLocked, 'true');
    render(<AppSkeleton hints />);
    expect(screen.queryByTestId('hint')).toBeNull();
  });

  it('hides the hint in the stacked layout', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === STACKED_QUERY,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render(<AppSkeleton hints />);
    expect(screen.queryByTestId('hint')).toBeNull();
  });
});
