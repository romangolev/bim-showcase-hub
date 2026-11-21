import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenModelsStore } from '../api/openModels.js';
import { OpenModelsContext } from '../api/useOpenModels.js';
import type { ModelOpeners } from '../components/tree/useModelOpeners.js';
import { MODEL_SETS, type ModelSetMember } from '../store/modelSets.js';
import { tasks } from '../tasks/taskStore.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
} from '../test/mockApi.js';
import { ModelSets, saveModelSetPrompt } from './ModelSets.js';

function stubOpeners(): ModelOpeners {
  return {
    open: vi.fn(),
    openTabs: vi.fn(),
    openTogether: vi.fn(),
    openModal: vi.fn(),
    addTarget: null,
    loaded: 0,
  };
}

function renderSets(openers: ModelOpeners, client = createTestClient()) {
  return render(
    <QueryClientProvider client={client}>
      <ModelSets openers={openers} />
    </QueryClientProvider>,
  );
}

function save(
  name: string,
  urns: string[],
  extra: Partial<ModelSetMember> = {},
) {
  return MODEL_SETS.save(name, {
    members: urns.map((urn) => ({ urn, follow: 'pinned', ...extra })),
  });
}

function rows(): HTMLElement[] {
  return within(
    screen.getByRole('region', { name: 'Model sets' }),
  ).getAllByRole('listitem');
}

function openMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
}

function choose(item: string) {
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModelSets', () => {
  it('lists saved sets in order and moves one up', async () => {
    save('First', ['u1']);
    save('Second', ['u2']);
    renderSets(stubOpeners());
    expect(rows()[0]).toHaveTextContent('First');
    expect(rows()[1]).toHaveTextContent('Second');

    openMenu('Second');
    choose('Move up');
    await waitFor(() =>
      expect(MODEL_SETS.list().map((set) => set.name)).toEqual([
        'Second',
        'First',
      ]),
    );
    await waitFor(() => expect(rows()[0]).toHaveTextContent('Second'));
  });

  it('opens a set as tabs or as one combined viewer', async () => {
    save('Coordination', ['u1', 'u2', 'u3']);
    const openers = stubOpeners();
    renderSets(openers);

    fireEvent.click(screen.getByRole('button', { name: 'Open Coordination' }));
    await waitFor(() =>
      expect(openers.openTabs).toHaveBeenCalledWith([
        { urn: 'u1', context: {} },
        { urn: 'u2', context: {} },
        { urn: 'u3', context: {} },
      ]),
    );

    openMenu('Coordination');
    choose('Open together');
    await waitFor(() => expect(openers.openTogether).toHaveBeenCalledTimes(1));
  });

  it('disables the combined viewer and links above their limits', () => {
    save('Seven', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']);
    renderSets(stubOpeners());
    openMenu('Seven');
    const together = screen.getByRole('menuitem', { name: 'Open together' });
    expect(together).toBeDisabled();
    expect(together).toHaveAttribute(
      'title',
      'A combined viewer holds 6 models',
    );
    const link = screen.getByRole('menuitem', { name: 'Copy link' });
    expect(link).toBeDisabled();
    expect(link).toHaveAttribute('title', 'Links carry up to 6 models');
  });

  it('copies a link that carries every member', async () => {
    save('Pair', ['u1', 'u2']);
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderSets(stubOpeners());
    openMenu('Pair');
    choose('Copy link');
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const href = writeText.mock.calls[0]?.[0] as string;
    expect(href).toContain('/model/u1');
    expect(href).toContain('with=u2');
  });

  it('renames a set from its menu', async () => {
    save('Old name', ['u1']);
    renderSets(stubOpeners());
    openMenu('Old name');
    choose('Rename');
    fireEvent.change(screen.getByLabelText('Rename Old name'), {
      target: { value: 'New name' },
    });
    fireEvent.blur(screen.getByLabelText('Rename Old name'));
    await waitFor(() => expect(MODEL_SETS.list()[0]?.name).toBe('New name'));
  });

  it('deletes a set only after a confirmation', async () => {
    save('Temporary', ['u1']);
    renderSets(stubOpeners());
    openMenu('Temporary');
    choose('Delete');
    expect(MODEL_SETS.list()).toHaveLength(1);
    expect(screen.getByText('Delete "Temporary"?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel delete' }));
    expect(MODEL_SETS.list()).toHaveLength(1);

    openMenu('Temporary');
    choose('Delete');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(MODEL_SETS.list()).toHaveLength(0));
    expect(screen.getByText('No model sets yet.')).toBeInTheDocument();
  });

  it('reports stale members and updates them to their latest versions', async () => {
    save('Pinned', ['old'], {
      file: 'a.rvt',
      projectId: 'p1',
      itemId: 'i1',
    });
    mockFetch({
      '/api/projects/p1/items/i1/versions': [
        {
          id: 'v2',
          kind: 'version',
          name: 'v2: 2026-02-01 10:00 by Mei',
          hasChildren: false,
          viewable: true,
          viewState: 'ready',
          urn: 'new',
          parentId: 'i1',
          versionNumber: 2,
          latest: true,
        },
      ],
    });
    renderSets(stubOpeners());
    expect(
      await screen.findByText('1 file has a newer version'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update to latest' }));
    await waitFor(() =>
      expect(MODEL_SETS.list()[0]?.data.members[0]?.urn).toBe('new'),
    );
  });
});

describe('opening a set past the tab limit', () => {
  it('fails the task instead of reporting models as opened', async () => {
    const store = createOpenModelsStore(null);
    for (let index = 0; index < 8; index += 1) store.open(`loaded${index}`);
    save('Extra', ['n1', 'n2']);
    const openers = stubOpeners();
    render(
      <QueryClientProvider client={createTestClient()}>
        <OpenModelsContext.Provider value={store}>
          <ModelSets openers={openers} />
        </OpenModelsContext.Provider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Extra' }));
    await waitFor(() =>
      expect(tasks.getSnapshot().tasks.at(-1)?.state).not.toBe('running'),
    );
    const task = tasks.getSnapshot().tasks.at(-1);
    expect(task?.state).toBe('failed');
    expect(task?.detail).not.toContain('opened');
    expect(openers.openTabs).not.toHaveBeenCalled();
  });
});

describe('ModelSets version lookups', () => {
  const versions = [
    {
      id: 'v2',
      kind: 'version',
      name: 'v2: 2026-02-01 10:00 by Mei',
      hasChildren: false,
      viewable: true,
      viewState: 'ready',
      urn: 'new',
      parentId: 'i1',
      versionNumber: 2,
      latest: true,
    },
  ];
  const linked = { projectId: 'p1', itemId: 'i1', file: 'a.rvt' };

  it('reads the versions again only for the set that changed', async () => {
    save('A', ['old'], linked);
    const fetcher = mockFetch({
      '/api/projects/p1/items/i1/versions': versions,
      '/api/projects/p2/items/i2/versions': versions,
    });
    renderSets(stubOpeners());
    await screen.findByText('1 file has a newer version');
    expect(fetcher).toHaveBeenCalledTimes(1);

    save('B', ['old2'], { projectId: 'p2', itemId: 'i2' });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reuses cached versions when the list mounts again', async () => {
    save('A', ['old'], linked);
    const fetcher = mockFetch({
      '/api/projects/p1/items/i1/versions': versions,
    });
    const client = createTestClient();
    const first = renderSets(stubOpeners(), client);
    await screen.findByText('1 file has a newer version');
    first.unmount();
    renderSets(stubOpeners(), client);
    await screen.findByText('1 file has a newer version');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not read versions for a set without tree references', async () => {
    save('Plain', ['u1']);
    const fetcher = mockFetch({});
    renderSets(stubOpeners());
    await screen.findByText('Plain');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('saveModelSetPrompt', () => {
  it('saves the models with the tree reference as members', async () => {
    saveModelSetPrompt([
      {
        urn: 'u1',
        context: {
          file: 'A.rvt',
          v: 'v2',
          trail: ['h1', 'p1', 'f1', 'i1'],
          crumbs: ['Hub', 'Project'],
        },
        ref: {
          projectId: 'p1',
          itemId: 'i1',
          file: 'A.rvt',
          trail: ['h1', 'p1', 'f1', 'i1'],
          crumbs: ['Hub', 'Project'],
        },
      },
    ]);
    fireEvent.change(screen.getByLabelText('Model set name'), {
      target: { value: 'Coordination' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save model set' }));
    const [set] = MODEL_SETS.list();
    expect(set?.name).toBe('Coordination');
    expect(set?.data.members).toEqual([
      {
        urn: 'u1',
        file: 'A.rvt',
        v: 'v2',
        trail: ['h1', 'p1', 'f1', 'i1'],
        crumbs: ['Hub', 'Project'],
        projectId: 'p1',
        itemId: 'i1',
        follow: 'pinned',
      },
    ]);
    await waitFor(() =>
      expect(screen.queryByLabelText('Model set name')).toBeNull(),
    );
  });
});
