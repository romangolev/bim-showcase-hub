import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestClient,
  json,
  mockFetch,
  stubLayout,
  treeRoutes,
} from '../../test/mockApi.js';
import { DocumentTree } from './DocumentTree.js';

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

describe('DocumentTree', () => {
  it('Refresh documents refetches the loaded folders', async () => {
    const fetchMock = mockFetch(treeRoutes);
    renderTree();
    await screen.findByText('Studio hub');
    const before = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh documents' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before),
    );
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
      screen.getByText(
        'No matches for “zzz” in loaded folders. Expand more folders to search deeper.',
      ),
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

    it('polls an unknown item again after it is collapsed and expanded', async () => {
      const { calls } = await openVersions([['unknown', true]], 25);
      await waitFor(() => expect(calls()).toBe(4), { timeout: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(calls()).toBe(4);
      fireEvent.click(screen.getByText('Tower.rvt'));
      await waitFor(() =>
        expect(
          screen.queryByRole('treeitem', { name: /^v9:/ }),
        ).not.toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText('Tower.rvt'));
      await screen.findByRole('treeitem', { name: /^v9:/ });
      await waitFor(() => expect(calls()).toBeGreaterThan(5), {
        timeout: 2000,
      });
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

describe('DocumentTree multi-select', () => {
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
  it('does not pick a blocked version and explains it on Ctrl click and Space', async () => {
    const { onOpenModel } = await openMixed();
    expect(row(2)).not.toHaveAttribute('aria-checked');
    fireEvent.click(row(2), { ctrlKey: true });
    expect(notice()).toContain('cannot be opened');
    expect(screen.queryByText(/selected$/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.keyDown(row(4), { key: ' ' });
    expect(notice()).toContain('cannot be opened');
    expect(onOpenModel).not.toHaveBeenCalled();
    expect(row(4)).not.toHaveAttribute('aria-checked');
  });

  it('skips blocked versions in a Shift range and says so', async () => {
    const { onOpenTogether } = await openMixed();
    fireEvent.click(row(1), { ctrlKey: true });
    fireEvent.click(row(5), { shiftKey: true });
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(notice()).toContain(
      'Skipped 2 versions that cannot be opened: No 3D or 2D view, Processing',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open together' }));
    const picked = onOpenTogether.mock.calls[0]?.[0] as { urn: string }[];
    expect(picked.map((model) => model.urn)).toEqual([
      'urn-r1',
      'urn-r2',
      'urn-r3',
    ]);
  });

  it('offers no add button on blocked versions', async () => {
    await openMixed({
      addTarget: {
        label: 'the open viewer',
        canAdd: () => true,
        onAdd: vi.fn(),
      },
    });
    expect(row(1).querySelector('.tree-row__action')).not.toBeNull();
    expect(row(2).querySelector('.tree-row__action')).toBeNull();
    expect(row(4).querySelector('.tree-row__action')).toBeNull();
  });
});

describe('DocumentTree versions that were never checked', () => {
  const never = (index: number, urn: string) => ({
    id: `nv${index}`,
    kind: 'version' as const,
    name: `v${index}: Issue ${index}`,
    hasChildren: false,
    viewable: true,
    viewState: 'unknown' as const,
    checked: false,
    urn,
    parentId: 'i1',
  });

  async function openNever(
    states: Record<string, string>,
    props: Record<string, unknown> = {},
    pollMs = 0,
  ) {
    let listings = 0;
    const checks: string[] = [];
    const routes: Record<string, unknown> = {
      ...treeRoutes,
      '/api/projects/p1/items/i1/versions': () => {
        listings += 1;
        return json([never(1, 'urn-1'), never(2, 'urn-2')]);
      },
    };
    for (const [id, state] of Object.entries(states)) {
      routes[`/api/projects/p1/items/i1/versions/${id}/view-state`] = () => {
        checks.push(id);
        return json({ viewState: state, viewable: state === 'ready' });
      };
    }
    mockFetch(routes);
    const onOpenModel = vi.fn();
    const onOpenTogether = vi.fn();
    render(
      <QueryClientProvider client={createTestClient()}>
        <DocumentTree
          onOpenModel={onOpenModel}
          onOpenTogether={onOpenTogether}
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
    return { onOpenModel, onOpenTogether, checks, listings: () => listings };
  }

  it('checks a never-checked version before opening it', async () => {
    const { onOpenModel, checks } = await openNever({
      nv1: 'no-geometry',
      nv2: 'ready',
    });
    fireEvent.click(row(1));
    await waitFor(() =>
      expect(
        document.querySelector('.doc-tree__notice')?.textContent,
      ).toContain('cannot be opened'),
    );
    expect(onOpenModel).not.toHaveBeenCalled();
    expect(row(1)).toHaveAttribute('data-view-state', 'no-geometry');
    fireEvent.click(row(2));
    await waitFor(() => expect(onOpenModel).toHaveBeenCalledTimes(1));
    expect(onOpenModel.mock.calls[0]?.[0]).toBe('urn-2');
    expect(checks).toEqual(['nv1', 'nv2']);
    fireEvent.click(row(2));
    await waitFor(() => expect(onOpenModel).toHaveBeenCalledTimes(2));
    expect(checks).toEqual(['nv1', 'nv2']);
  });

  it('checks before picking and never picks a blocked one', async () => {
    await openNever({ nv1: 'processing', nv2: 'ready' });
    fireEvent.click(row(1), { ctrlKey: true });
    await waitFor(() =>
      expect(
        document.querySelector('.doc-tree__notice')?.textContent,
      ).toContain('cannot be opened'),
    );
    expect(row(1)).not.toHaveAttribute('aria-checked', 'true');
    fireEvent.click(row(2), { ctrlKey: true });
    await waitFor(() => expect(row(2)).toHaveAttribute('aria-checked', 'true'));
  });

  it('checks before adding to the open viewer', async () => {
    const onAdd = vi.fn();
    await openNever(
      { nv1: 'failed', nv2: 'ready' },
      {
        addTarget: {
          label: 'the open viewer',
          canAdd: () => true,
          onAdd,
        },
      },
    );
    const buttons = screen.getAllByRole('button', {
      name: 'Add Tower.rvt to the open viewer',
    });
    fireEvent.click(buttons[0] as HTMLElement);
    await waitFor(() =>
      expect(
        document.querySelector('.doc-tree__notice')?.textContent,
      ).toContain('cannot be opened'),
    );
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Tower.rvt to the open viewer' }),
    );
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
  });

  it('does not poll for versions that were never checked', async () => {
    const { listings } = await openNever({}, {}, 20);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(listings()).toBe(1);
  });
});

describe('DocumentTree on-demand checks', () => {
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
    count: number;
    respond: (id: string, call: number) => Response | Promise<Response>;
    pollMs?: number;
  }

  async function setup({ count, respond, pollMs = 0 }: Setup) {
    let listings = 0;
    const calls: string[] = [];
    let running = 0;
    let peak = 0;
    const routes: Record<string, unknown> = {
      ...treeRoutes,
      '/api/projects/p1/items/i1/versions': () => {
        listings += 1;
        return json(Array.from({ length: count }, (_, i) => never(i + 1)));
      },
    };
    for (let i = 1; i <= count; i++) {
      const id = `nv${i}`;
      routes[`/api/projects/p1/items/i1/versions/${id}/view-state`] =
        async () => {
          calls.push(id);
          running += 1;
          peak = Math.max(peak, running);
          try {
            return await respond(
              id,
              calls.filter((call) => call === id).length,
            );
          } finally {
            running -= 1;
          }
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
        />
      </QueryClientProvider>,
    );
    await expandTo('Studio hub');
    await expandTo('Riverside Tower');
    await expandTo('Project Files');
    await expandTo('Tower.rvt');
    await screen.findByRole('treeitem', { name: 'v1: Issue 1' });
    return {
      onOpenModel,
      calls,
      peak: () => peak,
      listings: () => listings,
    };
  }

  const state = (viewState: string) =>
    json({ viewState, viewable: viewState === 'ready' });

  it('does not keep a failed check and asks again next time', async () => {
    const { onOpenModel, calls } = await setup({
      count: 1,
      respond: (_id, call) =>
        call === 1 ? json({ error: 'busy' }, 429) : state('no-geometry'),
    });
    fireEvent.click(row(1));
    await waitFor(() => expect(onOpenModel).toHaveBeenCalledTimes(1));
    fireEvent.click(row(1));
    await waitFor(() =>
      expect(
        document.querySelector('.doc-tree__notice')?.textContent,
      ).toContain('cannot be opened'),
    );
    expect(calls).toEqual(['nv1', 'nv1']);
    expect(onOpenModel).toHaveBeenCalledTimes(1);
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
      count: 2,
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

  it('checks only the picked range, once per version, four at a time', async () => {
    const gate: (() => void)[] = [];
    const { calls, peak } = await setup({
      count: 8,
      respond: () =>
        new Promise<Response>((resolve) => {
          gate.push(() => resolve(state('ready')));
        }),
    });
    fireEvent.click(row(2), { ctrlKey: true });
    fireEvent.click(row(2), { ctrlKey: true });
    await waitFor(() => expect(gate).toHaveLength(1));
    gate.shift()?.();
    await waitFor(() =>
      expect(row(2)).toHaveAttribute('data-view-state', 'ready'),
    );
    expect(calls).toEqual(['nv2']);
    if (row(2).getAttribute('aria-checked') !== 'true') {
      fireEvent.click(row(2), { ctrlKey: true });
    }
    expect(row(2)).toHaveAttribute('aria-checked', 'true');
    expect(calls).toEqual(['nv2']);
    fireEvent.click(row(8), { shiftKey: true });
    await waitFor(() => expect(gate.length).toBeGreaterThan(0));
    while (gate.length > 0 || calls.length < 7) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      gate.shift()?.();
    }
    await waitFor(() =>
      expect(screen.getByText('7 selected')).toBeInTheDocument(),
    );
    expect([...calls].sort()).toEqual(
      ['nv2', 'nv3', 'nv4', 'nv5', 'nv6', 'nv7', 'nv8'].sort(),
    );
    expect(peak()).toBeLessThanOrEqual(4);
  });
});
