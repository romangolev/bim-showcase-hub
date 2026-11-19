import { createMemoryHistory } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';
import { PANE_APPEARANCE_KEY } from './paneAppearance.js';

function renderModel() {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: ['/model/abc123'] }),
  );
  return render(<App appRouter={appRouter} client={createTestClient()} />);
}

async function openPaneMenu(title: string) {
  const trigger = await screen.findByRole('button', {
    name: `${title} pane options`,
  });
  fireEvent.click(trigger);
  return screen.getByRole('menu', { name: `${title} pane options` });
}

function layoutHandle() {
  return (
    window as unknown as {
      __bshLayout?: { addInstance: (kind: string) => string | null };
    }
  ).__bshLayout;
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
  vi.restoreAllMocks();
});

describe('pane title and color tag', () => {
  it('renames a pane, persists the title and survives a reload', async () => {
    const first = renderModel();
    const menu = await openPaneMenu('Model summary');
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Rename pane…' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Rename pane' });
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Pane title' }),
      {
        target: { value: 'Level 02 - Walls' },
      },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save title' }));

    expect(
      await screen.findByRole('tab', { name: 'Level 02 - Walls' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Level 02 - Walls pane options' }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(PANE_APPEARANCE_KEY)).toContain(
      'Level 02 - Walls',
    );

    first.unmount();
    renderModel();
    expect(
      await screen.findByRole('tab', { name: 'Level 02 - Walls' }),
    ).toBeInTheDocument();
  });

  it('tags a pane, survives a reload and removes the tag', async () => {
    const first = renderModel();
    let menu = await openPaneMenu('Model summary');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Color tag…' }));
    let dialog = await screen.findByRole('dialog', { name: 'Color tag' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Blue' }));
    expect(window.localStorage.getItem(PANE_APPEARANCE_KEY)).toContain(
      '"color":"blue"',
    );

    await waitFor(() =>
      expect(document.querySelector('[data-tag="blue"]')).not.toBeNull(),
    );

    first.unmount();
    expect(window.localStorage.getItem(PANE_APPEARANCE_KEY)).toContain(
      '"color":"blue"',
    );
    renderModel();
    await waitFor(() => {
      expect(document.querySelector('[data-tag="blue"]')).not.toBeNull();
    });

    menu = await openPaneMenu('Model summary');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Color tag…' }));
    dialog = await screen.findByRole('dialog', { name: 'Color tag' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove tag' }));
    await waitFor(() =>
      expect(document.querySelector('[data-tag]')).toBeNull(),
    );
  });

  it('resets a custom title to the registry label', async () => {
    renderModel();
    let menu = await openPaneMenu('Model summary');
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Rename pane…' }),
    );
    let dialog = await screen.findByRole('dialog', { name: 'Rename pane' });
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Pane title' }),
      {
        target: { value: 'Roof' },
      },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save title' }));
    await screen.findByRole('tab', { name: 'Roof' });

    menu = await openPaneMenu('Roof');
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Rename pane…' }),
    );
    dialog = await screen.findByRole('dialog', { name: 'Rename pane' });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Reset title' }),
    );
    expect(
      await screen.findByRole('tab', { name: 'Model summary' }),
    ).toBeInTheDocument();
  });

  it('keeps the title and tag when a pane is closed and reopened', async () => {
    renderModel();
    let menu = await openPaneMenu('Model summary');
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Rename pane…' }),
    );
    let dialog = await screen.findByRole('dialog', { name: 'Rename pane' });
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Pane title' }),
      {
        target: { value: 'Roof' },
      },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save title' }));
    await screen.findByRole('tab', { name: 'Roof' });

    menu = await openPaneMenu('Roof');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Color tag…' }));
    dialog = await screen.findByRole('dialog', { name: 'Color tag' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Green' }));
    await waitFor(() =>
      expect(document.querySelector('[data-tag="green"]')).not.toBeNull(),
    );

    menu = await openPaneMenu('Roof');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: 'Roof' })).toBeNull(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Panes' }));
    const panes = screen.getByRole('dialog', { name: 'Panes' });
    fireEvent.click(
      within(
        panes.querySelector('[data-kind="summary"]') as HTMLElement,
      ).getByRole('menuitemcheckbox', { name: 'Model summary' }),
    );
    expect(
      await screen.findByRole('tab', { name: 'Roof' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('[data-tag="green"]')).not.toBeNull(),
    );
  });

  it('keeps duplicate instance titles independent', async () => {
    renderModel();
    await screen.findByRole('tab', { name: 'Untitled model' });
    act(() => {
      layoutHandle()?.addInstance('chart');
    });
    await screen.findByRole('tab', { name: 'Chart 1' });
    act(() => {
      layoutHandle()?.addInstance('chart');
    });
    await screen.findByRole('tab', { name: 'Chart 2' });

    const menu = await openPaneMenu('Chart 1');
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Rename pane…' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Rename pane' });
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Pane title' }),
      {
        target: { value: 'Cost by level' },
      },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save title' }));

    expect(
      await screen.findByRole('tab', { name: 'Cost by level' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chart 2' })).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem(PANE_APPEARANCE_KEY) ?? '{}'),
    ).toMatchObject({
      'chart:1': { title: 'Cost by level' },
    });
  });
});
