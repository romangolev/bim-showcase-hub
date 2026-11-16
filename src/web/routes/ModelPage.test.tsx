import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreeControlContext } from '../components/TreeControl.js';
import {
  DASHBOARD_STORAGE_KEY,
  ModelPage,
  middleEllipsis,
  SUMMARY_STORAGE_KEY,
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
  it('renders viewer, summary and dashboard without a page toolbar row', () => {
    render(<ModelPage urn="abc123" />);
    expect(screen.getByRole('region', { name: 'Viewer' })).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Model summary' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Paint tools' })).toBeNull();
    expect(document.querySelector('.model-toolbar')).toBeNull();
  });

  it('puts the paint and export tools inside the viewer toolbar', async () => {
    vi.stubGlobal('__MOCK_APS__', true);
    render(<ModelPage urn="abc123" />);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Viewer toolbar',
    });
    expect(
      within(toolbar).getByRole('button', { name: 'Export to Excel' }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: 'Paint selection' }),
    ).toBeInTheDocument();
  });

  it('expands the summary by default and persists collapse under its own key', () => {
    render(<ModelPage urn="abc123" />);
    const toggle = screen.getByRole('button', {
      name: 'Collapse Model summary',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const body = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    );
    expect(body).not.toHaveAttribute('inert');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Expand Model summary');
    expect(body).toHaveAttribute('inert');
    expect(body).toHaveAttribute('aria-hidden', 'true');
    expect(window.localStorage.getItem(SUMMARY_STORAGE_KEY)).toBe('1');
    expect(window.localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
    expect(document.querySelector('.model-page')).toHaveAttribute(
      'data-summary-collapsed',
      'true',
    );
    fireEvent.click(toggle);
    expect(window.localStorage.getItem(SUMMARY_STORAGE_KEY)).toBe('0');
  });

  it('restores a collapsed summary from storage', () => {
    window.localStorage.setItem(SUMMARY_STORAGE_KEY, '1');
    render(<ModelPage urn="abc123" />);
    expect(
      screen.getByRole('button', { name: 'Expand Model summary' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.model-page')).toHaveAttribute(
      'data-summary-collapsed',
      'true',
    );
  });

  it('keeps the summary expanded when storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    stubStorage({ ...memoryStorage(), getItem: blocked, setItem: blocked });
    render(<ModelPage urn="abc123" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse Model summary' }),
    );
    expect(
      screen.getByRole('button', { name: 'Expand Model summary' }),
    ).toBeInTheDocument();
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
    const trail = screen.getByRole('navigation', { name: /^Breadcrumb/ });
    expect(trail).toHaveTextContent('Studio hub');
    expect(trail).toHaveTextContent('Project Files');
    expect(trail).toHaveAttribute(
      'aria-label',
      'Breadcrumb: Studio hub / Riverside Tower / Project Files',
    );
    const gap = trail.querySelector('.crumbs__gap');
    expect(gap).toHaveAttribute(
      'title',
      'Studio hub / Riverside Tower / Project Files',
    );
    expect(gap).toHaveAttribute('aria-hidden', 'true');
    expect(trail.querySelector('[data-position="middle"]')).toHaveTextContent(
      'Riverside Tower',
    );
    expect(trail.querySelector('[data-position="last"]')).toHaveTextContent(
      'Project Files',
    );
  });

  it('shows two crumbs without a collapsed gap', () => {
    render(
      <ModelPage urn={LONG_URN} file="Tower.rvt" crumbs={['Hub', 'Docs']} />,
    );
    const trail = screen.getByRole('navigation', { name: /^Breadcrumb/ });
    expect(trail.querySelector('.crumbs__gap')).toBeNull();
    expect(trail.querySelectorAll('.crumbs__item')).toHaveLength(2);
  });

  it('falls back to a generic title with a short urn', () => {
    render(<ModelPage urn={LONG_URN} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/^Untitled model/);
    expect(heading).toHaveTextContent('v2');
    expect(
      screen.getByText(
        'Open the document panel and pick this model to see its file name and location',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Open documents' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show in documents' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: /^Breadcrumb/ }),
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
    ).toHaveAttribute('inert');
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

  it('reveals the tree from the show in documents action when trail context exists', () => {
    const reveal = vi.fn();
    render(
      <TreeControlContext.Provider value={{ reveal }}>
        <ModelPage urn={LONG_URN} file="Tower.rvt" hasTrail />
      </TreeControlContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show in documents' }));
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Open documents' }),
    ).not.toBeInTheDocument();
  });

  it('opens the tree from the empty hint action', () => {
    const reveal = vi.fn();
    render(
      <TreeControlContext.Provider value={{ reveal }}>
        <ModelPage urn={LONG_URN} />
      </TreeControlContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open documents' }));
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});
