import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestClient,
  folder,
  installMemoryStorage,
  item,
  mockFetch,
  stubLayout,
  treeRoutes,
  viewableVersion,
} from '../../test/mockApi.js';
import { DocumentTree } from './DocumentTree.js';
import { MODEL_DRAG_TYPE, modelDragText } from './docDrag.js';
import type { TreeRoot } from './docRoot.js';

const projectRoot: TreeRoot = {
  node: {
    id: 'p1',
    kind: 'project',
    name: 'Riverside Tower',
    hasChildren: true,
    viewable: false,
  },
  scope: { kind: 'project', id: 'p1', hubId: 'h1', projectId: 'p1' },
};

beforeEach(() => {
  stubLayout();
  installMemoryStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DocumentTree version drag', () => {
  async function openVersions() {
    mockFetch(treeRoutes);
    render(
      <QueryClientProvider client={createTestClient()}>
        <DocumentTree onOpenModel={vi.fn()} root={projectRoot} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText('Project Files'));
    fireEvent.click(await screen.findByText('Tower.rvt'));
    return screen.findByRole('treeitem', { name: viewableVersion.name });
  }

  it('starts a drag with the custom model type', async () => {
    const row = await openVersions();
    expect(row).toHaveAttribute('draggable', 'true');
    const transfer = {
      types: [] as string[],
      setData: vi.fn(),
      effectAllowed: '',
    };
    fireEvent.dragStart(row, { dataTransfer: transfer });
    expect(transfer.setData).toHaveBeenCalledWith(
      MODEL_DRAG_TYPE,
      modelDragText({
        urn: 'dXJuOmFkc2s',
        context: {
          trail: ['p1', 'f1', 'i1'],
          crumbs: ['Riverside Tower', 'Project Files'],
          file: 'Tower.rvt',
          v: 'v2',
        },
      }),
    );
    expect(transfer.effectAllowed).toBe('copy');
  });

  it('leaves a version that cannot open undraggable', async () => {
    const row = await openVersions();
    const blocked = screen.getByRole('treeitem', { name: 'v1: Concept' });
    expect(blocked).not.toHaveAttribute('draggable');
    expect(row).toBeInTheDocument();
    expect(folder.id).toBe('f1');
    expect(item.id).toBe('i1');
  });
});
