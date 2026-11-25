import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { DashboardPanel } from './DashboardPanel.js';

const counts = vi.hoisted(() => ({ created: 0 }));
const exports = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    update = vi.fn();
    constructor() {
      counts.created += 1;
    }
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

vi.mock('../extensions/chartExport.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../extensions/chartExport.js')>()),
  saveChartPng: vi.fn(async (...args: unknown[]) => {
    exports.calls.push(args);
    return true;
  }),
}));

const adapters: MockViewerAdapter[] = [];

async function loaded(): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  adapters.push(adapter);
  return adapter;
}

function seed(view: Record<string, unknown>) {
  window.localStorage.setItem(
    BSH_KEYS.personal.dashboardView,
    JSON.stringify(view),
  );
}

beforeEach(() => {
  installMemoryStorage();
  counts.created = 0;
  exports.calls.length = 0;
});

afterEach(() => {
  for (const a of adapters.splice(0)) a.destroy();
});

describe('DashboardPanel element scope', () => {
  it('has no element scope control and ignores one stored by an older version', async () => {
    seed({ elements: 'selected' });
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    expect(screen.queryByLabelText('Chart elements')).toBeNull();
    expect(screen.queryByText('No selected elements')).toBeNull();
  });
});

describe('DashboardPanel chart stability', () => {
  it('does not rebuild the charts on an unrelated re-render', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    await waitFor(() => expect(counts.created).toBeGreaterThan(0));
    const built = counts.created;
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(counts.created).toBe(built);
  });
});

describe('DashboardPanel PNG flags', () => {
  it('exports an instance pane with its own flags, not the global ones', async () => {
    seed({ pngTitle: true });
    window.localStorage.setItem(
      'bsh.pane.chart.1.v1',
      JSON.stringify({ pngTitle: false }),
    );
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} panel="chart:1" />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Options for Bar chart of element counts by Category',
      }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download PNG' }));
    await waitFor(() => expect(exports.calls).toHaveLength(1));
    const options = (exports.calls[0] as unknown[])[4] as { title?: string };
    expect(options.title).toBeUndefined();
  });
});
