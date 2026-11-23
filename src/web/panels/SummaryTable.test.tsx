import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import {
  COUNT_COLUMN,
  DEFAULT_SUMMARY_VIEW,
  type SummaryView,
  summarize,
  summaryColumn,
} from '../extensions/modelSummary.js';
import { ENTRY_CAP, SummaryTable } from './SummaryTable.js';

const rows: PropertyRow[] = [
  {
    dbId: 1,
    name: 'a',
    properties: { Category: 'Walls', Area: '12.5 m²', Level: 'L1' },
  },
  {
    dbId: 2,
    name: 'b',
    properties: { Category: 'Walls', Area: '1,200 m2', Level: 'L1' },
  },
  {
    dbId: 3,
    name: 'c',
    properties: { Category: 'Doors', Area: '3 m²', Level: 'L1' },
  },
  {
    dbId: 4,
    name: 'd',
    properties: { Category: 'Doors', Area: '', Level: 'L2' },
  },
];

const entries = summarize(rows, ['Category']);
const groupedEntries = summarize(rows, ['Category', 'Level']);
const area = summaryColumn('Area', 'sum');

const view = (patch: Partial<SummaryView>): SummaryView => ({
  ...DEFAULT_SUMMARY_VIEW,
  ...patch,
});

const headers = (scope: HTMLElement) =>
  within(scope)
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent);

describe('SummaryTable flat layout', () => {
  it('renders Property, Value and Count when no view is given', () => {
    const { container } = render(<SummaryTable entries={entries} />);
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelector('.bsh-table-block')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(headers(container)).toEqual(['Property', 'Value', 'Count']);
  });

  it('renders the configured columns in order with their cells', () => {
    const { container } = render(
      <SummaryTable
        entries={entries}
        rows={rows}
        view={view({ columns: [area, COUNT_COLUMN] })}
      />,
    );
    expect(headers(container)).toEqual([
      'Property',
      'Value',
      'Sum of Area',
      'Count',
    ]);
    expect(
      screen.getByRole('columnheader', { name: 'Sum of Area' }),
    ).toHaveAttribute('scope', 'col');
    expect(screen.getByText('1,212.5 m²')).toBeInTheDocument();
    expect(screen.getByText('3 m² (1 missing)')).toBeInTheDocument();
  });

  it('hides the property column on request and keeps the value', () => {
    const { container } = render(
      <SummaryTable
        entries={entries}
        rows={rows}
        view={view({ showProperty: false })}
      />,
    );
    expect(headers(container)).toEqual(['Value', 'Count']);
  });

  it('renders labels only when there is no column', () => {
    const { container } = render(
      <SummaryTable
        entries={entries}
        rows={rows}
        view={view({ columns: [] })}
      />,
    );
    expect(headers(container)).toEqual(['Property', 'Value']);
  });
});

describe('SummaryTable grouped layout', () => {
  const grouped = view({
    layout: 'grouped',
    titles: { Category: 'Element categories' },
  });

  it('renders a labelled, collapsible block per property with bars', () => {
    const { container } = render(
      <SummaryTable entries={groupedEntries} rows={rows} view={grouped} />,
    );
    const table = screen.getByRole('table', { name: 'Element categories' });
    expect(
      within(table).getByRole('columnheader', { name: 'Value' }),
    ).toHaveAttribute('scope', 'col');
    expect(
      within(table).getByRole('rowheader', { name: 'Walls' }),
    ).toHaveAttribute('scope', 'row');
    const bars = container.querySelectorAll('.bsh-count-bar');
    expect(bars[0]).toHaveAttribute('aria-hidden', 'true');
    expect(bars[0]).toHaveStyle({ width: '100%' });
    expect(bars[1]).toHaveStyle({ width: '100%' });
    expect(bars[2]).toHaveStyle({ width: '100%' });
    expect(bars[3]).toHaveStyle({ width: '33%' });
    expect(within(table).getAllByText('2')).toHaveLength(2);
    expect(screen.getByRole('table', { name: 'Level' })).toBeInTheDocument();
  });

  it('has no hard-coded Count header', () => {
    render(
      <SummaryTable
        entries={entries}
        rows={rows}
        view={view({ layout: 'grouped', columns: [area] })}
      />,
    );
    const table = screen.getByRole('table', { name: 'Category' });
    expect(headers(table)).toEqual(['Value', 'Sum of Area']);
  });

  it('renames a block through the heading input', () => {
    const onTitleChange = vi.fn();
    render(
      <SummaryTable
        entries={entries}
        rows={rows}
        view={grouped}
        onTitleChange={onTitleChange}
      />,
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Rename' })[0] as HTMLElement,
    );
    const input = screen.getByLabelText('Title for Category');
    fireEvent.change(input, { target: { value: 'Types' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onTitleChange).toHaveBeenCalledWith('Category', 'Types');
  });

  it('keeps collapse state per table instance', () => {
    render(
      <>
        <SummaryTable entries={entries} rows={rows} view={grouped} />
        <SummaryTable entries={entries} rows={rows} view={grouped} />
      </>,
    );
    expect(
      screen.getAllByRole('table', { name: 'Element categories' }),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'Collapse Element categories',
      })[0] as HTMLElement,
    );
    expect(
      screen.getAllByRole('table', { name: 'Element categories' }),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Expand all' })[0] as HTMLElement,
    );
    expect(
      screen.getAllByRole('table', { name: 'Element categories' }),
    ).toHaveLength(2);
  });

  it('shows mixed units and n/a', () => {
    const mixedRows: PropertyRow[] = [
      { dbId: 1, name: 'a', properties: { Category: 'Walls', Area: '10 m²' } },
      { dbId: 2, name: 'b', properties: { Category: 'Walls', Area: '2 m³' } },
      { dbId: 3, name: 'c', properties: { Category: 'Doors', Area: 'n/a' } },
    ];
    render(
      <SummaryTable
        entries={summarize(mixedRows, ['Category'])}
        rows={mixedRows}
        view={view({ layout: 'grouped', columns: [COUNT_COLUMN, area] })}
      />,
    );
    const mixed = screen.getByText('mixed units');
    expect(mixed.closest('td')).toHaveAttribute('title', 'Mixed units: m², m³');
    expect(screen.getByText('n/a')).toBeInTheDocument();
  });
});

describe('SummaryTable pivot layout', () => {
  const pivotRows: PropertyRow[] = [
    {
      dbId: 1,
      name: 'a',
      properties: { Category: 'Walls', Type: 'Basic', Area: '1 m²' },
    },
    {
      dbId: 2,
      name: 'b',
      properties: { Category: 'Walls', Type: 'Basic', Area: '2 m²' },
    },
    {
      dbId: 3,
      name: 'c',
      properties: { Category: 'Walls', Type: 'Curtain', Area: '3 m²' },
    },
    {
      dbId: 4,
      name: 'd',
      properties: { Category: 'Doors', Type: 'Single', Area: '4 m²' },
    },
  ];
  const pivot = view({ layout: 'pivot', groupBy: ['Category', 'Type'] });

  it('renders counts at every level and collapses a subtree', () => {
    render(<SummaryTable entries={[]} rows={pivotRows} view={pivot} />);
    const table = screen.getByRole('table', {
      name: 'Pivot by Category, Type',
    });
    expect(within(table).getByText('Walls')).toBeInTheDocument();
    expect(within(table).getByText('Basic')).toBeInTheDocument();
    expect(within(table).getByText('Curtain')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Walls' }));
    expect(within(table).queryByText('Basic')).toBeNull();
    expect(within(table).queryByText('Curtain')).toBeNull();
    expect(within(table).getByText('Doors')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(within(table).getByText('Doors')).toBeInTheDocument();
    expect(within(table).queryByText('Single')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(within(table).getByText('Single')).toBeInTheDocument();
  });

  it('renders the configured columns for every node', () => {
    render(
      <SummaryTable
        entries={[]}
        rows={pivotRows}
        view={view({ ...pivot, columns: [COUNT_COLUMN, area] })}
      />,
    );
    const table = screen.getByRole('table', {
      name: 'Pivot by Category, Type',
    });
    expect(headers(table)).toEqual(['Value', 'Count', 'Sum of Area']);
    expect(within(table).getByText('6 m²')).toBeInTheDocument();
    expect(within(table).getAllByText('4 m²')).toHaveLength(2);
  });

  it('nests the row list when no grouping is chosen', () => {
    render(
      <SummaryTable
        entries={summarize(pivotRows, ['Category', 'Type'])}
        rows={pivotRows}
        propertyNames={['Category', 'Type']}
        view={view({ layout: 'pivot', groupBy: [] })}
      />,
    );
    expect(
      screen.getByRole('table', { name: 'Pivot by Category, Type' }),
    ).toBeInTheDocument();
  });

  it('falls back to the flat table without rows', () => {
    const { container } = render(
      <SummaryTable
        entries={entries}
        view={view({ layout: 'pivot', groupBy: [] })}
      />,
    );
    expect(container.querySelector('.bsh-table--pivot')).toBeNull();
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });
});

describe('SummaryTable entry cap', () => {
  const many = Array.from({ length: ENTRY_CAP + 25 }, (_, i) => ({
    property: 'Name',
    value: `v${i}`,
    count: 1,
  }));

  it('caps flat rows, spans every column and reveals the rest on request', () => {
    const { container } = render(
      <SummaryTable
        entries={many}
        view={view({ columns: [COUNT_COLUMN, area] })}
      />,
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(ENTRY_CAP + 1);
    const more = screen.getByRole('button', { name: 'Show 25 more' });
    expect(more.closest('td')).toHaveAttribute('colspan', '4');
    fireEvent.click(more);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(ENTRY_CAP + 25);
  });

  it('caps each grouped block', () => {
    const { container } = render(
      <SummaryTable entries={many} view={view({ layout: 'grouped' })} />,
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(ENTRY_CAP + 1);
    expect(
      screen.getByRole('button', { name: 'Show 25 more' }).closest('td'),
    ).toHaveAttribute('colspan', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Show 25 more' }));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(ENTRY_CAP + 25);
  });
});
