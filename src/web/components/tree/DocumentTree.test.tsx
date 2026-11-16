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
) {
  const client = createTestClient();
  render(
    <QueryClientProvider client={client}>
      <DocumentTree
        onOpenModel={onOpenModel}
        selectedUrn={selectedUrn}
        revealTrail={revealTrail}
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

function versionsRoute(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `vv${index}`,
    kind: 'version' as const,
    name: `v${index + 1}: Issue ${index + 1}`,
    hasChildren: false,
    viewable: true,
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Tower.rvt to the open viewer' }),
    );
    expect(onAdd).toHaveBeenCalledWith([
      expect.objectContaining({ urn: 'urn-1' }),
    ]);
  });
});
