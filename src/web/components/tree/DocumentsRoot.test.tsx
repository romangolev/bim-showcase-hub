import { createMemoryHistory } from '@tanstack/react-router';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.js';
import { createAppRouter } from '../../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../../test/mockApi.js';
import { DOC_ROOT_KEY } from './docRoot.js';

function renderApp() {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: ['/'] }),
  );
  return render(<App appRouter={appRouter} client={createTestClient()} />);
}

async function pick(label: string, item: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: item }));
}

beforeEach(() => {
  stubLayout();
  installMemoryStorage();
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('__MOCK_APS__', true);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  mockMatchMedia(1440);
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('Documents root', () => {
  it('roots the tree at a project and restores it after a reload', async () => {
    renderApp();
    expect(
      await screen.findByRole('treeitem', { name: 'Studio hub' }),
    ).toBeInTheDocument();

    await pick('Documents hub', 'Studio hub');
    await screen.findByRole('treeitem', { name: 'Riverside Tower' });
    await pick('Documents project', 'Riverside Tower');

    expect(
      await screen.findByRole('treeitem', { name: 'Project Files' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('treeitem', { name: 'Studio hub' }),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem(DOC_ROOT_KEY) ?? 'null'),
    ).toEqual({ hubId: 'h1', projectId: 'p1' });

    cleanup();
    renderApp();
    expect(
      await screen.findByRole('treeitem', { name: 'Project Files' }),
    ).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Documents project' });
    await waitFor(() =>
      expect(within(trigger).getByText('Riverside Tower')).toBeInTheDocument(),
    );
  });

  it('restores every hub from the All hubs choice', async () => {
    window.localStorage.setItem(
      DOC_ROOT_KEY,
      JSON.stringify({ hubId: 'h1', projectId: 'p1' }),
    );
    renderApp();
    expect(
      await screen.findByRole('treeitem', { name: 'Project Files' }),
    ).toBeInTheDocument();

    await pick('Documents hub', 'All hubs');
    expect(
      await screen.findByRole('treeitem', { name: 'Studio hub' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Documents project' }),
    ).not.toBeInTheDocument();
  });
});
