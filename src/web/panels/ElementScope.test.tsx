import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { ModelSummaryPanel } from './ModelSummaryPanel.js';

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
