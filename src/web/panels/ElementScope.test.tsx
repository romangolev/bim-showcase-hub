import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { elementScopeLabel } from './ElementScope.js';
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

describe('elementScopeLabel', () => {
  const twoModels = [
    { dbId: 1, name: 'x', properties: {}, modelId: 'b', modelName: 'B.rvt' },
    { dbId: 2, name: 'y', properties: {}, modelId: 'b', modelName: 'B.rvt' },
    { dbId: 1, name: 'z', properties: {}, modelId: 'a', modelName: 'A.rvt' },
  ];

  it('names how many rows came from each model', () => {
    expect(
      elementScopeLabel({
        elements: 'selected',
        rows: twoModels,
        total: 10,
        pending: false,
      }),
    ).toBe('Summarizing 3 selected of 10 elements (B.rvt 2, A.rvt 1)');
  });

  it('keeps one model silent and leaves the all scope empty', () => {
    expect(
      elementScopeLabel({
        elements: 'selected',
        rows: twoModels.slice(0, 2),
        total: 10,
        pending: false,
      }),
    ).toBe('Summarizing 2 selected of 10 elements');
    expect(
      elementScopeLabel({
        elements: 'all',
        rows: twoModels,
        total: 10,
        pending: false,
      }),
    ).toBe('');
  });

  it('does not count while the scope is still loading', () => {
    expect(
      elementScopeLabel({
        elements: 'selected',
        rows: twoModels,
        total: 10,
        pending: true,
      }),
    ).toBe('Reading selected elements');
  });
});

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
