import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor, within } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { buildMockElements, MOCK_PROPERTY_INFOS } from '../viewer/mockModel.js';
import { DashboardPanel } from './DashboardPanel.js';
import { DashboardSettingsBody } from './DashboardSettings.js';

const made = vi.hoisted(() => ({
  configs: [] as {
    type?: string;
    data: { labels: string[] };
    options?: { indexAxis?: string };
  }[],
}));

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    update = vi.fn();
    data: { datasets: Record<string, unknown>[] };
    constructor(_canvas: unknown, config: unknown) {
      const parsed = config as {
        type?: string;
        data: Chart['data'] & { labels: string[] };
        options?: { indexAxis?: string };
      };
      this.data = parsed.data;
      made.configs.push(parsed);
    }
  }
  const stub = {};
  return {
    Chart,
    ArcElement: stub,
    BarController: stub,
    BarElement: stub,
    CategoryScale: stub,
    DoughnutController: stub,
    LinearScale: stub,
    Tooltip: stub,
  };
});

const adapters: MockViewerAdapter[] = [];

const [first, second, third] = buildMockElements();
const ids = [first?.dbId ?? 0, second?.dbId ?? 0, third?.dbId ?? 0];

const rows: PropertyRow[] = [
  {
    dbId: ids[0] ?? 0,
    name: 'Door 1',
    properties: {
      Category: 'Doors',
      Level: 'L1',
      'Classification Code': 'A',
      Name: 'Door 1',
      Mark: 'D1',
      Length: '2 m',
    },
  },
  {
    dbId: ids[1] ?? 0,
    name: 'Wall 1',
    properties: {
      Category: 'Walls',
      Level: null,
      'Classification Code': 'B',
      Name: 'Wall 1',
      Mark: 'D2',
      Length: '500 mm',
    },
  },
  {
    dbId: ids[2] ?? 0,
    name: 'Wall 1',
    properties: {
      Category: 'Walls',
      Level: 'L2',
      'Classification Code': null,
      Name: 'Wall 1',
      Mark: 'D3',
      Length: '1 m',
    },
  },
];

async function loaded(
  propertyRows: readonly PropertyRow[] = rows,
): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  vi.spyOn(adapter, 'getLeafProperties').mockResolvedValue([...propertyRows]);
  vi.spyOn(adapter, 'discoverProperties').mockResolvedValue([
    ...MOCK_PROPERTY_INFOS,
    { name: 'Length', category: 'Dimensions' },
  ]);
  adapters.push(adapter);
  return adapter;
}

function seed(view: Record<string, unknown>) {
  window.localStorage.setItem(
    BSH_KEYS.personal.dashboardView,
    JSON.stringify(view),
  );
}

function chartTypeSelect(): HTMLElement {
  const found = screen
    .getAllByLabelText('Chart type')
    .find((element) => element.tagName === 'SELECT');
  if (!found) throw new Error('no chart type select');
  return found as HTMLElement;
}

function storedView() {
  return JSON.parse(
    window.localStorage.getItem(BSH_KEYS.personal.dashboardView) ?? '{}',
  );
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
});

describe('dashboard chart builder', () => {
  it('adds a chart of any property with an aggregation and a type', async () => {
    seed({ properties: ['Category', 'Length'] });
    const adapter = await loaded();
    render(
      <>
        <DashboardPanel adapter={adapter} />
        <DashboardSettingsBody />
      </>,
    );
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });

    fireEvent.change(screen.getByLabelText('Aggregation'), {
      target: { value: 'sum' },
    });
    await waitFor(() =>
      expect(
        [
          ...(screen.getByLabelText('Measure') as HTMLSelectElement).options,
        ].some((option) => option.value === 'Length'),
      ).toBe(true),
    );
    fireEvent.change(screen.getByLabelText('Measure'), {
      target: { value: 'Length' },
    });
    fireEvent.change(chartTypeSelect(), { target: { value: 'hbar' } });

    expect(
      await screen.findByRole('img', {
        name: 'Horizontal bar chart of total Length (m) by Category',
      }),
    ).toBeInTheDocument();
    expect(storedView()).toMatchObject({
      aggregate: 'sum',
      measure: 'Length',
      chartType: 'hbar',
    });
    expect(made.configs.at(-1)).toMatchObject({
      type: 'bar',
      options: { indexAxis: 'y' },
    });
  });

  it('keeps the choice after a reload', async () => {
    seed({ aggregate: 'sum', measure: 'Length', chartType: 'bar' });
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    expect(
      await screen.findByRole('img', {
        name: 'Bar chart of total Length (m) by Category',
      }),
    ).toBeInTheDocument();
  });
});

describe('dashboard table chart', () => {
  it('renders a real table with values and counts', async () => {
    seed({ aggregate: 'sum', measure: 'Length', chartType: 'table' });
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    const table = await screen.findByRole('table', {
      name: 'Sum of Length (m) by Category',
    });
    expect(
      within(table).getByRole('columnheader', { name: 'Category' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Sum (m)' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('columnheader', { name: 'Elements' }),
    ).toBeInTheDocument();
    expect(within(table).getByText('2 m')).toBeInTheDocument();
    expect(within(table).getByText('1.5 m')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Walls' })).toBeVisible();
    expect(screen.queryByText('Data table')).toBeNull();
  });

  it('selects the rows of a clicked bucket', async () => {
    seed({ aggregate: 'sum', measure: 'Length', chartType: 'table' });
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    const table = await screen.findByRole('table', {
      name: 'Sum of Length (m) by Category',
    });
    fireEvent.click(within(table).getByRole('button', { name: 'Walls' }));
    await waitFor(() =>
      expect(
        adapter
          .getModelSelection()
          .map((item) => item.dbId)
          .sort(),
      ).toEqual([ids[1], ids[2]].sort()),
    );
  });
});

describe('dashboard honest units', () => {
  it('says the units are mixed instead of summing them', async () => {
    seed({ aggregate: 'sum', measure: 'Length', chartType: 'bar' });
    const adapter = await loaded([
      {
        dbId: 1,
        name: 'a',
        properties: { Category: 'Walls', Length: '2 m' },
      },
      {
        dbId: 2,
        name: 'b',
        properties: { Category: 'Doors', Length: '3 kg' },
      },
    ]);
    render(<DashboardPanel adapter={adapter} />);
    expect(await screen.findByText('Mixed units')).toBeVisible();
    expect(screen.getByText(/different units \(kg, m\)/)).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders unavailable for a property without numbers', async () => {
    seed({ aggregate: 'sum', measure: 'Length', chartType: 'bar' });
    const adapter = await loaded([
      {
        dbId: 1,
        name: 'a',
        properties: { Category: 'Walls', Length: 'n/a' },
      },
    ]);
    render(<DashboardPanel adapter={adapter} />);
    expect(await screen.findByText('No numeric values')).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('dashboard model health tiles', () => {
  it('shows the four checks with a threshold cue', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    expect(
      await screen.findByRole('button', { name: /^Level missing: 33%/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Classification Code missing/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: /^Elements with a duplicate Name: 67%/,
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /^Empty values/ })).toBeVisible();
    expect(screen.getByText('Model health')).toBeVisible();
    expect(
      screen.getAllByText(/Above the 10% threshold/).length,
    ).toBeGreaterThan(0);
  });

  it('selects the offenders of a clicked tile', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /^Level missing/ }),
    );
    await waitFor(() =>
      expect(adapter.getModelSelection().map((item) => item.dbId)).toEqual([
        ids[1],
      ]),
    );
  });

  it('keeps a green tone with text when the check passes', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    const tile = await screen.findByRole('button', {
      name: /^Classification Code missing/,
    });
    expect(tile).toHaveAttribute('data-tone', 'bad');
    expect(tile.textContent).toMatch(/Above the 10% threshold/);
  });
});
