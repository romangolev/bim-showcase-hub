import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DASHBOARD_PROPERTIES } from '../extensions/dashboardData.js';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
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

function storedView(): {
  charts?: { property: string }[];
  properties?: string[];
} {
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
  it('offers the chosen properties in the chart menu and charts by the pick', async () => {
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
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Level' }));
    expect(storedView().properties).toEqual([
      'Category',
      'Assembly Code',
      'Classification Code',
      'Name',
    ]);
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Level' })).not.toBeChecked(),
    );
    await act(async () => {});
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /^Options for Bar chart/,
      })[0] as HTMLElement,
    );
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Group by Level' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Group by Name' }),
    );
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Name',
    });
    expect(storedView().charts?.[0]?.property).toBe('Name');
    view.unmount();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Name',
    });
  });

  it('keeps the chosen list when no catalog is available', () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardView,
      JSON.stringify({ properties: ['Name', 'Level'] }),
    );
    render(<DashboardSettingsBody />);
    expect(screen.getByText('No model loaded')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Chosen properties' }),
    ).toHaveTextContent('Level');
    expect(screen.queryByLabelText('Group by')).toBeNull();
  });

  it('lists the discovered catalog, with the chosen properties ticked', async () => {
    await loaded();
    render(<DashboardSettingsBody />);
    expect(
      await screen.findByRole('checkbox', { name: 'Classification Code' }),
    ).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Name' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Name' }));
    expect(storedView().properties).toEqual([
      'Category',
      'Level',
      'Assembly Code',
      'Classification Code',
    ]);
  });

  it('resets the view and its properties', () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardView,
      JSON.stringify({ charts: [{ property: 'Name' }] }),
    );
    render(<DashboardSettingsBody />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset dashboard' }));
    expect(storedView().properties).toEqual(DEFAULT_DASHBOARD_PROPERTIES);
    expect(storedView().charts).toHaveLength(2);
  });
});
