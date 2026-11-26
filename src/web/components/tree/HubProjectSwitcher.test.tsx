import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { childrenQueryOptions } from '../../api/hooks.js';
import { type NodeScope, ROOT_SCOPE } from '../../api/scope.js';
import {
  createTestClient,
  hub,
  installMemoryStorage,
  json,
  mockFetch,
  project,
  stubLayout,
  treeRoutes,
} from '../../test/mockApi.js';
import { DocumentTree } from './DocumentTree.js';
import {
  DOC_ROOT,
  DOC_ROOT_KEY,
  hubScope,
  type TreeRoot,
  treeRootOf,
} from './docRoot.js';
import { HubProjectSwitcher } from './HubProjectSwitcher.js';

async function renderSwitcher(
  onChange = vi.fn(),
  scopes: NodeScope[] = [ROOT_SCOPE],
) {
  const client = createTestClient();
  for (const scope of scopes) {
    await client.ensureQueryData(childrenQueryOptions(scope));
  }
  const view = render(
    <QueryClientProvider client={client}>
      <HubProjectSwitcher onChange={onChange} />
    </QueryClientProvider>,
  );
  return { onChange, view };
}

async function openMenu(name: 'Documents hub' | 'Documents project') {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('menu', { name });
}

beforeEach(() => {
  installMemoryStorage();
  mockFetch(treeRoutes);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HubProjectSwitcher', () => {
  it('starts at all hubs', async () => {
    await renderSwitcher();
    expect(
      within(screen.getByRole('button', { name: 'Documents hub' })).getByText(
        'All hubs',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Documents project' }),
    ).not.toBeInTheDocument();
  });

  it('roots at a hub when one is chosen', async () => {
    const { onChange } = await renderSwitcher();
    const menu = await openMenu('Documents hub');
    fireEvent.click(
      await within(menu).findByRole('menuitemcheckbox', { name: 'Studio hub' }),
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          node: expect.objectContaining({ id: 'h1', name: 'Studio hub' }),
          scope: { kind: 'hub', id: 'h1', hubId: 'h1' },
        }),
      ),
    );
    expect(
      await screen.findByRole('button', { name: 'Documents project' }),
    ).toBeInTheDocument();
  });

  it('roots at a project and remembers it across a reload', async () => {
    const first = await renderSwitcher(vi.fn(), [ROOT_SCOPE, hubScope('h1')]);
    fireEvent.click(screen.getByRole('button', { name: 'Documents hub' }));
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Studio hub' }),
    );
    const projectMenu = await openMenu('Documents project');
    fireEvent.click(
      await within(projectMenu).findByRole('menuitemcheckbox', {
        name: 'Riverside Tower',
      }),
    );

    await waitFor(() =>
      expect(first.onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          node: expect.objectContaining({ id: 'p1', kind: 'project' }),
          scope: {
            kind: 'project',
            id: 'p1',
            hubId: 'h1',
            projectId: 'p1',
          },
        }),
      ),
    );
    expect(
      JSON.parse(window.localStorage.getItem(DOC_ROOT_KEY) ?? 'null'),
    ).toEqual({ hubId: 'h1', projectId: 'p1' });

    first.view.unmount();
    const second = await renderSwitcher(vi.fn(), [ROOT_SCOPE, hubScope('h1')]);
    const trigger = await screen.findByRole('button', {
      name: 'Documents project',
    });
    await waitFor(() =>
      expect(within(trigger).getByText('Riverside Tower')).toBeInTheDocument(),
    );
    expect(second.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: { kind: 'project', id: 'p1', hubId: 'h1', projectId: 'p1' },
      }),
    );
  });

  it('falls back to the hub when the stored project is stale', async () => {
    window.localStorage.setItem(
      DOC_ROOT_KEY,
      JSON.stringify({ hubId: 'h1', projectId: 'gone' }),
    );
    const { onChange } = await renderSwitcher(vi.fn(), [
      ROOT_SCOPE,
      hubScope('h1'),
    ]);
    const trigger = await screen.findByRole('button', {
      name: 'Documents project',
    });
    await waitFor(() =>
      expect(within(trigger).getByText('All projects')).toBeInTheDocument(),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        node: expect.objectContaining({ id: 'h1' }),
        scope: { kind: 'hub', id: 'h1', hubId: 'h1' },
      }),
    );
  });

  it('falls back to all hubs when the stored hub is stale', async () => {
    window.localStorage.setItem(
      DOC_ROOT_KEY,
      JSON.stringify({ hubId: 'gone', projectId: null }),
    );
    const { onChange } = await renderSwitcher();
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          scope: { kind: 'root' },
        }),
      ),
    );
    expect(
      within(screen.getByRole('button', { name: 'Documents hub' })).getByText(
        'All hubs',
      ),
    ).toBeInTheDocument();
    expect(hub.id).toBe('h1');
    expect(project.id).toBe('p1');
  });

  it('returns to all hubs from the menu', async () => {
    const { onChange } = await renderSwitcher();
    fireEvent.click(screen.getByRole('button', { name: 'Documents hub' }));
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Studio hub' }),
    );
    const menu = await openMenu('Documents hub');
    fireEvent.click(
      within(menu).getByRole('menuitemcheckbox', { name: 'All hubs' }),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ scope: { kind: 'root' } }),
      ),
    );
    expect(window.localStorage.getItem(DOC_ROOT_KEY)).toBe(
      JSON.stringify({ hubId: '', projectId: null }),
    );
  });

  it('survives a hub with no projects', async () => {
    mockFetch({ ...treeRoutes, '/api/hubs/h1/projects': () => json([]) });
    window.localStorage.setItem(
      DOC_ROOT_KEY,
      JSON.stringify({ hubId: 'h1', projectId: null }),
    );
    const { view } = await renderSwitcher(vi.fn(), [
      ROOT_SCOPE,
      hubScope('h1'),
    ]);
    const menu = await openMenu('Documents project');
    expect(
      await within(menu).findByRole('menuitemcheckbox', {
        name: 'All projects',
      }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitemcheckbox', {
        name: 'Riverside Tower',
      }),
    ).not.toBeInTheDocument();
    view.unmount();
  });
});

function DocumentsHarness() {
  const [root, setRoot] = useState<TreeRoot>(() =>
    treeRootOf(DOC_ROOT.read(), undefined, undefined),
  );
  return (
    <>
      <HubProjectSwitcher onChange={setRoot} />
      <DocumentTree
        key={`${root.scope.kind}:${root.node.id}`}
        root={root}
        onOpenModel={vi.fn()}
      />
    </>
  );
}

describe('HubProjectSwitcher with a persisted root', () => {
  it('reaches the checklist when the app is not provisioned', async () => {
    stubLayout();
    window.localStorage.setItem(
      DOC_ROOT_KEY,
      JSON.stringify({ hubId: 'h1', projectId: null }),
    );
    mockFetch({
      '/api/hubs': () =>
        json(
          { error: 'App not provisioned', code: 'app_not_provisioned' },
          403,
        ),
    });
    render(
      <QueryClientProvider client={createTestClient()}>
        <DocumentsHarness />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText('No projects to show yet'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: 'Documents hub' })).getByText(
        'All hubs',
      ),
    ).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem(DOC_ROOT_KEY) ?? 'null'),
    ).toEqual({ hubId: 'h1', projectId: null });
  });
});
