import { createMemoryHistory } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { OPEN_MODELS_KEY } from '../api/openModels.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';
import { resetRegion } from '../viewer/region.js';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type Router = ReturnType<typeof createAppRouter>;

function renderPath(path: string) {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  const view = render(
    <App appRouter={appRouter} client={createTestClient()} />,
  );
  return { appRouter, ...view };
}

async function dockReady() {
  await waitFor(() =>
    expect(document.querySelector('.dv-dockview')).not.toBeNull(),
  );
  await screen.findByRole('complementary', { name: 'Documents' });
}

function groups(): string[] {
  return [...document.querySelectorAll<SVGElement>('[data-model-id]')].map(
    (group) => group.dataset.modelId ?? '',
  );
}

function searchOf(appRouter: Router): Record<string, unknown> {
  return appRouter.state.location.search as Record<string, unknown>;
}

beforeEach(() => {
  stubLayout();
  installMemoryStorage();
  resetRegion();
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('__MOCK_APS__', true);
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  mockMatchMedia(1440);
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRegion();
});

describe('combined viewer tab', () => {
  it('opens the with list as one tab and one viewer', async () => {
    renderPath('/model/aaa?file=A.rvt&v=v1&with=bbb,ccc');
    await dockReady();
    await screen.findByRole('tab', { name: '3 models' });
    await waitFor(() => expect(groups()).toEqual(['aaa', 'bbb', 'ccc']));
    expect(document.querySelectorAll('.bsh-mock')).toHaveLength(1);
    expect(
      JSON.parse(sessionStorage.getItem(OPEN_MODELS_KEY) ?? '{}'),
    ).toMatchObject({
      models: [{ urn: 'aaa', context: { file: 'A.rvt', with: 'bbb,ccc' } }],
    });
  });

  it('keeps the members when the first model is opened again and mirrors them in the url', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&with=bbb');
    await dockReady();
    await screen.findByRole('tab', { name: '2 models' });
    await act(() =>
      appRouter.navigate({
        to: '/model/$urn',
        params: { urn: 'aaa' },
        search: { file: 'A.rvt', v: 'v2' },
      }),
    );
    await waitFor(() =>
      expect(searchOf(appRouter)).toMatchObject({ with: 'bbb', v: 'v2' }),
    );
    expect(screen.getAllByRole('tab', { name: '2 models' })).toHaveLength(1);
  });

  it('removes a member from the models menu and the tab becomes single', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&with=bbb');
    await dockReady();
    const trigger = await screen.findByRole('button', {
      name: 'Models in this viewer (2)',
    });
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Remove Untitled model' }),
    );
    await waitFor(() => expect(groups()).toEqual(['aaa']));
    await waitFor(() => expect(searchOf(appRouter).with).toBeUndefined());
    await screen.findByRole('tab', { name: 'A.rvt' });
    expect(
      screen.queryByRole('button', { name: /Models in this viewer/ }),
    ).toBeNull();
  });

  it('moves the tab to the next model when the first one is removed', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&with=bbb');
    await dockReady();
    const trigger = await screen.findByRole('button', {
      name: 'Models in this viewer (2)',
    });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove A.rvt' }));
    await screen.findByRole('tab', { name: 'Untitled model' });
    await waitFor(() =>
      expect(appRouter.state.location.pathname).toBe('/model/bbb'),
    );
  });

  it('restores a combined tab after a reload', async () => {
    const first = renderPath('/model/aaa?file=A.rvt&with=bbb,ccc');
    await dockReady();
    await screen.findByRole('tab', { name: '3 models' });
    first.unmount();
    renderPath('/');
    await dockReady();
    await screen.findByRole('tab', { name: '3 models' });
    await waitFor(() => expect(groups()).toEqual(['aaa', 'bbb', 'ccc']));
  });
});
