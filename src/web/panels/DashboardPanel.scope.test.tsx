import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartSetting } from '../layout/instanceSettings.js';
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

describe('DashboardPanel empty element scope', () => {
  it('says the scope is empty instead of blaming the model properties', async () => {
    seed({ elements: 'selected' });
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    expect(await screen.findByText('No selected elements')).toBeVisible();
    expect(screen.queryByText('Nothing to chart')).toBeNull();
  });

  it('keeps the gallery dismissible and Presets reachable with a preset on an empty scope', async () => {
    seed({ elements: 'selected', preset: 'health' });
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    expect(await screen.findByText('No selected elements')).toBeVisible();
    expect(screen.queryByText(/none of the properties/)).toBeNull();
    expect(
      screen.queryByRole('list', { name: 'Dashboard presets' }),
    ).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Presets' });
    fireEvent.click(toggle);
    expect(
      screen.getByRole('list', { name: 'Dashboard presets' }),
    ).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(
      screen.queryByRole('list', { name: 'Dashboard presets' }),
    ).toBeNull();
  });

  it('shows loading while the scope is pending, not an empty message', async () => {
    seed({ elements: 'selected' });
    const adapter = await loaded();
    let release: (list: never[]) => void = () => {};
    vi.spyOn(adapter, 'getModelSelection').mockReturnValue(
      new Promise<never[]>((resolve) => {
        release = resolve;
      }) as never,
    );
    render(<DashboardPanel adapter={adapter} />);
    await waitFor(() =>
      expect(screen.getByText('Reading element properties')).toBeVisible(),
    );
    expect(screen.queryByText('No selected elements')).toBeNull();
    expect(screen.queryByText('Nothing to chart')).toBeNull();
    release([]);
    expect(await screen.findByText('No selected elements')).toBeVisible();
  });
});

describe('DashboardPanel chart stability', () => {
  it('does not rebuild the charts on an unrelated re-render', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    const built = counts.created;
    expect(built).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(counts.created).toBe(built);
  });
});

describe('DashboardPanel PNG flags', () => {
  it('exports an instance pane with its own flags, not the global ones', async () => {
    seed({ pngTitle: true });
    const setting = chartSetting('chart:1');
    window.localStorage.setItem(
      'bsh.pane.chart.1.v1',
      JSON.stringify({ pngTitle: false }),
    );
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} setting={setting} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export Bar chart of element counts by Category',
      }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download PNG' }));
    await waitFor(() => expect(exports.calls).toHaveLength(1));
    const options = (exports.calls[0] as unknown[])[4] as { title?: string };
    expect(options.title).toBeUndefined();
  });
});
