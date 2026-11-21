import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelOpeners } from '../components/tree/useModelOpeners.js';
import { MODEL_SETS, type ModelSetMember } from '../store/modelSets.js';
import { installMemoryStorage, mockFetch } from '../test/mockApi.js';
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
    render(<ModelSets openers={stubOpeners()} />);
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
    render(<ModelSets openers={openers} />);

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
    render(<ModelSets openers={stubOpeners()} />);
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
    render(<ModelSets openers={stubOpeners()} />);
    openMenu('Pair');
    choose('Copy link');
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const href = writeText.mock.calls[0]?.[0] as string;
    expect(href).toContain('/model/u1');
    expect(href).toContain('with=u2');
  });

  it('renames a set from its menu', async () => {
    save('Old name', ['u1']);
    render(<ModelSets openers={stubOpeners()} />);
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
    render(<ModelSets openers={stubOpeners()} />);
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
    render(<ModelSets openers={stubOpeners()} />);
    expect(
      await screen.findByText('1 file has a newer version'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update to latest' }));
    await waitFor(() =>
      expect(MODEL_SETS.list()[0]?.data.members[0]?.urn).toBe('new'),
    );
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
