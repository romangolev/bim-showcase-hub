import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import {
  DASHBOARD_PRESETS,
  presetCharts,
} from '../extensions/dashboardPresets.js';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { DashboardPanel } from './DashboardPanel.js';

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

const adapters: MockViewerAdapter[] = [];

async function loaded(): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  adapters.push(adapter);
  return adapter;
}

const navisworks: PropertyRow[] = [
  { dbId: 1, name: 'a', properties: { Item: 'Door', Layer: 'L1', Type: 'T' } },
  { dbId: 2, name: 'b', properties: { Item: 'Wall', Layer: 'L2', Type: 'T' } },
];

const partial: PropertyRow[] = [
  {
    dbId: 1,
    name: 'a',
    properties: { Category: 'Walls', Family: 'Basic Wall' },
  },
  { dbId: 2, name: 'b', properties: { Category: 'Doors', Family: null } },
];

function stored() {
  return JSON.parse(
    window.localStorage.getItem(BSH_KEYS.personal.dashboardView) ?? '{}',
  );
}

afterEach(() => {
  for (const a of adapters.splice(0)) a.destroy();
});

describe('presetCharts on a model without Revit names', () => {
  it('returns no chart for any built-in on a Navisworks-like property set', () => {
    for (const preset of DASHBOARD_PRESETS) {
      expect(presetCharts(preset, navisworks)).toEqual([]);
    }
  });

  it('keeps only the properties that have a value', () => {
    const byId = (id: string) => {
      const found = DASHBOARD_PRESETS.find((p) => p.id === id);
      if (!found) throw new Error(id);
      return found;
    };
    expect(presetCharts(byId('health'), partial)).toEqual(['Category']);
    expect(presetCharts(byId('quantities'), partial)).toEqual([
      'Category',
      'Family',
    ]);
  });

  it('returns nothing for an empty model', () => {
    for (const preset of DASHBOARD_PRESETS) {
      expect(presetCharts(preset, [])).toEqual([]);
    }
  });
});

describe('DashboardPanel gallery', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('is the empty state without a model and applies a preset', () => {
    render(<DashboardPanel />);
    expect(screen.getByText('No charts yet')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Dashboard presets' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply Model health' }));
    expect(stored().preset).toBe('health');
  });

  it('opens from the Presets toggle and closes after Apply', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    expect(
      screen.queryByRole('list', { name: 'Dashboard presets' }),
    ).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Presets' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Apply Model health' }));
    expect(
      screen.queryByRole('list', { name: 'Dashboard presets' }),
    ).toBeNull();
    expect(stored().preset).toBe('health');
    await waitFor(() =>
      expect(
        screen.getAllByRole('img', { name: /^Bar chart of element counts by / })
          .length,
      ).toBeGreaterThan(1),
    );
  });

  it('shows a clear message and the gallery when no preset chart fits the model', async () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardView,
      JSON.stringify({ preset: 'discipline' }),
    );
    const adapter = await loaded();
    vi.spyOn(adapter, 'getLeafProperties').mockResolvedValue(navisworks);
    render(<DashboardPanel adapter={adapter} propertyNames={['Item']} />);
    expect(
      await screen.findByText('Nothing to chart here'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This model has none of the properties By discipline uses.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply Model health' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Presets' })).toBeNull();
    expect(screen.getAllByText(/Not in this model/)).toHaveLength(4);
  });

  it('hides only the charts whose property is absent', async () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardView,
      JSON.stringify({ preset: 'quantities' }),
    );
    const adapter = await loaded();
    vi.spyOn(adapter, 'getLeafProperties').mockResolvedValue(partial);
    render(<DashboardPanel adapter={adapter} propertyNames={['Category']} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    expect(
      screen.getByRole('img', {
        name: 'Bar chart of element counts by Family',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', {
        name: 'Bar chart of element counts by Type Name',
      }),
    ).toBeNull();
  });
});
