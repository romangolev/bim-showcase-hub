import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { availableProperties } from '../extensions/dashboardData.js';
import { DASHBOARD_PRESETS } from '../extensions/dashboardPresets.js';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen } from '../test/render.js';
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

describe('preset properties on a model without Revit names', () => {
  it('returns no chart for any built-in on a Navisworks-like property set', () => {
    for (const preset of DASHBOARD_PRESETS) {
      expect(availableProperties(navisworks, preset.properties)).toEqual([]);
    }
  });

  it('keeps only the properties that have a value', () => {
    const byId = (id: string) => {
      const found = DASHBOARD_PRESETS.find((p) => p.id === id);
      if (!found) throw new Error(id);
      return found;
    };
    expect(availableProperties(partial, byId('health').properties)).toEqual([
      'Category',
    ]);
    expect(availableProperties(partial, byId('quantities').properties)).toEqual(
      ['Category', 'Family'],
    );
  });

  it('returns nothing for an empty model', () => {
    for (const preset of DASHBOARD_PRESETS) {
      expect(availableProperties([], preset.properties)).toEqual([]);
    }
  });
});

describe('DashboardPanel presets', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('applies a preset from the Presets menu', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    const trigger = screen.getByRole('button', { name: 'Dashboard presets' });
    fireEvent.click(trigger);
    expect(trigger).toHaveTextContent('PresetsCustom');
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Model health' }),
    );
    expect(stored().charts).toHaveLength(4);
    expect(trigger).toHaveTextContent('PresetsModel health');
  });

  it('shows a clear message and keeps the Presets menu when no preset chart fits the model', async () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardView,
      JSON.stringify({ preset: 'discipline' }),
    );
    const adapter = await loaded();
    vi.spyOn(adapter, 'getLeafProperties').mockResolvedValue(navisworks);
    render(<DashboardPanel adapter={adapter} />);
    expect(
      await screen.findByText('Nothing to chart here'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This model has none of the properties these charts group by.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Dashboard presets' }),
    ).toBeInTheDocument();
  });

  it('keeps a tile with a message for a chart whose property is absent', async () => {
    window.localStorage.setItem(
      BSH_KEYS.personal.dashboardView,
      JSON.stringify({ preset: 'quantities' }),
    );
    const adapter = await loaded();
    vi.spyOn(adapter, 'getLeafProperties').mockResolvedValue(partial);
    render(<DashboardPanel adapter={adapter} />);
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
    expect(
      screen.getByText('This model has no Type Name values.'),
    ).toBeVisible();
  });
});
