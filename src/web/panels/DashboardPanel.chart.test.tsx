import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen } from '../test/render.js';
import { publishActiveAdapter } from '../viewer/activeAdapterStore.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { DashboardPanel } from './DashboardPanel.js';
import { DashboardSettingsBody } from './DashboardSettings.js';

const made = vi.hoisted(() => ({
  configs: [] as {
    type: string;
    data: {
      labels: string[];
      datasets: { label: string; data: number[] }[];
    };
  }[],
}));

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    update = vi.fn();
    data: unknown;
    constructor(_canvas: unknown, config: (typeof made.configs)[number]) {
      this.data = config.data;
      made.configs.push(config);
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

const adapters: MockViewerAdapter[] = [];

async function combined(): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels([
    { urn: 'urn-a', name: 'A.rvt' },
    { urn: 'urn-b', name: 'B.rvt' },
  ]);
  adapters.push(adapter);
  return adapter;
}

async function single(): Promise<MockViewerAdapter> {
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
  made.configs.length = 0;
});

afterEach(() => {
  publishActiveAdapter(null);
  for (const a of adapters.splice(0)) a.destroy();
});

describe('DashboardPanel split by model', () => {
  it('gives each ready model its own stacked series', async () => {
    seed({ splitByModel: true, kind: 'bar' });
    const adapter = await combined();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    const bar = made.configs.find((config) => config.type === 'bar');
    expect(bar?.data.datasets.map((dataset) => dataset.label)).toEqual([
      'A.rvt',
      'B.rvt',
    ]);
    expect(bar?.data.datasets[0]?.data).toHaveLength(
      bar?.data.labels.length ?? 0,
    );
  });

  it('keeps one dataset without the split', async () => {
    seed({ kind: 'bar' });
    const adapter = await combined();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    const bar = made.configs.find((config) => config.type === 'bar');
    expect(bar?.data.datasets).toHaveLength(1);
  });

  it('adds one data table column per model', async () => {
    seed({ splitByModel: true, kind: 'bar' });
    const adapter = await combined();
    render(<DashboardPanel adapter={adapter} />);
    fireEvent.click(await screen.findByText('Data table'));
    const headers = [...document.querySelectorAll('table thead th')].map(
      (cell) => cell.textContent,
    );
    expect(headers).toEqual(['Category', 'A.rvt', 'B.rvt', 'Count']);
  });
});

describe('Dashboard settings split by model', () => {
  it('turns the split on when two models are ready', async () => {
    const adapter = await combined();
    publishActiveAdapter(adapter);
    render(<DashboardSettingsBody />);
    const box = await screen.findByRole('checkbox', { name: 'Split by model' });
    expect(box).toBeEnabled();
    fireEvent.click(box);
    const saved = JSON.parse(
      window.localStorage.getItem(BSH_KEYS.personal.dashboardView) ?? '{}',
    ) as { splitByModel?: boolean };
    expect(saved.splitByModel).toBe(true);
  });

  it('disables the split for a single model and says why', async () => {
    const adapter = await single();
    publishActiveAdapter(adapter);
    render(<DashboardSettingsBody />);
    expect(
      await screen.findByRole('checkbox', { name: 'Split by model' }),
    ).toBeDisabled();
    expect(screen.getByText(/Open a second model/)).toBeInTheDocument();
  });
});
