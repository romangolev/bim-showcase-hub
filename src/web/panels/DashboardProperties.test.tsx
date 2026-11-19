import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen } from '../test/render.js';
import { publishActiveAdapter } from '../viewer/activeAdapterStore.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { DashboardPanel } from './DashboardPanel.js';
import { DashboardSettingsBody } from './DashboardSettings.js';

const made = vi.hoisted(() => ({
  configs: [] as { data: { labels: string[] } }[],
}));

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    update = vi.fn();
    data: unknown;
    constructor(_canvas: unknown, config: { data: { labels: string[] } }) {
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

async function loaded(): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  adapters.push(adapter);
  publishActiveAdapter(adapter);
  return adapter;
}

function storedList(): string[] {
  return JSON.parse(
    window.localStorage.getItem(BSH_KEYS.personal.dashboardProperties) ?? '[]',
  );
}

function storedView(): { property?: string } {
  return JSON.parse(
    window.localStorage.getItem(BSH_KEYS.personal.dashboardView) ?? '{}',
  );
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  publishActiveAdapter(null);
  for (const adapter of adapters.splice(0)) adapter.destroy();
});

describe('dashboard chart properties', () => {
  it('charts by the first chosen property and stores the pick', async () => {
    const adapter = await loaded();
    const view = render(
      <>
        <DashboardPanel adapter={adapter} />
        <DashboardSettingsBody />
      </>,
    );
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Category' }));
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Level',
    });
    expect(storedList()).toEqual([
      'Level',
      'Assembly Code',
      'Classification Code',
      'Name',
    ]);
    expect(screen.getByLabelText('Group by')).toHaveDisplayValue('Level');
    expect(storedView().property).toBe('Level');
    expect(screen.queryByText(/This model has no Category values/)).toBeNull();
    view.unmount();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Level',
    });
  });

  it('reads a stored list on the first render', async () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardProperties,
      JSON.stringify(['Name']),
    );
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Name',
    });
  });

  it('keeps a catalog property as the stored group by on reload', () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardView,
      JSON.stringify({ property: 'Type Name' }),
    );
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardProperties,
      JSON.stringify(['Category', 'Type Name']),
    );
    render(<DashboardSettingsBody />);
    expect(screen.getByLabelText('Group by')).toHaveDisplayValue('Type Name');
  });

  it('charts by a property picked in the group by list', async () => {
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
    fireEvent.change(await screen.findByLabelText('Group by'), {
      target: { value: 'Name' },
    });
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Name',
    });
  });

  it('keeps the default list and its group by when no catalog is available', async () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardProperties,
      JSON.stringify(['Name', 'Level']),
    );
    render(<DashboardSettingsBody />);
    expect(screen.getByText('No model loaded')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Chosen properties' }),
    ).toHaveTextContent('Level');
    const groupBy = screen.getByLabelText('Group by') as HTMLSelectElement;
    expect([...groupBy.options].map((option) => option.value)).toEqual([
      'Name',
      'Level',
    ]);
    expect(groupBy.value).toBe('Name');
  });

  it('lists the discovered catalog, with the chosen properties ticked', async () => {
    await loaded();
    render(<DashboardSettingsBody />);
    expect(
      await screen.findByRole('checkbox', { name: 'Classification Code' }),
    ).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Name' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Name' }));
    expect(storedList()).toEqual([
      'Category',
      'Level',
      'Assembly Code',
      'Classification Code',
    ]);
  });
});
