import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '../tasks/notifications.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  viewableVersion,
} from '../test/mockApi.js';
import { VersionHistoryPanel } from './VersionHistoryPanel.js';
import { VERSION_HISTORY_VIEW, VERSION_TARGET } from './versionHistory.js';

const target = {
  projectId: 'p1',
  itemId: 'i1',
  file: 'a.rvt',
  trail: ['h1', 'p1', 'f1', 'i1'],
  crumbs: ['Hub'],
};

const versions = [
  {
    ...viewableVersion,
    id: 'v1',
    name: 'v1: 2025-01-01 10:00 by Sam',
    versionNumber: 1,
    urn: 'u1',
    modifiedAt: '2025-01-01T10:00:00.000Z',
    modifiedBy: 'Sam',
  },
  {
    ...viewableVersion,
    id: 'v2',
    name: 'v2: 2025-01-02 10:00 by Mei',
    versionNumber: 2,
    urn: 'u2',
    latest: true,
    modifiedAt: '2025-01-02T10:00:00.000Z',
    modifiedBy: 'Mei',
  },
];

function renderPanel() {
  const openers = {
    open: vi.fn(),
    openTabs: vi.fn(),
    openTogether: vi.fn(),
  };
  render(
    <QueryClientProvider client={createTestClient()}>
      <VersionHistoryPanel openers={openers} />
    </QueryClientProvider>,
  );
  return openers;
}

function setup() {
  installMemoryStorage();
  VERSION_TARGET.write(target);
  VERSION_HISTORY_VIEW.write({ filter: '', viewableOnly: false });
  mockFetch({ '/api/projects/p1/items/i1/versions': versions });
  return renderPanel();
}

beforeEach(() => {
  installMemoryStorage();
});

describe('VersionHistoryPanel', () => {
  it('lists versions newest first with the latest marked', async () => {
    setup();
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('v2');
    expect(
      within(rows[1] as HTMLElement).getByText('Latest'),
    ).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent('v1');
  });

  it('opens a version with the tree context', async () => {
    const openers = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Open v2' }));
    await waitFor(() =>
      expect(openers.open).toHaveBeenCalledWith('u2', {
        file: 'a.rvt',
        v: 'v2',
        trail: ['h1', 'p1', 'f1', 'i1'],
        crumbs: ['Hub'],
      }),
    );
  });

  it('does not open a version that is not viewable', async () => {
    installMemoryStorage();
    VERSION_TARGET.write(target);
    VERSION_HISTORY_VIEW.write({ filter: '', viewableOnly: false });
    mockFetch({
      '/api/projects/p1/items/i1/versions': [
        { ...versions[0], viewState: 'failed', viewable: false },
      ],
    });
    notifications.clear();
    const openers = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Open v1' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Open v1 in a new tab' }),
    );
    await waitFor(() =>
      expect(notifications.getSnapshot().items.length).toBeGreaterThan(0),
    );
    expect(openers.open).not.toHaveBeenCalled();
    expect(openers.openTabs).not.toHaveBeenCalled();
  });

  it('compares two picked versions as tabs', async () => {
    const openers = setup();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Pick v1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pick v2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare as tabs' }));
    expect(openers.openTabs).toHaveBeenCalledWith([
      expect.objectContaining({ urn: 'u2' }),
      expect.objectContaining({ urn: 'u1' }),
    ]);
  });

  it('compares two picked versions in one viewer', async () => {
    const openers = setup();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Pick v1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pick v2' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Compare in one viewer' }),
    );
    expect(openers.openTogether).toHaveBeenCalledWith([
      expect.objectContaining({ urn: 'u2' }),
      expect.objectContaining({ urn: 'u1' }),
    ]);
  });

  it('filters the rows by author or label', async () => {
    setup();
    await screen.findByText('v2: 2025-01-02 10:00 by Mei');
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Filter versions' }),
      {
        target: { value: 'sam' },
      },
    );
    expect(screen.queryByText('v2: 2025-01-02 10:00 by Mei')).toBeNull();
    expect(screen.getByText('v1: 2025-01-01 10:00 by Sam')).toBeInTheDocument();
  });

  it('says what to do when no file is chosen', () => {
    VERSION_TARGET.write(null);
    renderPanel();
    expect(screen.getByText(/Pick a file in Documents/)).toBeInTheDocument();
  });
});
