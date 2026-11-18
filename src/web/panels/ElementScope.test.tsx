import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { DashboardPanel } from './DashboardPanel.js';
import { ModelSummaryPanel } from './ModelSummaryPanel.js';

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
    update = vi.fn();
    data: unknown;
    constructor(_canvas: unknown, config: { data: unknown }) {
      this.data = config.data;
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
  return adapter;
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  for (const a of adapters.splice(0)) a.destroy();
});

function cellTotal(): number {
  return [...document.querySelectorAll('tbody tr')].reduce(
    (sum, row) => sum + Number(row.querySelectorAll('td')[2]?.textContent ?? 0),
    0,
  );
}

describe('summary element scope', () => {
  it('summarizes only the selected elements and says so', async () => {
    const adapter = await loaded();
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    await screen.findByRole('cell', { name: 'Walls' });
    const all = cellTotal();
    expect(all).toBeGreaterThan(2);
    const first = (await adapter.getVisible()).slice(0, 2);
    act(() => adapter.selectModelIds(first));
    fireEvent.change(screen.getByLabelText('Summarize elements'), {
      target: { value: 'selected' },
    });
    await waitFor(() => expect(cellTotal()).toBe(2));
    expect(
      screen.getByText(
        `Summarizing 2 selected of ${all.toLocaleString('en-US')} elements`,
      ),
    ).toBeInTheDocument();
  });

  it('shows an empty state when nothing is selected and persists the scope', async () => {
    const adapter = await loaded();
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    await screen.findByRole('cell', { name: 'Walls' });
    fireEvent.change(screen.getByLabelText('Summarize elements'), {
      target: { value: 'selected' },
    });
    await screen.findByText('No selected elements');
    expect(window.localStorage.getItem('bsh.summary.scope.v1')).toBe(
      '"selected"',
    );
  });
});

describe('dashboard element scope', () => {
  it('charts only the selected elements', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    await screen.findByRole('img', {
      name: 'Bar chart of element counts by Category',
    });
    const first = (await adapter.getVisible()).slice(0, 2);
    act(() => adapter.selectModelIds(first));
    fireEvent.change(screen.getByLabelText('Chart elements'), {
      target: { value: 'selected' },
    });
    await waitFor(() => {
      const total = [...document.querySelectorAll('table td')]
        .map((td) => Number(td.textContent))
        .filter((n) => Number.isInteger(n) && n > 0)
        .reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(4);
    });
  });
});
