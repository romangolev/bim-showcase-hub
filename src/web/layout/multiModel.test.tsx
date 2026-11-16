import { createMemoryHistory } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { App } from '../App.js';
import { MAX_LOADED_MODELS, OPEN_MODELS_KEY } from '../api/openModels.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { page, resetRegion } from '../viewer/region.js';
import type { MoveTarget } from './layoutContext.js';
import { LAYOUT_KEY, parseLayout } from './layoutState.js';

interface Handle {
  movePane: (id: string, target: MoveTarget) => void;
  togglePane: (id: string) => void;
  location: (id: string) => string | null;
  resetLayout: () => void;
  openPanes: () => string[];
  models: () => {
    models: { urn: string }[];
    active: string | null;
    live: string[];
    visible: string[];
  };
  activateModel: (urn: string) => void;
  closeModel: (urn: string) => void;
}

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type Router = ReturnType<typeof createAppRouter>;

let storage: Storage;
let media: ReturnType<typeof mockMatchMedia>;
const urnOf = new WeakMap<MockViewerAdapter, string>();

function renderPath(path = '/') {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  return {
    appRouter,
    ...render(<App appRouter={appRouter} client={createTestClient()} />),
  };
}

function handle(): Handle {
  const value = (window as unknown as { __bshLayout?: Handle }).__bshLayout;
  if (!value) throw new Error('layout handle missing');
  return value;
}

async function open(appRouter: Router, urn: string, file?: string) {
  await act(() =>
    appRouter.navigate({
      to: '/model/$urn',
      params: { urn },
      search: file ? { file, v: 'v1' } : {},
    }),
  );
}

async function dockReady() {
  await waitFor(() =>
    expect(document.querySelector('.dv-dockview')).not.toBeNull(),
  );
  await screen.findByRole('complementary', { name: 'Documents' });
}

function modelBody(urn: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-model="${urn}"]`);
}

function sceneOf(urn: string): Element | null {
  return modelBody(urn)?.querySelector('.bsh-mock') ?? null;
}

function pathOf(appRouter: Router): string {
  return appRouter.state.location.pathname;
}

beforeEach(() => {
  stubLayout();
  storage = installMemoryStorage();
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('__MOCK_APS__', true);
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  media = mockMatchMedia(1440);
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
  const load = MockViewerAdapter.prototype.load;
  vi.spyOn(MockViewerAdapter.prototype, 'load').mockImplementation(
    async function (this: MockViewerAdapter, urn: string) {
      urnOf.set(this, urn);
      if (urn === 'broken') throw new Error('Document load failed (404)');
      return load.call(this, urn);
    },
  );
  vi.spyOn(MockViewerAdapter.prototype, 'getLeafProperties').mockImplementation(
    async function (this: MockViewerAdapter, names: string[]) {
      const urn = urnOf.get(this) ?? 'none';
      const row: PropertyRow = {
        dbId: 1,
        name: urn,
        properties: Object.fromEntries(
          names.map((name) => [name, `${name} of ${urn}`]),
        ),
      };
      return [row];
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('several models', () => {
  it('opens each model in its own tab, never twice, and mirrors the active one in the url', async () => {
    const { appRouter } = renderPath('/');
    await dockReady();
    expect(screen.queryByRole('tab', { name: 'Viewer' })).toBeNull();
    await open(appRouter, 'aaa', 'A.rvt');
    await screen.findByRole('tab', { name: 'A.rvt · v1' });
    await open(appRouter, 'bbb', 'B.rvt');
    await screen.findByRole('tab', { name: 'B.rvt · v1' });
    expect(screen.queryByRole('tab', { name: 'Viewer' })).toBeNull();
    await open(appRouter, 'aaa', 'A.rvt');
    expect(screen.getAllByRole('tab', { name: 'A.rvt · v1' })).toHaveLength(1);
    expect(
      handle()
        .models()
        .models.map((model) => model.urn),
    ).toEqual(['aaa', 'bbb']);
    expect(handle().models().active).toBe('aaa');

    act(() => handle().activateModel('bbb'));
    await waitFor(() => expect(pathOf(appRouter)).toBe('/model/bbb'));
    expect(appRouter.state.location.search).toMatchObject({ file: 'B.rvt' });
    expect(
      screen
        .getByRole('tab', { name: 'B.rvt · v1' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      JSON.parse(sessionStorage.getItem(OPEN_MODELS_KEY) ?? '{}'),
    ).toMatchObject({
      active: 'bbb',
    });
  });

  it('activating a tab in the dock activates its model and the url follows', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await open(appRouter, 'bbb', 'B.rvt');
    await screen.findByRole('tab', { name: 'B.rvt · v1' });
    const tab = screen.getByRole('tab', { name: 'A.rvt · v1' });
    fireEvent.pointerDown(tab);
    fireEvent.pointerUp(tab);
    fireEvent.click(tab);
    await waitFor(() => expect(handle().models().active).toBe('aaa'));
    await waitFor(() => expect(pathOf(appRouter)).toBe('/model/aaa'));
    await waitFor(() => expect(sceneOf('aaa')?.isConnected).toBe(true));
  });

  it('closing a tab destroys only its viewer and activates a neighbour', async () => {
    const destroy = vi.spyOn(MockViewerAdapter.prototype, 'destroy');
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await waitFor(() => expect(sceneOf('aaa')).not.toBeNull());
    const sceneA = sceneOf('aaa');
    await open(appRouter, 'bbb', 'B.rvt');
    await waitFor(() => expect(sceneOf('bbb')).not.toBeNull());
    const destroyedA = () =>
      destroy.mock.contexts.filter(
        (adapter) => urnOf.get(adapter as MockViewerAdapter) === 'aaa',
      ).length;

    const tab = screen.getByRole('tab', { name: 'B.rvt · v1' });
    fireEvent.click(within(tab).getByRole('button', { hidden: true }));
    await waitFor(() => expect(pathOf(appRouter)).toBe('/model/aaa'));
    expect(screen.queryByRole('tab', { name: 'B.rvt · v1' })).toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroyedA()).toBe(0);
    expect(sceneOf('aaa')).toBe(sceneA);
    expect(sceneA?.isConnected).toBe(true);

    act(() => handle().togglePane('viewer:aaa'));
    await waitFor(() => expect(pathOf(appRouter)).toBe('/'));
    expect(destroyedA()).toBe(1);
    await waitFor(() => expect(handle().openPanes()).toEqual(['tree']));
    expect(screen.queryByRole('tab', { name: 'Model summary' })).toBeNull();
    expect(
      await screen.findByRole('heading', { name: 'Pick a model to explore' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('complementary', { name: 'Documents' }),
    );
  });

  it('never destroys or reloads a model while its tab is moved, floated or split', async () => {
    const destroy = vi.spyOn(MockViewerAdapter.prototype, 'destroy');
    const load = vi.mocked(MockViewerAdapter.prototype.load);
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await open(appRouter, 'bbb', 'B.rvt');
    await waitFor(() => expect(sceneOf('bbb')).not.toBeNull());
    const scene = sceneOf('bbb');
    const loads = load.mock.calls.length;

    act(() => handle().movePane('viewer:bbb', 'right'));
    expect(scene?.isConnected).toBe(true);
    act(() => handle().movePane('viewer:aaa', 'left'));
    await waitFor(() => expect(sceneOf('aaa')?.isConnected).toBe(true));
    await waitFor(() =>
      expect([...handle().models().visible].sort()).toEqual(['aaa', 'bbb']),
    );
    expect(scene?.isConnected).toBe(true);
    act(() => handle().movePane('viewer:bbb', 'float'));
    expect(handle().location('viewer:bbb')).toBe('floating');
    act(() => handle().movePane('viewer:bbb', 'dock'));
    act(() => handle().resetLayout());
    expect(sceneOf('bbb')).toBe(scene);

    act(() => media.setWidth(800));
    await waitFor(() =>
      expect(document.querySelector('.dv-dockview')).toBeNull(),
    );
    act(() => media.setWidth(1440));
    await dockReady();
    expect(sceneOf('bbb')).toBe(scene);
    expect(destroy).not.toHaveBeenCalled();
    expect(load.mock.calls.length).toBe(loads);
  });

  it('keeps the other model rendering when one fails to load', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await waitFor(() => expect(sceneOf('aaa')).not.toBeNull());
    const scene = sceneOf('aaa');
    await open(appRouter, 'broken', 'Broken.rvt');
    const body = await waitFor(() => {
      const found = modelBody('broken');
      expect(found?.querySelector('[data-state="error"]')).not.toBeNull();
      return found;
    });
    expect(within(body as HTMLElement).getByRole('alert')).toHaveTextContent(
      'could not be loaded',
    );
    act(() => handle().movePane('viewer:aaa', 'right'));
    await waitFor(() =>
      expect(
        modelBody('aaa')?.querySelector('[data-state="ready"]'),
      ).not.toBeNull(),
    );
    expect(sceneOf('aaa')).toBe(scene);
    expect(scene?.isConnected).toBe(true);
  });

  it('switches the summary to the active model without reading again', async () => {
    const read = vi.mocked(MockViewerAdapter.prototype.getLeafProperties);
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    const summary = await screen.findByRole('complementary', {
      name: 'Model summary',
    });
    expect(await within(summary).findByText('Name of aaa')).toBeInTheDocument();
    expect(summary.querySelector('.bsh-summary__model')).toHaveTextContent(
      'A.rvt · v1',
    );
    await open(appRouter, 'bbb', 'B.rvt');
    expect(await within(summary).findByText('Name of bbb')).toBeInTheDocument();
    expect(summary.querySelector('.bsh-summary__model')).toHaveTextContent(
      'B.rvt · v1',
    );
    expect(
      screen
        .getByRole('tab', { name: 'Model summary' })
        .querySelector('[title]'),
    ).toHaveAttribute('title', 'Model summary of B.rvt · v1');
    const reads = read.mock.calls.length;
    act(() => handle().activateModel('aaa'));
    expect(await within(summary).findByText('Name of aaa')).toBeInTheDocument();
    expect(read.mock.calls.length).toBe(reads);
  });

  it('restores the tabs after a reload and loads only the active one', async () => {
    const first = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await open(first.appRouter, 'bbb', 'B.rvt');
    await open(first.appRouter, 'ccc', 'C.rvt');
    await waitFor(() => expect(sceneOf('ccc')).not.toBeNull());
    await waitFor(() =>
      expect(
        Object.keys(
          parseLayout(storage.getItem(LAYOUT_KEY))?.dock?.panels ?? {},
        ),
      ).toContain('viewer:ccc'),
    );
    first.unmount();
    const load = vi.mocked(MockViewerAdapter.prototype.load);
    load.mockClear();

    const second = renderPath('/model/ccc?file=C.rvt&v=v1');
    await dockReady();
    for (const name of ['A.rvt · v1', 'B.rvt · v1', 'C.rvt · v1']) {
      expect(await screen.findByRole('tab', { name })).toBeInTheDocument();
    }
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(load.mock.calls[0]?.[0]).toBe('ccc');
    expect(sceneOf('aaa')).toBeNull();
    act(() => handle().activateModel('aaa'));
    await waitFor(() => expect(sceneOf('aaa')).not.toBeNull());
    expect(load).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(pathOf(second.appRouter)).toBe('/model/aaa'));
  });

  it('opens the active model when the url has none', async () => {
    sessionStorage.setItem(
      OPEN_MODELS_KEY,
      JSON.stringify({
        models: [{ urn: 'aaa', context: { file: 'A.rvt' } }],
        active: 'aaa',
      }),
    );
    const { appRouter } = renderPath('/');
    await dockReady();
    await waitFor(() => expect(pathOf(appRouter)).toBe('/model/aaa'));
    expect(appRouter.state.location.search).toMatchObject({ file: 'A.rvt' });
  });

  it('lets the user go home or to a missing page while models stay open', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await open(appRouter, 'bbb', 'B.rvt');
    await screen.findByRole('tab', { name: 'B.rvt · v1' });
    await act(() => appRouter.navigate({ to: '/' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pathOf(appRouter)).toBe('/');
    expect(handle().models().models).toHaveLength(2);
    await act(() => appRouter.navigate({ to: '/nowhere' as '/' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pathOf(appRouter)).toBe('/nowhere');
    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to documents' }));
    await waitFor(() => expect(pathOf(appRouter)).toBe('/'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pathOf(appRouter)).toBe('/');
    act(() => handle().activateModel('aaa'));
    await waitFor(() => expect(pathOf(appRouter)).toBe('/model/aaa'));
  });

  it('pauses the least recently shown model above the cap', async () => {
    const destroy = vi.spyOn(MockViewerAdapter.prototype, 'destroy');
    const { appRouter } = renderPath('/');
    await dockReady();
    for (let index = 0; index <= MAX_LOADED_MODELS; index++) {
      await open(appRouter, `m${index}`, `M${index}.rvt`);
      await waitFor(() => expect(sceneOf(`m${index}`)).not.toBeNull());
    }
    expect(handle().models().live).not.toContain('m0');
    expect(handle().models().live).toHaveLength(MAX_LOADED_MODELS);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(urnOf.get(destroy.mock.contexts[0] as MockViewerAdapter)).toBe('m0');
    act(() => handle().activateModel('m0'));
    await waitFor(() => expect(sceneOf('m0')).not.toBeNull());
    expect(handle().models().live).not.toContain('m1');
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it('writes the layout once per change after a short delay', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await waitFor(() => expect(storage.getItem(LAYOUT_KEY)).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 400));
    const write = vi.spyOn(storage, 'setItem');
    const layoutWrites = () =>
      write.mock.calls.filter(([key]) => key === LAYOUT_KEY).length;
    act(() => handle().activateModel('aaa'));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(layoutWrites()).toBe(0);
    await open(appRouter, 'bbb', 'B.rvt');
    expect(layoutWrites()).toBe(0);
    await waitFor(() => expect(layoutWrites()).toBe(1));
  });
});

describe('several models on a narrow screen', () => {
  it('switches models with a tab strip and keeps the hidden viewers mounted', async () => {
    media.setWidth(800);
    const destroy = vi.spyOn(MockViewerAdapter.prototype, 'destroy');
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await waitFor(() => expect(sceneOf('aaa')).not.toBeNull());
    const sceneA = sceneOf('aaa');
    await open(appRouter, 'bbb', 'B.rvt');
    const strip = await screen.findByRole('tablist', { name: 'Open models' });
    await waitFor(() => expect(sceneOf('bbb')).not.toBeNull());
    expect(sceneA?.isConnected).toBe(false);
    const tabA = within(strip).getByRole('tab', { name: 'A.rvt · v1' });
    expect(
      within(strip).getByRole('tab', { name: 'B.rvt · v1' }),
    ).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(tabA);
    await waitFor(() => expect(pathOf(appRouter)).toBe('/model/aaa'));
    expect(sceneOf('aaa')).toBe(sceneA);
    expect(sceneA?.isConnected).toBe(true);
    const tabB = within(strip).getByRole('tab', { name: 'B.rvt · v1' });
    fireEvent.keyDown(tabB, { key: 'Delete' });
    await waitFor(() =>
      expect(
        within(strip).queryByRole('tab', { name: 'B.rvt · v1' }),
      ).toBeNull(),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(sceneA?.isConnected).toBe(true);
  });
});

describe('hosts under StrictMode', () => {
  it('gives a reopened model a fresh host in its slot', async () => {
    const appRouter = createAppRouter(
      createMemoryHistory({ initialEntries: ['/model/aaa?file=A.rvt&v=v1'] }),
    );
    render(
      <StrictMode>
        <App appRouter={appRouter} client={createTestClient()} />
      </StrictMode>,
    );
    await dockReady();
    await waitFor(() => expect(sceneOf('aaa')).not.toBeNull());
    const firstHost = sceneOf('aaa')?.closest('.pane-host');
    act(() => handle().closeModel('aaa'));
    await waitFor(() => expect(pathOf(appRouter)).toBe('/'));
    await waitFor(() => expect(firstHost?.isConnected).toBe(false));
    await open(appRouter, 'aaa', 'A.rvt');
    await waitFor(() => expect(sceneOf('aaa')?.isConnected).toBe(true));
    const hosts = document.querySelectorAll(
      '.pane-host[data-pane="viewer:aaa"]',
    );
    expect(hosts).toHaveLength(1);
    expect(hosts[0]).not.toBe(firstHost);
    expect(hosts[0]?.parentElement?.classList.contains('pane-slot')).toBe(true);
    expect(hosts[0]?.querySelectorAll('.bsh-mock')).toHaveLength(1);
  });
});

describe('Documents first', () => {
  it('keeps Documents required: no close button and no Close item', async () => {
    renderPath('/');
    await dockReady();
    const tab = screen.getByRole('tab', { name: 'Documents' });
    expect(tab.querySelector('.dv-default-tab-action')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Documents pane options' }),
    );
    const menu = screen.getByRole('menu', { name: 'Documents pane options' });
    expect(within(menu).queryByRole('menuitem', { name: 'Close' })).toBeNull();
  });

  it('remembers a closed companion for later models until Reset layout', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    const summaryTab = await screen.findByRole('tab', {
      name: 'Model summary',
    });
    fireEvent.click(
      summaryTab.querySelector('.dv-default-tab-action') as Element,
    );
    await waitFor(() =>
      expect(parseLayout(storage.getItem(LAYOUT_KEY))?.dismissed).toEqual([
        'summary',
      ]),
    );
    act(() => handle().closeModel('aaa'));
    await waitFor(() => expect(handle().openPanes()).toEqual(['tree']));
    await open(appRouter, 'bbb', 'B.rvt');
    await screen.findByRole('tab', { name: 'B.rvt · v1' });
    await waitFor(() =>
      expect(handle().openPanes()).toEqual(['tree', 'viewer', 'dashboard']),
    );
    act(() => handle().togglePane('summary'));
    await screen.findByRole('tab', { name: 'Model summary' });
    await waitFor(() =>
      expect(parseLayout(storage.getItem(LAYOUT_KEY))?.dismissed).toEqual([]),
    );
    act(() => handle().togglePane('summary'));
    await waitFor(() => expect(handle().openPanes()).not.toContain('summary'));
    act(() => handle().resetLayout());
    await waitFor(() => expect(handle().openPanes()).toContain('summary'));
    await waitFor(() =>
      expect(parseLayout(storage.getItem(LAYOUT_KEY))?.dismissed).toEqual([]),
    );
  });

  it('opens the viewer section from Documents on a narrow screen and goes back', async () => {
    media.setWidth(800);
    const { appRouter } = renderPath('/');
    const docs = await screen.findByRole('complementary', {
      name: 'Documents',
    });
    expect(screen.getByRole('main')).toContainElement(docs);
    expect(screen.queryByRole('tablist', { name: 'Open models' })).toBeNull();
    await open(appRouter, 'aaa', 'A.rvt');
    expect(
      await screen.findByRole('tablist', { name: 'Open models' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(sceneOf('aaa')).not.toBeNull());
    expect(
      screen.queryByRole('complementary', { name: 'Documents' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand document tree' }),
    );
    expect(
      await screen.findByRole('complementary', { name: 'Documents' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close A.rvt · v1', hidden: true }),
    );
    await waitFor(() => expect(pathOf(appRouter)).toBe('/'));
    expect(
      await screen.findByRole('complementary', { name: 'Documents' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Open models' })).toBeNull();
  });
});

describe('remembered arrangement', () => {
  function leafOrder(): string[] {
    const dock = parseLayout(storage.getItem(LAYOUT_KEY))?.dock;
    const order: string[] = [];
    const visit = (node: { type: string; data: unknown }) => {
      if (node.type === 'leaf') {
        order.push(...(node.data as { views: string[] }).views);
      } else {
        for (const child of node.data as { type: string; data: unknown }[]) {
          visit(child);
        }
      }
    };
    if (dock) visit(dock.grid.root);
    return order;
  }

  it('reopens the viewer and its companions where the user left them', async () => {
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await screen.findByRole('tab', { name: 'Model summary' });
    act(() => handle().movePane('summary', 'left'));
    await waitFor(() => expect(leafOrder()[0]).toBe('summary'));
    act(() => handle().closeModel('aaa'));
    await waitFor(() => expect(leafOrder()).toEqual(['tree']));
    await open(appRouter, 'bbb', 'B.rvt');
    await screen.findByRole('tab', { name: 'B.rvt · v1' });
    await waitFor(() => expect(leafOrder()[0]).toBe('summary'));
    expect(leafOrder()).toContain('viewer:bbb');
    expect(leafOrder()).toContain('dashboard');
    await waitFor(() => expect(sceneOf('bbb')?.isConnected).toBe(true));
  });
});

const EU_URN = btoa('urn:adsk.wipemea:fs.file:vf.eu?version=1')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

describe('one Autodesk region per page', () => {
  it('keeps a model whose tab is not active and goes to its url', async () => {
    resetRegion();
    const go = vi.spyOn(page, 'go').mockImplementation(() => {});
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await waitFor(() => expect(sceneOf('aaa')).not.toBeNull());
    await open(appRouter, EU_URN, 'Europe.rvt');
    const body = await waitFor(() => {
      const found = modelBody(EU_URN);
      expect(found?.querySelector('[data-state="region"]')).not.toBeNull();
      return found as HTMLElement;
    });
    act(() => handle().activateModel('aaa'));
    await waitFor(() => expect(pathOf(appRouter)).toBe('/model/aaa'));
    fireEvent.click(
      within(body).getByRole('button', {
        name: 'Close other models and reload',
      }),
    );
    expect(
      handle()
        .models()
        .models.map((model) => model.urn),
    ).toEqual([EU_URN]);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go.mock.calls[0]?.[0]).toContain(`/model/${EU_URN}`);
    resetRegion();
  });

  const EU = btoa('urn:adsk.wipemea:fs.file:vf.eu?version=1')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  afterEach(() => {
    resetRegion();
  });

  it('explains a model from the other region and offers to keep only it', async () => {
    resetRegion();
    const go = vi.spyOn(page, 'go').mockImplementation(() => {});
    const load = vi.mocked(MockViewerAdapter.prototype.load);
    const { appRouter } = renderPath('/model/aaa?file=A.rvt&v=v1');
    await dockReady();
    await waitFor(() => expect(sceneOf('aaa')).not.toBeNull());
    await open(appRouter, EU, 'Europe.rvt');
    const body = await waitFor(() => {
      const found = modelBody(EU);
      expect(found?.querySelector('[data-state="region"]')).not.toBeNull();
      return found as HTMLElement;
    });
    expect(body).toHaveTextContent(
      'This model is in the EU region. The viewer supports one region per page.',
    );
    expect(load.mock.calls.map(([urn]) => urn)).not.toContain(EU);
    fireEvent.click(
      within(body).getByRole('button', {
        name: 'Close other models and reload',
      }),
    );
    expect(go).toHaveBeenCalledTimes(1);
    expect(go.mock.calls[0]?.[0]).toContain(`/model/${EU}`);
    expect(go.mock.calls[0]?.[0]).toContain('Europe.rvt');
    expect(
      handle()
        .models()
        .models.map((model) => model.urn),
    ).toEqual([EU]);
    expect(
      JSON.parse(sessionStorage.getItem(OPEN_MODELS_KEY) ?? '{}').models,
    ).toHaveLength(1);
  });
});
