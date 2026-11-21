import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { thumbnailPath } from '../../api/client.js';
import { type LayoutApi, LayoutContext } from '../../layout/layoutContext.js';
import { VERSION_TARGET } from '../../panels/versionHistory.js';
import { BSH_KEYS } from '../../storage.js';
import { MODEL_SETS } from '../../store/modelSets.js';
import { notifications } from '../../tasks/notifications.js';
import {
  createTestClient,
  folder,
  installMemoryStorage,
  item,
  json,
  mockFetch,
  stubLayout,
  treeRoutes,
} from '../../test/mockApi.js';
import { DocumentTree } from './DocumentTree.js';
import { DOC_SEARCHES } from './deepSearch.js';
import { requestDeepSearch } from './deepSearchSignal.js';
import type { TreeRoot } from './docRoot.js';
import { DEFAULT_TREE_VIEW, type TreeView } from './treeView.js';

function renderTree(
  onOpenModel = vi.fn(),
  selectedUrn?: string,
  revealTrail?: string[],
  pollMs?: number,
) {
  const client = createTestClient();
  render(
    <QueryClientProvider client={client}>
      <DocumentTree
        onOpenModel={onOpenModel}
        selectedUrn={selectedUrn}
        revealTrail={revealTrail}
        pollMs={pollMs}
      />
    </QueryClientProvider>,
  );
  return onOpenModel;
}

async function expandTo(name: string) {
  fireEvent.click(await screen.findByText(name));
}

beforeEach(() => {
  stubLayout();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DocumentTree metadata', () => {
  const dated = (name: string, id: string, modifiedAt: string) => ({
    ...item,
    id,
    name,
    modifiedAt,
    modifiedBy: 'Sam',
  });
  const contents = [
    dated('b.rvt', 'i-b', '2025-05-01T00:00:00.000Z'),
    dated('a.rvt', 'i-a', '2025-03-04T00:00:00.000Z'),
  ];

  async function open(view?: TreeView) {
    installMemoryStorage();
    if (view) {
      window.localStorage.setItem(
        BSH_KEYS.preference.treeView,
        JSON.stringify(view),
      );
    }
    mockFetch({
      ...treeRoutes,
      '/api/projects/p1/folders/f1/contents': () => json(contents),
    });
    render(
      <QueryClientProvider client={createTestClient()}>
        <DocumentTree onOpenModel={vi.fn()} />
      </QueryClientProvider>,
    );
    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await expandTo('Project Files');
    await screen.findByText('a.rvt');
  }

  it('lists files by name and shows the modified date', async () => {
    await open();
    const names = screen
      .getAllByRole('treeitem')
      .map((row) => row.textContent ?? '');
    expect(names.findIndex((t) => t.includes('a.rvt'))).toBeLessThan(
      names.findIndex((t) => t.includes('b.rvt')),
    );
    expect(screen.getByText('2025-03-04')).toBeInTheDocument();
  });

  it('sorts by modified date and shows the author when asked', async () => {
    await open({
      sort: 'modified',
      modified: true,
      author: true,
      size: false,
      openMode: 'tab',
      itemOpen: 'expand',
      thumbnails: false,
      rows: 'list',
      searchScope: 'loaded',
      homeRecent: true,
      homePinned: true,
      homeSets: true,
      homeModelSets: true,
    });
    expect(screen.getByText('2025-03-04 · Sam')).toBeInTheDocument();
    const rows = screen.getAllByRole('treeitem').map((row) => row.textContent);
    expect(rows.findIndex((t) => t?.includes('b.rvt'))).toBeLessThan(
      rows.findIndex((t) => t?.includes('a.rvt')),
    );
  });
});

describe('DocumentTree sort', () => {
  it('re-sorts a loaded folder that was collapsed when the sort changed', async () => {
    installMemoryStorage();
    const files = [
      {
        ...item,
        id: 'i-b',
        name: 'b.rvt',
        modifiedAt: '2025-05-01T00:00:00.000Z',
      },
      {
        ...item,
        id: 'i-a',
        name: 'a.rvt',
        modifiedAt: '2025-03-04T00:00:00.000Z',
      },
    ];
    mockFetch({
      ...treeRoutes,
      '/api/projects/p1/folders/f1/contents': () => json(files),
    });
    render(
      <QueryClientProvider client={createTestClient()}>
        <DocumentTree onOpenModel={vi.fn()} />
      </QueryClientProvider>,
    );
    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await expandTo('Project Files');
    await screen.findByText('a.rvt');
    await expandTo('Project Files');
    await waitFor(() =>
      expect(screen.queryByText('a.rvt')).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Documents view' }));
    fireEvent.click(await screen.findByText('Sort by modified'));
    await expandTo('Project Files');
    await screen.findByText('a.rvt');
    const rows = screen.getAllByRole('treeitem').map((row) => row.textContent);
    expect(rows.findIndex((t) => t?.includes('b.rvt'))).toBeLessThan(
      rows.findIndex((t) => t?.includes('a.rvt')),
    );
  });
});

describe('DocumentTree', () => {
  it('shows a filter icon on the Documents view button', async () => {
    mockFetch(treeRoutes);
    renderTree();
    await expandTo('Studio hub');
    const button = screen.getByRole('button', { name: 'Documents view' });
    expect(button.querySelector('svg path')?.getAttribute('d')).toBe(
      'M22 3H2l8 9.46V19l4 2v-8.54Z',
    );
  });

  it('Refresh documents refetches the loaded folders', async () => {
    const fetchMock = mockFetch(treeRoutes);
    renderTree();
    await expandTo('Studio hub');
    await screen.findByText('Riverside Tower');
    const before = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh documents' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(before + 2),
    );
  });

  it('Refresh marks a collapsed loaded folder stale and refetches it on expand', async () => {
    let renamed = false;
    const fetchMock = mockFetch({
      ...treeRoutes,
      '/api/hubs/h1/projects/p1/folders': () =>
        json([{ ...folder, name: renamed ? 'Fresh Files' : folder.name }]),
    });
    renderTree();
    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await screen.findByText('Project Files');
    await expandTo('Riverside Tower');
    await waitFor(() =>
      expect(screen.queryByText('Project Files')).not.toBeInTheDocument(),
    );
    const count = () =>
      fetchMock.mock.calls.filter(
        (call) => String(call[0]) === '/api/hubs/h1/projects/p1/folders',
      ).length;
    const before = count();
    renamed = true;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh documents' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(count()).toBe(before);

    await expandTo('Riverside Tower');
    expect(await screen.findByText('Fresh Files')).toBeInTheDocument();
    expect(count()).toBe(before + 1);
  });

  it('Refresh retries a folder that failed to load even when collapsed', async () => {
    let fail = true;
    const fetchMock = mockFetch({
      ...treeRoutes,
      '/api/hubs/h1/projects/p1/folders': () =>
        fail
          ? json({ error: 'Upstream unavailable' }, 502)
          : json(treeRoutes['/api/hubs/h1/projects/p1/folders']),
    });
    renderTree();
    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await screen.findByRole('alert');
    await expandTo('Riverside Tower');
    const count = () =>
      fetchMock.mock.calls.filter(
        (call) => String(call[0]) === '/api/hubs/h1/projects/p1/folders',
      ).length;
    const before = count();
    fail = false;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh documents' }));

    await waitFor(() => expect(count()).toBe(before + 1));
  });

  it('lazy-loads children when a node is expanded', async () => {
    const fetchMock = mockFetch(treeRoutes);
    renderTree();

    await screen.findByText('Studio hub');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Riverside Tower')).not.toBeInTheDocument();

    await expandTo('Studio hub');
    expect(await screen.findByText('Riverside Tower')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain(
      '/api/hubs/h1/projects',
    );
  });

  it('exposes tree semantics with expanded state', async () => {
    mockFetch(treeRoutes);
    renderTree();
    const tree = await screen.findByRole('tree', { name: 'Documents' });
    expect(tree).toBeInTheDocument();
    const hubRow = await screen.findByRole('treeitem', { name: 'Studio hub' });
    expect(hubRow).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(hubRow);
    await waitFor(() =>
      expect(
        screen.getByRole('treeitem', { name: 'Studio hub' }),
      ).toHaveAttribute('aria-expanded', 'true'),
    );
  });

  it('shows an error row with retry when loading fails', async () => {
    let fail = true;
    mockFetch({
      ...treeRoutes,
      '/api/hubs/h1/projects': () =>
        fail
          ? json({ error: 'Upstream unavailable' }, 502)
          : json(treeRoutes['/api/hubs/h1/projects']),
    });
    renderTree();

    await expandTo('Studio hub');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The service had a problem');
    expect(alert).not.toHaveTextContent('Upstream unavailable');
    expect(alert).toHaveAttribute('title', 'Upstream unavailable');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Riverside Tower')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('filters loaded nodes by name', async () => {
    mockFetch(treeRoutes);
    renderTree();

    await expandTo('Studio hub');
    await screen.findByText('Riverside Tower');

    const input = screen.getByRole('searchbox', {
      name: 'Filter loaded nodes',
    });
    fireEvent.change(input, { target: { value: 'river' } });
    const result = screen.getByRole('option', { name: /Riverside Tower/ });
    expect(result.querySelector('mark')).toHaveTextContent('River');
    expect(result).toHaveTextContent('Studio hub');
    expect(screen.queryByRole('option', { name: /^Studio hub/ })).toBeNull();

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('Nothing found')).toBeInTheDocument();
    expect(
      screen.getByText('No matches for “zzz” in loaded folders.'),
    ).toBeInTheDocument();
    expect(input).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: 'zzz' } });

    fireEvent.change(input, { target: { value: '' } });
    expect(await screen.findByText('Studio hub')).toBeInTheDocument();
  });

  it('opens a viewable version and ignores unviewable ones', async () => {
    mockFetch(treeRoutes);
    const onOpenModel = renderTree();

    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await expandTo('Project Files');
    await expandTo('Tower.rvt');

    const viewable = await screen.findByRole('treeitem', {
      name: 'v2: Coordination',
    });
    const plain = screen.getByRole('treeitem', { name: 'v1: Concept' });
    expect(plain).toHaveAttribute('aria-disabled', 'true');
    expect(viewable).not.toHaveAttribute('aria-disabled');

    fireEvent.click(plain);
    expect(onOpenModel).not.toHaveBeenCalled();

    fireEvent.click(viewable);
    expect(onOpenModel).toHaveBeenCalledWith('dXJuOmFkc2s', {
      file: 'Tower.rvt',
      v: 'v2',
      trail: ['h1', 'p1', 'f1', 'i1'],
      crumbs: ['Studio hub', 'Riverside Tower', 'Project Files'],
    });
  });

  it('shows a badge per view state and explains why a version cannot open', async () => {
    const version = (
      id: string,
      viewState: string,
      viewable: boolean,
      urn?: string,
    ) => ({
      id,
      kind: 'version',
      name: `${id}: 2026-01-01 10:00 by Sam`,
      hasChildren: false,
      viewable,
      viewState,
      parentId: 'i1',
      ...(urn ? { urn } : {}),
    });
    mockFetch({
      ...treeRoutes,
      '/api/projects/p1/items/i1/versions': [
        version('v1', 'ready', true, 'dXJuMQ'),
        version('v2', 'processing', false, 'dXJuMg'),
        version('v3', 'failed', false, 'dXJuMw'),
        version('v4', 'no-geometry', false, 'dXJuNA'),
        version('v5', 'not-translated', false, 'dXJuNQ'),
        version('v6', 'unknown', true, 'dXJuNg'),
      ],
    });
    const onOpenModel = renderTree();

    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await expandTo('Project Files');
    await expandTo('Tower.rvt');
    await screen.findByRole('treeitem', { name: /v1:/ });

    const row = (id: string) =>
      screen.getByRole('treeitem', { name: new RegExp(`^${id}:`) });
    expect(row('v1')).toHaveAttribute('data-view-state', 'ready');
    expect(row('v1')).toHaveAttribute('data-viewable', 'true');
    expect(row('v1')).toHaveTextContent('Viewable');
    expect(row('v2')).toHaveTextContent('Processing');
    expect(row('v3')).toHaveTextContent('Translation failed');
    expect(row('v4')).toHaveTextContent('No 3D or 2D view');
    expect(row('v5')).toHaveTextContent('Not translated');
    for (const id of ['v2', 'v3', 'v4', 'v5']) {
      expect(row(id)).toHaveAttribute('data-viewable', 'false');
      expect(row(id)).toHaveAttribute('aria-disabled', 'true');
    }
    expect(row('v6')).toHaveAttribute('data-viewable', 'true');
    expect(row('v6')).toHaveAttribute('data-view-state', 'unknown');
    expect(row('v6')).not.toHaveAttribute('aria-disabled');
    expect(row('v6')).toHaveTextContent('Unchecked');
    expect(row('v6')).not.toHaveTextContent('Viewable');

    fireEvent.click(row('v4'));
    expect(onOpenModel).not.toHaveBeenCalled();
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('v4 cannot be opened');
    expect(live).toHaveTextContent('publish a 3D view, or re-translate');

    fireEvent.click(row('v2'));
    expect(onOpenModel).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('still translating');

    fireEvent.click(row('v6'));
    expect(onOpenModel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.click(row('v1'));
    expect(onOpenModel).toHaveBeenCalledTimes(2);
  });

  describe('re-checking versions', () => {
    const versionOf = (viewState: string, viewable: boolean) => ({
      id: 'v9',
      kind: 'version',
      name: 'v9: 2026-01-01 10:00 by Sam',
      hasChildren: false,
      viewable,
      viewState,
      parentId: 'i1',
      urn: 'dXJuOQ',
    });

    async function openVersions(states: [string, boolean][], pollMs?: number) {
      let calls = 0;
      const mock = mockFetch({
        ...treeRoutes,
        '/api/projects/p1/items/i1/versions': () => {
          const [state, viewable] = states[
            Math.min(calls, states.length - 1)
          ] as [string, boolean];
          calls += 1;
          return json([versionOf(state, viewable)]);
        },
      });
      const onOpenModel = renderTree(vi.fn(), undefined, undefined, pollMs);
      await expandTo('Studio hub');
      await expandTo('Riverside Tower');
      await expandTo('Project Files');
      await expandTo('Tower.rvt');
      await screen.findByRole('treeitem', { name: /^v9:/ });
      return { mock, onOpenModel, calls: () => calls };
    }

    it('polls a processing item until its version is ready', async () => {
      const { calls } = await openVersions(
        [
          ['processing', false],
          ['processing', false],
          ['ready', true],
        ],
        40,
      );
      const row = () => screen.getByRole('treeitem', { name: /^v9:/ });
      expect(row()).toHaveAttribute('data-view-state', 'processing');
      await waitFor(
        () => expect(row()).toHaveAttribute('data-view-state', 'ready'),
        { timeout: 3000 },
      );
      const settled = calls();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(calls()).toBe(settled);
    });

    it('does not poll while the page is hidden', async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      try {
        const { calls } = await openVersions(
          [
            ['processing', false],
            ['ready', true],
          ],
          30,
        );
        await new Promise((resolve) => setTimeout(resolve, 250));
        expect(calls()).toBe(1);
        expect(screen.getByRole('treeitem', { name: /^v9:/ })).toHaveAttribute(
          'data-view-state',
          'processing',
        );
      } finally {
        Reflect.deleteProperty(document, 'visibilityState');
      }
    });

    it('Check again in the notice refetches the item versions', async () => {
      const { calls, onOpenModel } = await openVersions([
        ['failed', false],
        ['ready', true],
      ]);
      fireEvent.click(screen.getByRole('treeitem', { name: /^v9:/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
      await waitFor(() =>
        expect(screen.getByRole('treeitem', { name: /^v9:/ })).toHaveAttribute(
          'data-view-state',
          'ready',
        ),
      );
      expect(calls()).toBe(2);
      expect(onOpenModel).not.toHaveBeenCalled();
    });
  });

  it('reveals and selects the open version from a trail', async () => {
    mockFetch(treeRoutes);
    renderTree(vi.fn(), 'dXJuOmFkc2s', ['h1', 'p1', 'f1', 'i1']);

    const selected = await screen.findByRole(
      'treeitem',
      { name: 'v2: Coordination' },
      { timeout: 4000 },
    );
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Tower.rvt')).toBeInTheDocument();
  });

  it('ignores an unknown trail without failing', async () => {
    mockFetch(treeRoutes);
    renderTree(vi.fn(), 'dXJuOmFkc2s', ['nope']);

    expect(await screen.findByText('Studio hub')).toBeInTheDocument();
    expect(screen.queryByText('Riverside Tower')).not.toBeInTheDocument();
  });

  it('expands and collapses with arrow keys', async () => {
    mockFetch(treeRoutes);
    renderTree();

    const row = await screen.findByRole('treeitem', { name: 'Studio hub' });
    row.focus();
    fireEvent.keyDown(row, { key: 'ArrowRight' });
    expect(await screen.findByText('Riverside Tower')).toBeInTheDocument();
    fireEvent.keyUp(row, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Studio hub' }), {
      key: 'ArrowLeft',
    });
    await waitFor(() =>
      expect(screen.queryByText('Riverside Tower')).not.toBeInTheDocument(),
    );
  });

  it('explains an empty account, refetches on Refresh and disables the filter meanwhile', async () => {
    let hubs: unknown[] = [];
    const fetchMock = mockFetch({
      '/api/hubs': () => json(hubs),
    });
    renderTree();

    expect(
      screen.getByRole('searchbox', { name: 'Filter loaded nodes' }),
    ).toBeDisabled();
    expect(
      await screen.findByText('No projects to show yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Filter loaded nodes' }),
    ).toBeDisabled();

    hubs = treeRoutes['/api/hubs'];
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('Studio hub')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('searchbox', { name: 'Filter loaded nodes' }),
    ).toBeEnabled();
  });
});

function versionsRoute(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `vv${index}`,
    kind: 'version' as const,
    name: `v${index + 1}: Issue ${index + 1}`,
    hasChildren: false,
    viewable: true,
    viewState: 'ready' as const,
    urn: `urn-${index}`,
    parentId: 'i1',
  }));
}

async function openVersions(count: number, props = {}) {
  mockFetch({
    ...treeRoutes,
    '/api/projects/p1/items/i1/versions': versionsRoute(count),
  });
  const onOpenModel = vi.fn();
  const onOpenTogether = vi.fn();
  const client = createTestClient();
  render(
    <QueryClientProvider client={client}>
      <DocumentTree
        onOpenModel={onOpenModel}
        onOpenTogether={onOpenTogether}
        {...props}
      />
    </QueryClientProvider>,
  );
  await expandTo('Studio hub');
  await expandTo('Riverside Tower');
  await expandTo('Project Files');
  await expandTo('Tower.rvt');
  await screen.findByRole('treeitem', { name: 'v1: Issue 1' });
  return { onOpenModel, onOpenTogether };
}

const row = (n: number) =>
  screen.getByRole('treeitem', { name: `v${n}: Issue ${n}` });

describe('DocumentTree file rows', () => {
  const versions = [
    {
      id: 'vv1',
      kind: 'version' as const,
      name: 'v1: 2026-01-01 10:00 by Sam',
      hasChildren: false,
      viewable: true,
      viewState: 'ready' as const,
      urn: 'urn-old',
      parentId: 'i1',
      versionNumber: 1,
    },
    {
      id: 'vv2',
      kind: 'version' as const,
      name: 'v2: 2026-02-01 10:00 by Mei',
      hasChildren: false,
      viewable: true,
      viewState: 'ready' as const,
      urn: 'urn-new',
      parentId: 'i1',
      versionNumber: 2,
      latest: true,
    },
  ];

  async function setup(
    view: Partial<TreeView> = {},
    routes: Record<string, unknown> = {},
  ) {
    installMemoryStorage();
    window.localStorage.setItem(
      BSH_KEYS.preference.treeView,
      JSON.stringify({ ...DEFAULT_TREE_VIEW, ...view }),
    );
    mockFetch({
      ...treeRoutes,
      ...routes,
      '/api/projects/p1/items/i1/versions': versions,
    });
    const onOpenModel = vi.fn();
    render(
      <QueryClientProvider client={createTestClient()}>
        <DocumentTree onOpenModel={onOpenModel} />
      </QueryClientProvider>,
    );
    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await expandTo('Project Files');
    await screen.findByText('Tower.rvt');
    return onOpenModel;
  }

  const fileRow = () => screen.getByRole('treeitem', { name: /Tower\.rvt/ });

  it('keeps expanding a file row by default', async () => {
    const onOpenModel = await setup();
    fireEvent.click(fileRow());
    expect(onOpenModel).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('treeitem', { name: /^v1:/ }),
    ).toBeInTheDocument();
  });

  it('opens the latest version when clicking a file row', async () => {
    const onOpenModel = await setup({ itemOpen: 'latest' });
    fireEvent.click(fileRow());
    await waitFor(() =>
      expect(onOpenModel).toHaveBeenCalledWith(
        'urn-new',
        expect.objectContaining({ file: 'Tower.rvt', v: 'v2' }),
      ),
    );
  });

  it('opens the latest version from the file row menu', async () => {
    const onOpenModel = await setup();
    fireEvent.contextMenu(fileRow());
    fireEvent.click(
      within(screen.getByRole('menu')).getByText('Open latest version'),
    );
    await waitFor(() =>
      expect(onOpenModel).toHaveBeenCalledWith(
        'urn-new',
        expect.objectContaining({ file: 'Tower.rvt', v: 'v2' }),
      ),
    );
  });

  it('expands the versions of a file from Show versions', async () => {
    await setup();
    fireEvent.contextMenu(fileRow());
    fireEvent.click(
      within(screen.getByRole('menu')).getByText('Show versions'),
    );
    expect(
      await screen.findByRole('treeitem', { name: /^v2:/ }),
    ).toHaveTextContent('Latest');
  });

  it('renders no thumbnail images by default', async () => {
    await setup();
    expect(document.querySelector('.doc-tree img')).toBeNull();
  });

  it('renders a thumbnail on each file row when asked', async () => {
    await setup(
      { thumbnails: true, rows: 'thumbnails' },
      {
        '/api/projects/p1/folders/f1/contents': () =>
          json([{ ...item, tipUrn: 'urn-tip' }]),
      },
    );
    expect(fileRow().querySelector('img')?.getAttribute('src')).toBe(
      thumbnailPath('urn-tip', 100),
    );
  });

  it('previews a focused file row with Space', async () => {
    await setup();
    const row = fileRow();
    row.focus();
    fireEvent.keyDown(row, { key: ' ' });
    expect(
      await screen.findByRole('dialog', { name: 'Preview of Tower.rvt' }),
    ).toBeInTheDocument();
  });

  it('keeps focus on the filter when an outside pointer closes the preview', async () => {
    await setup();
    const row = fileRow();
    row.focus();
    fireEvent.keyDown(row, { key: ' ' });
    await screen.findByRole('dialog', { name: 'Preview of Tower.rvt' });
    const box = screen.getByRole('searchbox', { name: 'Filter loaded nodes' });
    box.focus();
    fireEvent.pointerDown(box);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(box);
  });

  it('returns focus to the row when Escape closes the preview', async () => {
    await setup();
    const row = fileRow();
    row.focus();
    fireEvent.keyDown(row, { key: ' ' });
    await screen.findByRole('dialog', { name: 'Preview of Tower.rvt' });
    screen.getByRole('searchbox', { name: 'Filter loaded nodes' }).focus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('opens the preview from the file row menu', async () => {
    await setup();
    fireEvent.contextMenu(fileRow());
    fireEvent.click(within(screen.getByRole('menu')).getByText('Preview'));
    expect(
      await screen.findByRole('dialog', { name: 'Preview of Tower.rvt' }),
    ).toBeInTheDocument();
  });
});

describe('DocumentTree version history', () => {
  function fakeLayout(open = false) {
    return {
      isOpen: vi.fn(() => open),
      focusPane: vi.fn(),
      togglePane: vi.fn(),
    };
  }

  async function setup(open = false) {
    installMemoryStorage();
    mockFetch(treeRoutes);
    const layout = fakeLayout(open);
    render(
      <QueryClientProvider client={createTestClient()}>
        <LayoutContext.Provider value={layout as unknown as LayoutApi}>
          <DocumentTree onOpenModel={vi.fn()} />
        </LayoutContext.Provider>
      </QueryClientProvider>,
    );
    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await expandTo('Project Files');
    await screen.findByText('Tower.rvt');
    return layout;
  }

  it('opens the version history pane from the file row menu', async () => {
    const layout = await setup();
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: /Tower\.rvt/ }));
    fireEvent.click(
      within(screen.getByRole('menu')).getByText('Version history'),
    );
    expect(layout.togglePane).toHaveBeenCalledWith('versions');
    expect(VERSION_TARGET.read()).toMatchObject({
      projectId: 'p1',
      itemId: 'i1',
      file: 'Tower.rvt',
      trail: ['h1', 'p1', 'f1', 'i1'],
    });
  });

  it('focuses the open pane from a version row menu', async () => {
    const layout = await setup(true);
    fireEvent.click(screen.getByText('Tower.rvt'));
    await screen.findByRole('treeitem', { name: /^v2:/ });
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: /^v1:/ }));
    fireEvent.click(
      within(screen.getByRole('menu')).getByText('Version history'),
    );
    expect(layout.focusPane).toHaveBeenCalledWith('versions');
    expect(VERSION_TARGET.read()).toMatchObject({ itemId: 'i1' });
  });
});

describe('DocumentTree multi-select', () => {
  it('opens picked versions as separate tabs', async () => {
    const onOpenTabs = vi.fn();
    await openVersions(3, { onOpenTabs });
    fireEvent.click(row(1), { ctrlKey: true });
    fireEvent.click(row(3), { metaKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Open 2 in viewer' }));
    expect(onOpenTabs).toHaveBeenCalledTimes(1);
    const picked = onOpenTabs.mock.calls[0]?.[0] as {
      urn: string;
      context: { file?: string; v?: string };
    }[];
    expect(picked.map((model) => model.urn)).toEqual(['urn-0', 'urn-2']);
    expect(picked[1]?.context).toMatchObject({ file: 'Tower.rvt', v: 'v3' });
    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it('blocks opening more than eight versions as tabs and says why', async () => {
    const onOpenTabs = vi.fn();
    await openVersions(9, { onOpenTabs });
    fireEvent.click(row(1), { ctrlKey: true });
    fireEvent.click(row(9), { shiftKey: true });
    expect(screen.getByText('9 selected')).toBeInTheDocument();
    const openTabs = screen.getByRole('button', {
      name: 'Open 9 in viewer',
    });
    expect(openTabs).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A viewer loads up to 8 models',
    );
    fireEvent.click(openTabs);
    expect(onOpenTabs).not.toHaveBeenCalled();
  });

  it('counts the loaded models against the limit', async () => {
    await openVersions(3, { openCount: 6, onOpenTabs: vi.fn() });
    fireEvent.click(row(1), { ctrlKey: true });
    fireEvent.click(row(3), { shiftKey: true });
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    const openTabs = screen.getByRole('button', { name: 'Open 3 in viewer' });
    expect(openTabs).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '6 models are already loaded',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Select 2 or fewer');
  });

  it('allows picks while the open tabs leave room', async () => {
    await openVersions(3, { openCount: 5, onOpenTabs: vi.fn() });
    fireEvent.click(row(1), { ctrlKey: true });
    fireEvent.click(row(3), { shiftKey: true });
    expect(
      screen.getByRole('button', { name: 'Open 3 in viewer' }),
    ).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('picks with Ctrl or Cmd click and Space and opens them together', async () => {
    const { onOpenModel, onOpenTogether } = await openVersions(3);
    expect(row(1)).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(row(1), { ctrlKey: true });
    fireEvent.click(row(3), { metaKey: true });
    fireEvent.keyDown(row(2), { key: ' ' });
    expect(onOpenModel).not.toHaveBeenCalled();
    expect(row(1)).toHaveAttribute('aria-checked', 'true');
    expect(row(2)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    fireEvent.keyDown(row(2), { key: ' ' });
    expect(row(2)).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Open together' }));
    expect(onOpenTogether).toHaveBeenCalledTimes(1);
    const picked = onOpenTogether.mock.calls[0]?.[0] as {
      urn: string;
      context: { file?: string; v?: string };
    }[];
    expect(picked.map((model) => model.urn)).toEqual(['urn-0', 'urn-2']);
    expect(picked[1]?.context).toMatchObject({ file: 'Tower.rvt', v: 'v3' });
    expect(row(1)).toHaveAttribute('aria-checked', 'false');
  });

  it('picks a range with Shift click', async () => {
    await openVersions(4);
    fireEvent.click(row(1), { ctrlKey: true });
    fireEvent.click(row(3), { shiftKey: true });
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(row(4)).toHaveAttribute('aria-checked', 'false');
  });

  it('saves the picked versions as a model set with their tree reference', async () => {
    installMemoryStorage();
    await openVersions(2);
    fireEvent.click(row(1), { ctrlKey: true });
    fireEvent.click(row(2), { metaKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save as model set' }));
    fireEvent.change(screen.getByLabelText('Model set name'), {
      target: { value: 'Picked versions' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save model set' }));
    const [set] = MODEL_SETS.list();
    expect(set?.name).toBe('Picked versions');
    expect(
      set?.data.members.map((member) => [
        member.urn,
        member.projectId,
        member.itemId,
        member.follow,
      ]),
    ).toEqual([
      ['urn-0', 'p1', 'i1', 'pinned'],
      ['urn-1', 'p1', 'i1', 'pinned'],
    ]);
  });

  it('refuses to open more than six together', async () => {
    await openVersions(7);
    fireEvent.click(row(1), { ctrlKey: true });
    fireEvent.click(row(7), { shiftKey: true });
    expect(screen.getByText('7 selected')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A combined view holds up to 6 models',
    );
    expect(
      screen.getByRole('button', { name: 'Open together' }),
    ).toBeDisabled();
  });

  it('adds a version to the open viewer from its row', async () => {
    const onAdd = vi.fn();
    await openVersions(2, {
      addTarget: {
        label: 'the open viewer',
        canAdd: (urn: string) => urn !== 'urn-0',
        has: () => false,
        onRemove: vi.fn(),
        onAdd,
      },
    });
    expect(
      screen.queryByRole('button', {
        name: 'Add Tower.rvt to the open viewer',
      }),
    ).not.toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Add Tower.rvt to the open viewer' })
        .getAttribute('title'),
    ).toContain('Space to select the version');
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Tower.rvt to the open viewer' }),
    );
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith([
        expect.objectContaining({ urn: 'urn-1' }),
      ]),
    );
  });

  it('swaps the add button for a remove button on added versions', async () => {
    const onRemove = vi.fn();
    await openVersions(2, {
      addTarget: {
        label: 'the open viewer',
        canAdd: () => false,
        has: (urn: string) => urn === 'urn-1',
        onAdd: vi.fn(),
        onRemove,
      },
    });
    expect(row(2)).toHaveAttribute('data-added', 'true');
    expect(row(1)).not.toHaveAttribute('data-added');
    const remove = screen.getByRole('button', {
      name: 'Remove Tower.rvt from the open viewer',
    });
    expect(remove).toHaveAttribute('title', 'Remove from the open viewer');
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith('urn-1');
    expect(screen.queryByRole('button', { name: /^Add Tower/ })).toBeNull();
  });

  it('opens a context menu on version rows with add, remove and modal', async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onOpenModal = vi.fn();
    await openVersions(2, {
      onOpenModal,
      onOpenTabs: vi.fn(),
      addTarget: {
        label: 'the open viewer',
        canAdd: () => true,
        has: (urn: string) => urn === 'urn-1',
        onAdd,
        onRemove,
      },
    });
    fireEvent.contextMenu(row(1));
    const first = screen.getByRole('menu');
    expect(
      within(first)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Open',
      'Open in new tab',
      'Open as modal',
      'Add to open model',
      'Pin',
      'Copy link',
      'Reveal path',
      'Show versions',
    ]);
    fireEvent.click(within(first).getByText('Open as modal'));
    expect(onOpenModal).toHaveBeenCalledWith(
      'urn-0',
      expect.objectContaining({ file: 'Tower.rvt' }),
    );
    fireEvent.keyDown(row(2), { key: 'F10', shiftKey: true });
    fireEvent.click(
      within(screen.getByRole('menu')).getByText('Remove from open model'),
    );
    expect(onRemove).toHaveBeenCalledWith('urn-1');
  });

  it('opens a version in a new tab from the row menu', async () => {
    const onOpenTabs = vi.fn();
    await openVersions(2, { onOpenTabs });
    fireEvent.contextMenu(row(1));
    fireEvent.click(
      within(screen.getByRole('menu')).getByText('Open in new tab'),
    );
    expect(onOpenTabs).toHaveBeenCalledWith([
      expect.objectContaining({
        urn: 'urn-0',
        context: expect.objectContaining({ file: 'Tower.rvt', v: 'v1' }),
      }),
    ]);
  });

  it('gives folders no context menu', async () => {
    await openVersions(1);
    fireEvent.contextMenu(
      screen.getByRole('treeitem', { name: 'Project Files' }),
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('copies the app link of the version from the row menu', async () => {
    notifications.clear();
    notifications.clearHistory();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await openVersions(1);
    fireEvent.contextMenu(row(1));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Copy link'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const url = new URL(writeText.mock.calls[0]?.[0] as string);
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe('/model/urn-0');
    expect(url.searchParams.get('file')).toBe('Tower.rvt');
    expect(url.searchParams.get('v')).toBe('v1');
    expect(JSON.parse(url.searchParams.get('trail') ?? '[]')).toEqual([
      'h1',
      'p1',
      'f1',
      'i1',
    ]);
    const toast = notifications.getSnapshot().items.at(-1);
    expect(toast?.message).toBe('Link copied');
    expect(toast?.detail).toBe(url.href);
    expect(notice()).toBe('');
  });

  it('reveals the path of a filtered version and expands its trail', async () => {
    await openVersions(1);
    fireEvent.click(screen.getByText('Tower.rvt'));
    await waitFor(() =>
      expect(
        screen.queryByRole('treeitem', { name: 'v1: Issue 1' }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Filter loaded nodes' }),
      { target: { value: 'Issue 1' } },
    );
    const result = screen.getByRole('option', { name: /v1: Issue 1/ });
    fireEvent.contextMenu(result);
    fireEvent.click(within(screen.getByRole('menu')).getByText('Reveal path'));
    const revealed = await screen.findByRole('treeitem', {
      name: 'v1: Issue 1',
    });
    expect(revealed).toBeInTheDocument();
    await waitFor(() => expect(revealed).toHaveFocus());
  });

  it('focuses the item from Show versions', async () => {
    await openVersions(1);
    fireEvent.contextMenu(row(1));
    fireEvent.click(
      within(screen.getByRole('menu')).getByText('Show versions'),
    );
    const parent = screen.getByRole('treeitem', { name: /Tower\.rvt/ });
    await waitFor(() => expect(parent).toHaveFocus());
  });
});

describe('DocumentTree keyboard', () => {
  it('focuses the filter with /', async () => {
    await openVersions(1);
    const target = row(1);
    target.focus();
    fireEvent.keyDown(target, { key: '/' });
    expect(
      screen.getByRole('searchbox', { name: 'Filter loaded nodes' }),
    ).toHaveFocus();
  });

  it('opens the focused version with Enter and keeps Space for picking', async () => {
    const { onOpenModel } = await openVersions(2);
    const target = row(1);
    target.focus();
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onOpenModel).toHaveBeenCalledTimes(1);
    expect(onOpenModel).toHaveBeenCalledWith(
      'urn-0',
      expect.objectContaining({ file: 'Tower.rvt', v: 'v1' }),
    );
    fireEvent.keyDown(target, { key: ' ' });
    expect(onOpenModel).toHaveBeenCalledTimes(1);
    expect(target).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('moves focus to the next row that matches what was typed', async () => {
    await openVersions(3);
    const first = row(1);
    first.focus();
    fireEvent.keyDown(first, { key: 'v' });
    await waitFor(() => expect(row(2)).toHaveFocus());
    fireEvent.keyDown(row(2), { key: '3' });
    await waitFor(() => expect(row(3)).toHaveFocus());
  });
});

const MIXED = [
  ['ready', 'urn-r1'],
  ['no-geometry', 'urn-ng'],
  ['ready', 'urn-r2'],
  ['processing', 'urn-pr'],
  ['ready', 'urn-r3'],
] as const;

async function openMixed(props = {}) {
  mockFetch({
    ...treeRoutes,
    '/api/projects/p1/items/i1/versions': MIXED.map(([state, urn], index) => ({
      id: `mx${index}`,
      kind: 'version' as const,
      name: `v${index + 1}: Issue ${index + 1}`,
      hasChildren: false,
      viewable: state === 'ready',
      viewState: state,
      urn,
      parentId: 'i1',
    })),
  });
  const onOpenModel = vi.fn();
  const onOpenTogether = vi.fn();
  const client = createTestClient();
  render(
    <QueryClientProvider client={client}>
      <DocumentTree
        onOpenModel={onOpenModel}
        onOpenTogether={onOpenTogether}
        pollMs={0}
        {...props}
      />
    </QueryClientProvider>,
  );
  await expandTo('Studio hub');
  await expandTo('Riverside Tower');
  await expandTo('Project Files');
  await expandTo('Tower.rvt');
  await screen.findByRole('treeitem', { name: 'v1: Issue 1' });
  return { onOpenModel, onOpenTogether };
}

const notice = () =>
  document.querySelector('.doc-tree__notice')?.textContent ?? '';

describe('DocumentTree picking skips blocked versions', () => {
  it('offers no add button on blocked versions', async () => {
    await openMixed({
      addTarget: {
        label: 'the open viewer',
        canAdd: () => true,
        has: () => false,
        onRemove: vi.fn(),
        onAdd: vi.fn(),
      },
    });
    expect(row(1).querySelector('.tree-row__action')).not.toBeNull();
    expect(row(2).querySelector('.tree-row__action')).toBeNull();
    expect(row(4).querySelector('.tree-row__action')).toBeNull();
  });
});

describe('DocumentTree versions that were never checked', () => {
  const never = (index: number) => ({
    id: `nv${index}`,
    kind: 'version' as const,
    name: `v${index}: Issue ${index}`,
    hasChildren: false,
    viewable: true,
    viewState: 'unknown' as const,
    checked: false,
    urn: `urn-${index}`,
    parentId: 'i1',
  });

  interface Setup {
    count?: number;
    respond?: (id: string, call: number) => Response;
    pollMs?: number;
    props?: Record<string, unknown>;
  }

  async function setup({
    count = 2,
    respond = () => state('ready'),
    pollMs = 0,
    props = {},
  }: Setup = {}) {
    let listings = 0;
    const calls: string[] = [];
    const routes: Record<string, unknown> = {
      ...treeRoutes,
      '/api/projects/p1/items/i1/versions': () => {
        listings += 1;
        return json(Array.from({ length: count }, (_, i) => never(i + 1)));
      },
    };
    for (let i = 1; i <= count; i++) {
      const id = `nv${i}`;
      routes[`/api/projects/p1/items/i1/versions/${id}/view-state`] = () => {
        calls.push(id);
        return respond(id, calls.filter((call) => call === id).length);
      };
    }
    mockFetch(routes);
    const onOpenModel = vi.fn();
    render(
      <QueryClientProvider client={createTestClient()}>
        <DocumentTree
          onOpenModel={onOpenModel}
          onOpenTogether={vi.fn()}
          pollMs={pollMs}
          {...props}
        />
      </QueryClientProvider>,
    );
    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await expandTo('Project Files');
    await expandTo('Tower.rvt');
    await screen.findByRole('treeitem', { name: 'v1: Issue 1' });
    return { onOpenModel, calls, listings: () => listings };
  }

  const state = (viewState: string) =>
    json({ viewState, viewable: viewState === 'ready' });

  it('checks a never-checked version before opening it', async () => {
    const { onOpenModel, calls } = await setup({
      respond: (id) => state(id === 'nv1' ? 'no-geometry' : 'ready'),
    });
    fireEvent.click(row(1));
    await waitFor(() => expect(notice()).toContain('cannot be opened'));
    expect(onOpenModel).not.toHaveBeenCalled();
    expect(row(1)).toHaveAttribute('data-view-state', 'no-geometry');
    fireEvent.click(row(2));
    await waitFor(() => expect(onOpenModel).toHaveBeenCalledTimes(1));
    expect(onOpenModel.mock.calls[0]?.[0]).toBe('urn-2');
    expect(calls).toEqual(['nv1', 'nv2']);
    fireEvent.click(row(2));
    await waitFor(() => expect(onOpenModel).toHaveBeenCalledTimes(2));
    expect(calls).toEqual(['nv1', 'nv2']);
  });

  it('checks before adding to the open viewer', async () => {
    const onAdd = vi.fn();
    await setup({
      respond: (id) => state(id === 'nv1' ? 'failed' : 'ready'),
      props: {
        addTarget: {
          label: 'the open viewer',
          canAdd: () => true,
          has: () => false,
          onRemove: vi.fn(),
          onAdd,
        },
      },
    });
    const buttons = screen.getAllByRole('button', {
      name: 'Add Tower.rvt to the open viewer',
    });
    fireEvent.click(buttons[0] as HTMLElement);
    await waitFor(() => expect(notice()).toContain('cannot be opened'));
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Tower.rvt to the open viewer' }),
    );
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
  });

  it('does not poll for versions that were never checked', async () => {
    const { listings } = await setup({ pollMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(listings()).toBe(1);
  });

  it('Check again forgets the on-demand result', async () => {
    const { onOpenModel, calls } = await setup({
      count: 1,
      respond: (_id, call) =>
        call === 1 ? state('processing') : state('ready'),
    });
    fireEvent.click(row(1));
    await screen.findByRole('button', { name: 'Check again' });
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await screen.findByRole('treeitem', { name: 'v1: Issue 1' });
    fireEvent.click(screen.getByRole('treeitem', { name: 'v1: Issue 1' }));
    await waitFor(() => expect(onOpenModel).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['nv1', 'nv1']);
  });

  it('polls the item while an on-demand check says processing', async () => {
    const { listings } = await setup({
      count: 1,
      respond: () => state('processing'),
      pollMs: 30,
    });
    fireEvent.click(row(1));
    await waitFor(() => expect(listings()).toBeGreaterThan(1), {
      timeout: 2000,
    });
  });

  it('picks a version whose check fails without checking it again', async () => {
    const { calls } = await setup({
      respond: () => json({ error: 'busy' }, 429),
    });
    fireEvent.click(row(1), { ctrlKey: true });
    await waitFor(() => expect(row(1)).toHaveAttribute('aria-checked', 'true'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toEqual(['nv1']);
    fireEvent.click(row(2), { shiftKey: true });
    await waitFor(() => expect(row(2)).toHaveAttribute('aria-checked', 'true'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect([...calls].sort()).toEqual(['nv1', 'nv1', 'nv2']);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('picks a version that cannot be checked without looping', async () => {
    const orphan = { ...never(1) } as Partial<ReturnType<typeof never>>;
    delete orphan.parentId;
    mockFetch({
      ...treeRoutes,
      '/api/projects/p1/items/i1/versions': () => json([orphan]),
    });
    render(
      <QueryClientProvider client={createTestClient()}>
        <DocumentTree onOpenModel={vi.fn()} onOpenTogether={vi.fn()} />
      </QueryClientProvider>,
    );
    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await expandTo('Project Files');
    await expandTo('Tower.rvt');
    await screen.findByRole('treeitem', { name: 'v1: Issue 1' });
    fireEvent.click(row(1), { ctrlKey: true });
    await waitFor(() => expect(row(1)).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(row(1), { shiftKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});

const PROJECT_ROOT: TreeRoot = {
  node: {
    id: 'p1',
    kind: 'project',
    name: 'Riverside Tower',
    hasChildren: true,
    viewable: false,
  },
  scope: { kind: 'project', id: 'p1', hubId: 'h1', projectId: 'p1' },
};

const topFolder = {
  ...folder,
  id: 'f1',
  name: 'Project Files',
  parentId: 'p1',
};

const nestedFolder = {
  ...folder,
  id: 'f2',
  name: 'Coordination',
  parentId: 'f1',
};

const wallsFile = {
  ...item,
  id: 'i-rvt',
  name: 'ARC-001_Walls.rvt',
  parentId: 'f1',
  tipUrn: 'urn-rvt',
  modifiedAt: '2025-02-11T00:00:00.000Z',
};

const facadeFile = {
  ...item,
  id: 'i-nwd',
  name: 'ARC-002_Facade.nwd',
  parentId: 'f2',
  tipUrn: 'urn-nwd',
  modifiedAt: '2025-02-10T00:00:00.000Z',
};

function projectRoutes(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    '/api/hubs/h1/projects/p1/folders': [topFolder],
    '/api/projects/p1/folders/f1/contents': [nestedFolder, wallsFile],
    '/api/projects/p1/folders/f2/contents': [facadeFile],
    ...overrides,
  };
}

const filterBox = () =>
  screen.getByRole('searchbox', { name: 'Filter loaded nodes' });

const callsTo = (mock: ReturnType<typeof mockFetch>, path: string) =>
  mock.mock.calls.filter((call) => String(call[0]) === path).length;

async function renderProject(
  routes: Record<string, unknown> = projectRoutes(),
  view: Partial<TreeView> = {},
) {
  installMemoryStorage();
  window.localStorage.setItem(
    BSH_KEYS.preference.treeView,
    JSON.stringify({ ...DEFAULT_TREE_VIEW, ...view }),
  );
  const fetchMock = mockFetch(routes);
  render(
    <QueryClientProvider client={createTestClient()}>
      <DocumentTree root={PROJECT_ROOT} onOpenModel={vi.fn()} pollMs={0} />
    </QueryClientProvider>,
  );
  await screen.findByRole('treeitem', { name: 'Project Files' });
  return fetchMock;
}

describe('DocumentTree deep search', () => {
  it('finds a file two folders down after searching the whole project', async () => {
    await renderProject();
    fireEvent.change(filterBox(), { target: { value: 'nwd' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Search whole project' }),
    );
    expect(
      await screen.findByRole('option', { name: /ARC-002_Facade\.nwd/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Searched 3 folders')).toBeInTheDocument();
  });

  it('lists only the chosen types when a chip is pressed', async () => {
    await renderProject();
    fireEvent.change(filterBox(), { target: { value: 'arc' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Search whole project' }),
    );
    await screen.findByRole('option', { name: /ARC-002_Facade\.nwd/ });
    expect(
      screen.getByRole('option', { name: /ARC-001_Walls\.rvt/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'rvt' }));
    expect(
      screen.queryByRole('option', { name: /ARC-002_Facade\.nwd/ }),
    ).toBeNull();
    expect(
      screen.getByRole('option', { name: /ARC-001_Walls\.rvt/ }),
    ).toBeInTheDocument();
  });

  it('cancels a crawl and makes no further requests', async () => {
    const fetchMock = await renderProject(
      projectRoutes({
        '/api/projects/p1/folders/f2/contents': () => new Promise(() => {}),
      }),
    );
    fireEvent.change(filterBox(), { target: { value: 'arc' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Search whole project' }),
    );
    await screen.findByRole('option', { name: /ARC-001_Walls\.rvt/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Search cancelled')).toBeInTheDocument();

    const before = callsTo(fetchMock, '/api/projects/p1/folders/f2/contents');
    expect(before).toBe(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(callsTo(fetchMock, '/api/projects/p1/folders/f2/contents')).toBe(
      before,
    );
  });

  it('ignores a cancelled crawl that settles after a restart', async () => {
    const releases: Array<() => void> = [];
    await renderProject(
      projectRoutes({
        '/api/projects/p1/folders/f2/contents': () =>
          new Promise<Response>((resolve) => {
            releases.push(() => resolve(json([facadeFile])));
          }),
      }),
    );
    fireEvent.change(filterBox(), { target: { value: 'arc' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Search whole project' }),
    );
    await waitFor(() => expect(releases).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Search whole project' }),
    );
    await waitFor(() => expect(releases).toHaveLength(2));
    await act(async () => {
      releases[0]?.();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByText('Searched 3 folders')).toBeNull();
  });

  it('tells the user to sign in when the session expires mid-search', async () => {
    await renderProject(
      projectRoutes({
        '/api/projects/p1/folders/f2/contents': () =>
          json({ error: 'expired' }, 401),
      }),
    );
    fireEvent.change(filterBox(), { target: { value: 'arc' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Search whole project' }),
    );
    expect(
      await screen.findByText(
        'Your session has expired. Sign in again to continue.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Search cancelled')).toBeNull();
  });

  it('waits for Retry-After on a 429 and then reads the folder', async () => {
    let attempts = 0;
    await renderProject(
      projectRoutes({
        '/api/projects/p1/folders/f2/contents': () => {
          attempts += 1;
          return attempts === 1
            ? new Response(JSON.stringify({ error: 'Rate limited' }), {
                status: 429,
                headers: {
                  'Content-Type': 'application/json',
                  'Retry-After': '1',
                },
              })
            : json([facadeFile]);
        },
      }),
    );
    vi.useFakeTimers();
    try {
      fireEvent.change(filterBox(), { target: { value: 'nwd' } });
      fireEvent.click(
        screen.getByRole('button', { name: 'Search whole project' }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(
        screen.getByRole('option', { name: /ARC-002_Facade\.nwd/ }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for a project when two projects are loaded', async () => {
    installMemoryStorage();
    mockFetch({
      '/api/hubs': treeRoutes['/api/hubs'],
      '/api/hubs/h1/projects': [
        treeRoutes['/api/hubs/h1/projects'][0],
        {
          ...treeRoutes['/api/hubs/h1/projects'][0],
          id: 'p2',
          name: 'Harbour',
        },
      ],
    });
    render(
      <QueryClientProvider client={createTestClient()}>
        <DocumentTree onOpenModel={vi.fn()} pollMs={0} />
      </QueryClientProvider>,
    );
    await expandTo('Studio hub');
    fireEvent.change(filterBox(), { target: { value: 'zzz' } });
    expect(
      screen.getByRole('button', { name: 'Search whole project' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Pick a project in the switcher to search all of it'),
    ).toBeInTheDocument();
  });

  it('opens the filters from the palette command', async () => {
    await renderProject();
    act(() => requestDeepSearch());
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(filterBox()).toHaveFocus();
  });

  it('opens the filters when the command ran before the tree mounted', async () => {
    requestDeepSearch();
    await renderProject();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('DocumentTree saved searches', () => {
  it('applies a saved search and starts the crawl for a project scope', async () => {
    const fetchMock = await renderProject(projectRoutes(), {
      searchScope: 'project',
    });
    fireEvent.change(filterBox(), { target: { value: 'arc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'rvt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saved searches' }));
    fireEvent.click(await screen.findByText('Save search'));
    fireEvent.change(screen.getByLabelText('Search name'), {
      target: { value: 'Facade plans' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save search' }));
    await waitFor(() => expect(DOC_SEARCHES.list()).toHaveLength(1));
    expect(DOC_SEARCHES.list()[0]?.data).toMatchObject({
      text: 'arc',
      types: ['rvt'],
      scope: 'project',
    });

    fireEvent.change(filterBox(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'rvt' }));
    const before = callsTo(fetchMock, '/api/projects/p1/folders/f1/contents');

    fireEvent.click(screen.getByRole('button', { name: 'Saved searches' }));
    fireEvent.click(await screen.findByText('Facade plans'));
    expect(filterBox()).toHaveValue('arc');
    expect(screen.getByRole('button', { name: 'rvt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(callsTo(fetchMock, '/api/projects/p1/folders/f1/contents')).toBe(
        before + 1,
      ),
    );
  });
});
