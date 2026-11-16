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
    expect(await screen.findByText('No hubs found')).toBeInTheDocument();
    expect(
      screen.getByText('Add your Autodesk account to a hub, then refresh.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Filter loaded nodes' }),
    ).toBeDisabled();

    hubs = treeRoutes['/api/hubs'];
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Studio hub')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('searchbox', { name: 'Filter loaded nodes' }),
    ).toBeEnabled();
  });
});
