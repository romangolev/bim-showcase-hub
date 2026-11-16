import { createMemoryHistory } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  json,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';

function renderApp() {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: ['/'] }),
  );
  render(<App appRouter={appRouter} client={createTestClient()} />);
}

beforeEach(() => {
  installMemoryStorage();
  stubLayout();
  mockMatchMedia(1440);
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeToggle in the top bar', () => {
  it('is a labelled focusable button before the user menu that flips the theme', async () => {
    mockFetch({
      '/api/session': { name: 'Ada', picture: null },
      ...treeRoutes,
    });
    renderApp();
    const toggle = await screen.findByRole('button', {
      name: 'Switch to light theme',
    });
    expect(toggle).toHaveAttribute('title', 'Switch to light theme');
    expect(toggle).not.toHaveAttribute('aria-pressed');
    expect(toggle.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const menu = await screen.findByRole('button', { name: /Ada/ });
    expect(toggle.compareDocumentPosition(menu)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    const back = await screen.findByRole('button', {
      name: 'Switch to dark theme',
    });
    expect(back).toHaveAttribute('title', 'Switch to dark theme');
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(back);
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('dark'),
    );
  });

  it('is present on the signed-out landing page', async () => {
    mockFetch({
      '/api/session': () => json({ error: 'unauthenticated' }, 401),
    });
    renderApp();
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Switch to light theme' }),
    ).toBeInTheDocument();
  });
});
