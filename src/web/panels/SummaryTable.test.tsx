import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import {
  DEFAULT_SUMMARY_VIEW,
  type SummaryView,
  summarize,
} from '../extensions/modelSummary.js';
import { SummaryTable } from './SummaryTable.js';

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

const view = (patch: Partial<SummaryView>): SummaryView => ({
  ...DEFAULT_SUMMARY_VIEW,
  ...patch,
});

describe('SummaryTable flat layout', () => {
  it('renders one table with no block chrome when no view is given', () => {
    const { container } = render(<SummaryTable entries={entries} />);
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelector('.bsh-table-block')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('adds a measure column only when the view asks for one', () => {
    render(<SummaryTable entries={entries} rows={rows} view={view({})} />);
    expect(screen.queryByRole('columnheader', { name: 'Measure' })).toBeNull();

    render(
      <SummaryTable
        entries={entries}
        rows={rows}
        view={view({ measure: 'Area' })}
      />,
    );
    expect(
      screen.getByRole('columnheader', { name: 'Measure' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1,212.5 m²')).toBeInTheDocument();
    expect(screen.getByText('3 m²')).toBeInTheDocument();
    expect(screen.queryByText('n/a')).toBeNull();
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

  it('shows n/a for mixed units and for empty measures', () => {
    const mixedRows: PropertyRow[] = [
      { dbId: 1, name: 'a', properties: { Category: 'Walls', Area: '10 m²' } },
      { dbId: 2, name: 'b', properties: { Category: 'Walls', Area: '2 m³' } },
      { dbId: 3, name: 'c', properties: { Category: 'Doors', Area: 'n/a' } },
    ];
    render(
      <SummaryTable
        entries={summarize(mixedRows, ['Category'])}
        rows={mixedRows}
        view={view({ layout: 'grouped', measure: 'Area' })}
      />,
    );
    expect(screen.getAllByText('n/a')).toHaveLength(2);
  });
});

describe('SummaryTable pivot layout', () => {
  const pivotRows: PropertyRow[] = [
    {
      dbId: 1,
      name: 'a',
      properties: { Category: 'Walls', Type: 'Basic' },
    },
    {
      dbId: 2,
      name: 'b',
      properties: { Category: 'Walls', Type: 'Basic' },
    },
    {
      dbId: 3,
      name: 'c',
      properties: { Category: 'Walls', Type: 'Curtain' },
    },
    {
      dbId: 4,
      name: 'd',
      properties: { Category: 'Doors', Type: 'Single' },
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

  it('falls back to the flat table without rows or a grouping', () => {
    const { container } = render(
      <SummaryTable
        entries={entries}
        rows={pivotRows}
        view={view({ layout: 'pivot', groupBy: [] })}
      />,
    );
    expect(container.querySelector('.bsh-table--pivot')).toBeNull();
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });
});
