import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestClient,
  installMemoryStorage,
  json,
  mockFetch,
  stubLayout,
  treeRoutes,
} from '../../test/mockApi.js';
import { DocumentTree } from './DocumentTree.js';
import { hubScope, type TreeRoot } from './docRoot.js';

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

const hubRoot: TreeRoot = {
  node: {
    id: 'h1',
    kind: 'hub',
    name: 'Studio hub',
    hasChildren: true,
    viewable: false,
  },
  scope: hubScope('h1'),
};

function renderTree(props = {}) {
  render(
    <QueryClientProvider client={createTestClient()}>
      <DocumentTree onOpenModel={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

function paths(fetchMock: ReturnType<typeof mockFetch>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  stubLayout();
  installMemoryStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DocumentTree root', () => {
  it('starts at every hub by default', async () => {
    const fetchMock = mockFetch(treeRoutes);
    renderTree();
    expect(await screen.findByText('Studio hub')).toBeInTheDocument();
    expect(paths(fetchMock)).toContain('/api/hubs');
  });

  it('roots at a hub without listing the other hubs', async () => {
    const fetchMock = mockFetch(treeRoutes);
    renderTree({ root: hubRoot });
    expect(await screen.findByText('Riverside Tower')).toBeInTheDocument();
    expect(paths(fetchMock)).not.toContain('/api/hubs');
  });

  it('roots at a project and lists its folders directly', async () => {
    const fetchMock = mockFetch(treeRoutes);
    renderTree({ root: projectRoot });
    expect(await screen.findByText('Project Files')).toBeInTheDocument();
    expect(screen.queryByText('Studio hub')).not.toBeInTheDocument();
    expect(paths(fetchMock)).not.toContain('/api/hubs');
    expect(paths(fetchMock)).not.toContain('/api/hubs/h1/projects');
  });

  it('explains an empty hub root', async () => {
    mockFetch({ ...treeRoutes, '/api/hubs/h1/projects': () => json([]) });
    renderTree({ root: hubRoot });
    expect(await screen.findByText('No projects here yet')).toBeInTheDocument();
  });
});
