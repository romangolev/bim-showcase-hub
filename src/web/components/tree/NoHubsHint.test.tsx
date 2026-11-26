import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionQueryKey } from '../../api/hooks.js';
import {
  createTestClient,
  json,
  mockFetch,
  stubLayout,
  treeRoutes,
} from '../../test/mockApi.js';
import { DocumentTree } from './DocumentTree.js';
import {
  CUSTOM_INTEGRATION_HELP_URL,
  HINT_DISMISSED_KEY,
  NoHubsHint,
} from './NoHubsHint.js';

function renderHint(onCheckAgain = vi.fn(), clientId?: string) {
  const client = createTestClient();
  client.setQueryData(sessionQueryKey, {
    name: 'Sam',
    picture: null,
    appClientId: clientId,
  });
  render(
    <QueryClientProvider client={client}>
      <NoHubsHint onCheckAgain={onCheckAgain} />
    </QueryClientProvider>,
  );
  return onCheckAgain;
}

beforeEach(() => {
  stubLayout();
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NoHubsHint', () => {
  it('explains the two conditions under a heading', () => {
    renderHint(vi.fn(), 'client-abc');
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'No projects to show yet',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/Forma Hub Admin/)).toBeInTheDocument();
  });

  it('shows the client id from the session', () => {
    renderHint(vi.fn(), 'client-abc');
    expect(screen.getByText('client-abc')).toBeInTheDocument();
  });

  it('shows the callback URL from the session', () => {
    const client = createTestClient();
    client.setQueryData(sessionQueryKey, {
      name: 'Sam',
      picture: null,
      appClientId: 'client-abc',
      appCallbackUrl: 'https://example.test/api/auth/callback',
    });
    render(
      <QueryClientProvider client={client}>
        <NoHubsHint onCheckAgain={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(
      screen.getByText('https://example.test/api/auth/callback'),
    ).toBeInTheDocument();
  });

  it('omits the client id block when the session has none', () => {
    renderHint();
    expect(screen.queryByText('Client ID')).toBeNull();
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
  });

  it('copies the client id and announces Copied politely', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderHint(vi.fn(), 'client-abc');
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('client-abc'));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Copied'));
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('falls back to execCommand when the clipboard API is missing', async () => {
    vi.stubGlobal('navigator', {});
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: exec,
    });
    renderHint(vi.fn(), 'client-abc');
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
    await waitFor(() => expect(exec).toHaveBeenCalledWith('copy'));
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  });

  it('opens the Autodesk help page safely in a new tab', () => {
    renderHint();
    const link = screen.getByRole('link', {
      name: /How to add a custom integration/,
    });
    expect(link).toHaveAttribute('href', CUSTOM_INTEGRATION_HELP_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('calls onCheckAgain from the button', () => {
    const onCheckAgain = renderHint();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });
});

describe('NoHubsHint in the document tree', () => {
  function renderTree() {
    const client = createTestClient();
    client.setQueryData(sessionQueryKey, {
      name: 'Sam',
      picture: null,
      appClientId: 'client-abc',
    });
    render(
      <QueryClientProvider client={client}>
        <DocumentTree onOpenModel={vi.fn()} />
      </QueryClientProvider>,
    );
  }

  it('appears when the hub list is empty and refetches on Check again', async () => {
    let hubs: unknown[] = [];
    const fetchMock = mockFetch({ '/api/hubs': () => json(hubs) });
    renderTree();
    expect(await screen.findByText('client-abc')).toBeInTheDocument();
    hubs = treeRoutes['/api/hubs'];
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('Studio hub')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('No projects to show yet')).toBeNull();
  });

  it('appears when the hubs call says the app is not provisioned', async () => {
    mockFetch({
      '/api/hubs': () =>
        json(
          { error: 'App not provisioned', code: 'app_not_provisioned' },
          403,
        ),
    });
    renderTree();
    expect(
      await screen.findByText('No projects to show yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Check again' }),
    ).toBeInTheDocument();
  });

  it('keeps a plain 403 as an error', async () => {
    mockFetch({ '/api/hubs': () => json({ error: 'Forbidden' }, 403) });
    renderTree();
    expect(
      await screen.findByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No projects to show yet')).toBeNull();
  });

  it('is not shown when there is at least one hub', async () => {
    mockFetch(treeRoutes);
    renderTree();
    await screen.findByText('Studio hub');
    expect(screen.queryByText('No projects to show yet')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  it('is not shown for an empty folder', async () => {
    mockFetch({
      ...treeRoutes,
      '/api/hubs/h1/projects': [],
    });
    renderTree();
    fireEvent.click(await screen.findByText('Studio hub'));
    await screen.findByText('Empty folder');
    expect(screen.queryByText('No projects to show yet')).toBeNull();
  });
});

describe('PersonalHubNotice in the document tree', () => {
  const personal = { ...treeRoutes['/api/hubs'][0], hubType: 'personal' };
  const team = { ...treeRoutes['/api/hubs'][0], id: 'h2', hubType: 'team' };
  const account = { ...team, id: 'h3', hubType: 'account' };
  const unknown = { ...team, id: 'h4', hubType: 'unknown' };
  const untyped = { ...team, id: 'h5', hubType: undefined };
  const TITLE = 'Looking for projects from ACC, BIM 360 or Forma?';

  function renderTree(name = 'Sam') {
    const client = createTestClient();
    client.setQueryData(sessionQueryKey, {
      name,
      picture: null,
      appClientId: 'client-abc',
    });
    return render(
      <QueryClientProvider client={client}>
        <DocumentTree onOpenModel={vi.fn()} />
      </QueryClientProvider>,
    );
  }

  it('shows a notice above a still visible tree for personal-only hubs', async () => {
    mockFetch({ ...treeRoutes, '/api/hubs': [personal] });
    renderTree();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText('Studio hub')).toBeInTheDocument();
    expect(screen.getByText('client-abc')).toBeInTheDocument();
    expect(screen.queryByText('No projects to show yet')).toBeNull();
  });

  it('remembers the dismissal per user', async () => {
    mockFetch({ ...treeRoutes, '/api/hubs': [personal] });
    const first = renderTree('Sam');
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem(HINT_DISMISSED_KEY) ?? '[]'),
    ).toEqual(['Sam']);
    first.unmount();

    renderTree('Sam');
    await screen.findByText('Studio hub');
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('still shows the notice for another user', async () => {
    window.localStorage.setItem(HINT_DISMISSED_KEY, JSON.stringify(['Sam']));
    mockFetch({ ...treeRoutes, '/api/hubs': [personal] });
    renderTree('Alex');
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
  });

  it('stays hidden when a team or account hub is present', async () => {
    mockFetch({ ...treeRoutes, '/api/hubs': [personal, team, account] });
    renderTree();
    await screen.findAllByText('Studio hub');
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('stays hidden when a hub type is unknown or missing', async () => {
    mockFetch({ ...treeRoutes, '/api/hubs': [personal, unknown] });
    const first = renderTree();
    await screen.findAllByText('Studio hub');
    expect(screen.queryByText(TITLE)).toBeNull();
    first.unmount();

    mockFetch({ ...treeRoutes, '/api/hubs': [untyped] });
    renderTree();
    await screen.findByText('Studio hub');
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
