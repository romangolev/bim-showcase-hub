import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { DashboardPanel } from './DashboardPanel.js';
import { ExportButton } from './ExportButton.js';
import { ModelSummaryPanel } from './ModelSummaryPanel.js';
import { PaintToolbar } from './PaintToolbar.js';

vi.mock('chart.js', () => {
  class Chart {
    static register = vi.fn();
    static defaults = { font: {}, color: '' };
    destroy = vi.fn();
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

afterEach(() => {
  for (const a of adapters.splice(0)) a.destroy();
});

describe('ModelSummaryPanel', () => {
  it('renders counts in a table', async () => {
    const adapter = await loaded();
    render(
      <ModelSummaryPanel adapter={adapter} propertyNames={['Category']} />,
    );
    const walls = await screen.findByRole('cell', { name: 'Walls' });
    const row = walls.closest('tr');
    expect(row).not.toBeNull();
    expect(row?.querySelectorAll('td')[2]?.textContent).toMatch(/^\d+$/);
    expect(
      screen.getByRole('columnheader', { name: 'Count' }),
    ).toBeInTheDocument();
  });

  it('prompts to load a model when there is no adapter', () => {
    render(<ModelSummaryPanel />);
    expect(screen.getByText(/Load a model/)).toBeInTheDocument();
  });
});

describe('DashboardPanel', () => {
  it('renders labelled charts and a data table fallback', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} />);
    expect(
      await screen.findByRole('img', {
        name: 'Bar chart of element counts by Category',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /Legend/ })).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Doughnut chart of element share by Category',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Data table')).toBeInTheDocument();
  });

  it('switches property and collapses', async () => {
    const adapter = await loaded();
    const onCollapsedChange = vi.fn();
    render(
      <DashboardPanel
        adapter={adapter}
        onCollapsedChange={onCollapsedChange}
      />,
    );
    const select = await screen.findByLabelText('Group elements by');
    fireEvent.change(select, { target: { value: 'Level' } });
    expect(
      await screen.findByRole('img', {
        name: 'Bar chart of element counts by Level',
      }),
    ).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Collapse' });
    fireEvent.click(toggle);
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('honours the controlled collapsed prop', async () => {
    const adapter = await loaded();
    render(<DashboardPanel adapter={adapter} collapsed />);
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('PaintToolbar', () => {
  it('paints the current selection', async () => {
    const adapter = await loaded();
    const spy = vi.spyOn(adapter, 'setThemingColor');
    vi.spyOn(adapter, 'getSelection').mockReturnValue([101, 102]);
    render(<PaintToolbar adapter={adapter} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Paint selected items in red' }),
    );
    expect(spy).toHaveBeenCalledWith([101, 102], [1, 0, 0, 0.5]);
  });

  it('is disabled without an adapter', () => {
    render(<PaintToolbar />);
    expect(
      screen.getByRole('button', { name: 'Reset appearance' }),
    ).toBeDisabled();
  });
});

describe('ExportButton', () => {
  it('shows status feedback', async () => {
    const adapter = await loaded();
    const onStatus = vi.fn();
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    });
    render(<ExportButton adapter={adapter} onStatus={onStatus} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /^Exported \d+ elements/,
      ),
    );
    expect(
      screen.getByRole('status').querySelector('.badge .badge__dot'),
    ).not.toBeNull();
    expect(timeout.mock.calls.some((call) => call[1] === 4000)).toBe(true);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
