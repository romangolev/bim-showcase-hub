import { createMemoryHistory } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.js';
import { PINNED_KEY, rememberModel } from '../../api/modelStore.js';
import { createAppRouter } from '../../routes/router.js';
import { SettingsProvider } from '../../settings/index.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../../test/mockApi.js';
import { saveSelectionSet } from '../../viewer/selectionSets.js';
import { DocumentsHome } from './DocumentsHome.js';

function seed() {
  rememberModel('urn-a', { file: 'A.rvt', v: 'v2' });
  window.localStorage.setItem(
    PINNED_KEY,
    JSON.stringify([{ urn: 'urn-b', file: 'B.rvt' }]),
  );
  saveSelectionSet('Tower selection', [
    { modelId: 'urn-a', dbId: 1 },
    { modelId: 'urn-a', dbId: 2 },
  ]);
}

function renderHome(onOpen = vi.fn()) {
  render(
    <SettingsProvider>
      <DocumentsHome onOpen={onOpen} />
    </SettingsProvider>,
  );
  return onOpen;
}

beforeEach(() => {
  stubLayout();
  installMemoryStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('DocumentsHome', () => {
  it('lists pinned, recent and selection sets', () => {
    seed();
    renderHome();
    expect(
      within(screen.getByRole('region', { name: 'Pinned' })).getByText('B.rvt'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Recent' })).getByText(
        'A.rvt · v2',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Selection sets' })).getByText(
        'Tower selection',
      ),
    ).toBeInTheDocument();
  });

  it('opens a recent model and a set from the home view', () => {
    seed();
    const onOpen = renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'A.rvt · v2' }));
    expect(onOpen).toHaveBeenCalledWith(
      'urn-a',
      expect.objectContaining({ file: 'A.rvt', v: 'v2' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Tower selection/ }));
    expect(onOpen).toHaveBeenLastCalledWith(
      'urn-a',
      expect.objectContaining({ file: 'A.rvt' }),
    );
    expect(screen.getByText('2 elements')).toBeInTheDocument();
  });

  it('welcomes a first-time user when there is nothing to show', () => {
    renderHome();
    expect(screen.getByText('Pick a file to start')).toBeInTheDocument();
    expect(
      screen.getByText(/choose a hub, then a project/i),
    ).toBeInTheDocument();
  });

  it('shows the usual sections once there is a recent model', () => {
    seed();
    renderHome();
    expect(screen.queryByText('Pick a file to start')).toBeNull();
  });

  it('shows the empty section copy once only a pinned model exists', () => {
    window.localStorage.setItem(
      PINNED_KEY,
      JSON.stringify([{ urn: 'urn-b', file: 'B.rvt' }]),
    );
    renderHome();
    expect(screen.queryByText('Pick a file to start')).toBeNull();
    expect(
      screen.getByText('Models you open appear here.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Save a selection in the viewer to see it here.'),
    ).toBeInTheDocument();
  });

  it('hides a section from the home sections menu', () => {
    seed();
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Home sections' }));
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Show selection sets' }),
    );
    expect(
      screen.queryByRole('region', { name: 'Selection sets' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pinned' })).toBeInTheDocument();
  });
});

describe('Documents home in the app', () => {
  function renderApp(path = '/') {
    const appRouter = createAppRouter(
      createMemoryHistory({ initialEntries: [path] }),
    );
    render(<App appRouter={appRouter} client={createTestClient()} />);
  }

  beforeEach(() => {
    vi.stubGlobal('innerHeight', 1000);
    vi.stubGlobal('__MOCK_APS__', true);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    mockMatchMedia(1440);
    mockFetch({
      '/api/session': { name: 'Ada', picture: null },
      ...treeRoutes,
    });
  });

  it('shows the home view with no model open', async () => {
    seed();
    renderApp();
    expect(
      await screen.findByRole('region', { name: 'Selection sets' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recent' })).toBeInTheDocument();
  });

  it('keeps the tree and drops the home view when a model is open', async () => {
    seed();
    rememberModel('dXJuOmFkc2s', { file: 'Tower.rvt', v: 'v2' });
    renderApp('/model/dXJuOmFkc2s?file=Tower.rvt&v=v2');
    expect(await screen.findByText('Studio hub')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Selection sets' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Pinned and Recent/ }),
    ).toBeInTheDocument();
  });
});
