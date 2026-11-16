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

  it('follows a new with list in the url without bouncing back', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&with=bbb');
    await dockReady();
    await screen.findByRole('tab', { name: '2 models' });
    await act(() =>
      appRouter.navigate({
        to: '/model/$urn',
        params: { urn: 'aaa' },
        search: { file: 'A.rvt', with: 'bbb,ccc' },
      }),
    );
    await screen.findByRole('tab', { name: '3 models' });
    await waitFor(() => expect(groups()).toEqual(['aaa', 'bbb', 'ccc']));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(searchOf(appRouter).with).toBe('bbb,ccc');
    expect(
      JSON.parse(sessionStorage.getItem(OPEN_MODELS_KEY) ?? '{}').models[0]
        .context.with,
    ).toBe('bbb,ccc');
  });

  it('saves brought-together positions and restores them after a reload', async () => {
    const first = renderPath('/model/aaa?file=A.rvt&with=bbb-far');
    await dockReady();
    await screen.findByText(/Some models are far apart/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Bring models together (view only)' }),
    );
    const moved = () =>
      document.querySelector<SVGGElement>('[data-model-id="bbb-far"]')?.dataset
        .offset;
    await waitFor(() => expect(moved()).toBe('moved'));
    const saved = JSON.parse(sessionStorage.getItem(OPEN_MODELS_KEY) ?? '{}');
    expect(Object.keys(saved.models[0].offsets)).toEqual(['bbb-far']);
    expect(saved.models[0].spread).toBeGreaterThan(1_000_000);
    first.unmount();
    renderPath('/');
    await dockReady();
    await waitFor(() => expect(moved()).toBe('moved'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore positions' }));
    await waitFor(() => expect(moved()).toBe('original'));
    expect(
      JSON.parse(sessionStorage.getItem(OPEN_MODELS_KEY) ?? '{}').models[0]
        .offsets,
    ).toBeUndefined();
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

interface LayoutHandle {
  movePane: (id: string, target: 'left' | 'right' | 'below' | 'float') => void;
  location: (id: string) => string | null;
  activateModel: (urn: string) => void;
}

function layout(): LayoutHandle {
  const value = (window as unknown as { __bshLayout?: LayoutHandle })
    .__bshLayout;
  if (!value) throw new Error('layout handle missing');
  return value;
}

function groupOf(name: string): Element | null {
  return screen.getByRole('tab', { name }).closest('.dv-groupview');
}

function tabsOf(group: Element | null): string[] {
  return [...(group?.querySelectorAll('[role="tab"]') ?? [])].map(
    (tab) => tab.textContent ?? '',
  );
}

async function openSingle(appRouter: Router, urn: string, file: string) {
  await act(() =>
    appRouter.navigate({
      to: '/model/$urn',
      params: { urn },
      search: { file },
    }),
  );
  await screen.findByRole('tab', { name: file });
}

async function removeFirstMember() {
  act(() => layout().activateModel('aaa'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Models in this viewer (2)' }),
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove A.rvt' }));
  await screen.findByRole('tab', { name: 'Untitled model' });
}

describe('combined tab keeps its place when its first model is removed', () => {
  it('stays at its index in an ordinary group', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&with=bbb');
    await dockReady();
    await screen.findByRole('tab', { name: '2 models' });
    await openSingle(appRouter, 'ccc', 'C.rvt');
    await openSingle(appRouter, 'ddd', 'D.rvt');
    expect(tabsOf(groupOf('2 models'))).toEqual(['2 models', 'C.rvt', 'D.rvt']);
    await removeFirstMember();
    expect(tabsOf(groupOf('Untitled model'))).toEqual([
      'Untitled model',
      'C.rvt',
      'D.rvt',
    ]);
  });

  it('stays floating', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&with=bbb');
    await dockReady();
    await screen.findByRole('tab', { name: '2 models' });
    await openSingle(appRouter, 'ccc', 'C.rvt');
    act(() => layout().movePane('viewer:aaa', 'float'));
    await waitFor(() =>
      expect(layout().location('viewer:aaa')).toBe('floating'),
    );
    await removeFirstMember();
    expect(layout().location('viewer:bbb')).toBe('floating');
    expect(groupOf('Untitled model')).not.toBe(groupOf('C.rvt'));
  });

  it('stays in its own split', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&with=bbb');
    await dockReady();
    await screen.findByRole('tab', { name: '2 models' });
    await openSingle(appRouter, 'ccc', 'C.rvt');
    act(() => layout().movePane('viewer:aaa', 'below'));
    await waitFor(() => expect(groupOf('2 models')).not.toBe(groupOf('C.rvt')));
    await removeFirstMember();
    expect(layout().location('viewer:bbb')).toBe('grid');
    expect(tabsOf(groupOf('Untitled model'))).toEqual(['Untitled model']);
    expect(tabsOf(groupOf('C.rvt'))).toEqual(['C.rvt']);
  });
});
