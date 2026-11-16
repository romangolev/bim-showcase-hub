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
    expect(screen.getByText('No loaded nodes match')).toBeInTheDocument();

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
});
