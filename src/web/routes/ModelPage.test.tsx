import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_STORAGE_KEY,
  ModelPage,
  middleEllipsis,
} from './ModelPage.js';

const LONG_URN =
  'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLmFCY0RlRmdIaUprTG1ObzE_dmVyc2lvbj0y';

function stubHeight(height: number) {
  vi.stubGlobal('innerHeight', height);
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function stubStorage(storage: Storage) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

beforeEach(() => {
  stubStorage(memoryStorage());
  stubHeight(1000);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ModelPage', () => {
  it('renders viewer, summary, dashboard and toolbar', () => {
    render(<ModelPage urn="abc123" />);
    expect(screen.getByRole('region', { name: 'Viewer' })).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Model summary' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Paint tools' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('shows the file name with a version badge and breadcrumb', () => {
    render(
      <ModelPage
        urn={LONG_URN}
        file="Tower.rvt"
        version="v2"
        crumbs={['Studio hub', 'Riverside Tower', 'Project Files']}
      />,
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Tower.rvt');
    expect(heading).toHaveTextContent('v2');
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(trail).toHaveTextContent('Studio hub');
    expect(trail).toHaveTextContent('Project Files');
  });

  it('falls back to a generic title with a short urn', () => {
    render(<ModelPage urn={LONG_URN} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/^Untitled model/);
    expect(heading).toHaveTextContent('v2');
    expect(
      screen.getByText(/Open this model from the document tree/),
    ).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' }),
    ).not.toBeInTheDocument();
  });

  it('truncates the urn in the middle and keeps the full value as title', () => {
    render(<ModelPage urn={LONG_URN} />);
    const code = screen.getByTitle(LONG_URN);
    const parts = code.querySelectorAll('.mid__head, .mid__tail');
    expect(parts).toHaveLength(2);
    expect(`${parts[0]?.textContent}${parts[1]?.textContent}`).toBe(LONG_URN);
    expect(parts[1]?.textContent).toBe(LONG_URN.slice(-6));
  });

  it('shows the urn once on an untitled deep link', () => {
    render(<ModelPage urn={LONG_URN} />);
    expect(screen.getAllByTitle(LONG_URN)).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(
      LONG_URN.slice(0, 6),
    );
  });

  it('keeps the file title without a hint', () => {
    render(<ModelPage urn={LONG_URN} file="Tower.rvt" version="v2" />);
    expect(screen.queryByText(/Open this model from/)).toBeNull();
  });

  it('sets the document title per model and restores it on unmount', () => {
    document.title = 'BIM Showcase Hub';
    const { unmount, rerender } = render(
      <ModelPage urn={LONG_URN} file="Tower.rvt" version="v2" />,
    );
    expect(document.title).toBe('Tower.rvt v2 · BIM Showcase Hub');
    rerender(<ModelPage urn={LONG_URN} file="Core.rvt" />);
    expect(document.title).toBe('Core.rvt · BIM Showcase Hub');
    unmount();
    expect(document.title).toBe('BIM Showcase Hub');
  });

  it('falls back to a generic document title', () => {
    document.title = 'BIM Showcase Hub';
    const { unmount } = render(<ModelPage urn="abc123" />);
    expect(document.title).toBe('Model · BIM Showcase Hub');
    unmount();
    expect(document.title).toBe('BIM Showcase Hub');
  });

  it('copies the urn to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<ModelPage urn="abc123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy URN' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('abc123'));
    expect(await screen.findByText('URN copied')).toBeInTheDocument();
  });

  it('collapses the dashboard region and remembers the choice', () => {
    render(<ModelPage urn="abc123" />);
    const toggle = screen.getByRole('button', { name: 'Collapse' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Expand');
    expect(
      document.getElementById(toggle.getAttribute('aria-controls') ?? ''),
    ).not.toBeVisible();
    expect(window.localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBe('1');
  });

  it('starts collapsed on short windows', () => {
    stubHeight(800);
    render(<ModelPage urn="abc123" />);
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('prefers the stored choice over the window height', () => {
    stubHeight(800);
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, '0');
    render(<ModelPage urn="abc123" />);
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('survives unavailable storage', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    stubStorage({
      ...memoryStorage(),
      getItem: blocked,
      setItem: blocked,
    });
    render(<ModelPage urn="abc123" />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
  });
});

describe('middleEllipsis', () => {
  it('keeps short values and trims long ones', () => {
    expect(middleEllipsis('abc123', 6, 4)).toBe('abc123');
    expect(middleEllipsis('abcdefghijklmnopqrstuvwxyz', 6, 4)).toBe(
      'abcdef…wxyz',
    );
  });
});
