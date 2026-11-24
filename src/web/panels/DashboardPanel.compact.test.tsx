import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { DashboardPanel } from './DashboardPanel.js';
import { COMPACT_BELOW, nextCompact, ROOMY_FROM } from './useAutoCompact.js';

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    update = vi.fn();
  }
  const stub = {};
  return {
    Chart,
    ArcElement: stub,
    BarController: stub,
    BarElement: stub,
    CategoryScale: stub,
    LinearScale: stub,
    DoughnutController: stub,
    Tooltip: stub,
  };
});

type Listener = (entries: { contentRect: DOMRectReadOnly }[]) => void;
const listeners: Listener[] = [];
const disconnect = vi.fn();
const adapters: MockViewerAdapter[] = [];

function resize(width: number, height: number) {
  act(() => {
    for (const listener of listeners) {
      listener([{ contentRect: { width, height } as DOMRectReadOnly }]);
    }
  });
}

async function open() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  adapters.push(adapter);
  const view = render(
    <DashboardPanel adapter={adapter} onOpenSettings={vi.fn()} />,
  );
  await screen.findByRole('img', {
    name: 'Bar chart of element counts by Category',
  });
  return { adapter, ...view };
}

function stored() {
  return JSON.parse(
    window.localStorage.getItem(BSH_KEYS.personal.dashboardView) ?? '{}',
  );
}

const toggle = () => screen.getByRole('button', { name: 'Dashboard controls' });
const addChart = () => screen.queryByRole('button', { name: 'Add chart' });

beforeEach(() => {
  installMemoryStorage();
  listeners.length = 0;
  disconnect.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(listener: Listener) {
        listeners.push(listener);
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    },
  );
});

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
  vi.unstubAllGlobals();
});

describe('nextCompact', () => {
  it('collapses below either threshold', () => {
    expect(nextCompact(false, 800, 500)).toBe(false);
    expect(nextCompact(false, 800, COMPACT_BELOW.height - 1)).toBe(true);
    expect(nextCompact(false, COMPACT_BELOW.width - 1, 500)).toBe(true);
    expect(nextCompact(false, COMPACT_BELOW.width, COMPACT_BELOW.height)).toBe(
      false,
    );
  });

  it('expands again only past the larger threshold', () => {
    expect(nextCompact(true, 800, COMPACT_BELOW.height + 10)).toBe(true);
    expect(nextCompact(true, ROOMY_FROM.width - 1, 500)).toBe(true);
    expect(nextCompact(true, ROOMY_FROM.width, ROOMY_FROM.height)).toBe(false);
  });

  it('ignores a pane with no size', () => {
    expect(nextCompact(false, 0, 0)).toBe(false);
    expect(nextCompact(true, 0, 0)).toBe(true);
  });
});

describe('DashboardPanel auto-collapsing controls', () => {
  it('shows the controls until the pane reports a small size', async () => {
    await open();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(addChart()).toBeInTheDocument();
    resize(700, 180);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(addChart()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dashboard presets' })).toBe(
      null,
    );
    expect(
      screen.getByRole('img', {
        name: 'Bar chart of element counts by Category',
      }),
    ).toBeInTheDocument();
    resize(700, 380);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    resize(700, 420);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(addChart()).toBeInTheDocument();
  });

  it('collapses a narrow pane', async () => {
    await open();
    resize(400, 800);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves the header actions into the shared menu when collapsed', async () => {
    await open();
    resize(700, 180);
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard actions' }));
    expect(
      screen.getByRole('menuitem', { name: 'Refresh' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Horizontal layout' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Dashboard settings' }),
    ).toBeInTheDocument();
    const before = stored().charts?.length ?? 2;
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add chart' }));
    expect(stored().charts).toHaveLength(before + 1);
  });

  it('keeps a manual choice over the automatic one and stores it', async () => {
    await open();
    resize(700, 180);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(stored().controls).toBe(true);
    resize(700, 120);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(stored().controls).toBeUndefined();
    resize(900, 600);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle());
    expect(stored().controls).toBe(false);
    resize(1200, 900);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts from a stored manual choice', async () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardView,
      JSON.stringify({ controls: false }),
    );
    await open();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(addChart()).toBeNull();
  });

  it('keeps the manual choice when a preset is applied', async () => {
    await open();
    resize(700, 180);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard presets' }));
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Model health' }),
    );
    expect(stored().controls).toBe(true);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('moves focus to the toggle when the focused control collapses away', async () => {
    await open();
    const button = addChart();
    button?.focus();
    expect(button).toHaveFocus();
    resize(700, 180);
    expect(toggle()).toHaveFocus();
  });

  it('leaves focus alone when it is outside the header', async () => {
    await open();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    resize(700, 180);
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('stops observing on unmount', async () => {
    const { unmount } = await open();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
