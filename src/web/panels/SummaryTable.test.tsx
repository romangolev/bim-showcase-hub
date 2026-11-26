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
import { compareValues, ENTRY_CAP, SummaryTable } from './SummaryTable.js';

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

describe('SummaryTable sort comparison', () => {
  it('orders strings by the given locale', () => {
    expect(compareValues('ä', 'z', 'sv')).toBeGreaterThan(0);
    expect(compareValues('å', 'z', 'sv')).toBeGreaterThan(0);
    expect(compareValues('ä', 'z', 'de')).toBeLessThan(0);
    expect(compareValues('å', 'z', 'de')).toBeLessThan(0);
  });

  it('compares equal infinities as equal', () => {
    expect(compareValues(Infinity, Infinity, 'en-US')).toBe(0);
    expect(compareValues(-Infinity, -Infinity, 'en-US')).toBe(0);
    expect(compareValues(-Infinity, Infinity, 'en-US')).toBeLessThan(0);
    expect(compareValues(Infinity, -Infinity, 'en-US')).toBeGreaterThan(0);
  });
});

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

  it('gives clamped value and block title the full text on hover', () => {
    const { container } = render(
      <SummaryTable entries={groupedEntries} rows={rows} view={grouped} />,
    );
    expect(
      screen.getByRole('heading', { name: 'Element categories' }),
    ).toHaveAttribute('title', 'Element categories');
    const clamp = container.querySelector('.bsh-clamp[title="Walls"]');
    expect(clamp).not.toBeNull();
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
    expect(input).toHaveAttribute('data-slot', 'input');
    fireEvent.change(input, { target: { value: 'Types' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onTitleChange).toHaveBeenCalledWith('Category', 'Types');
  });

  it('cancels a block rename on Escape without committing', () => {
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
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onTitleChange).not.toHaveBeenCalled();
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

describe('SummaryTable pivot cap', () => {
  it('renders a bounded number of pivot rows and reveals the rest on request', () => {
    const rows: PropertyRow[] = Array.from(
      { length: ENTRY_CAP + 25 },
      (_, i) => ({ dbId: i, name: `n${i}`, properties: { Name: `v${i}` } }),
    );
    const { container } = render(
      <SummaryTable
        entries={[]}
        rows={rows}
        view={view({ layout: 'pivot', groupBy: ['Name'] })}
      />,
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(ENTRY_CAP + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Show 25 more' }));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(ENTRY_CAP + 25);
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

describe('SummaryTable sort before the cap', () => {
  const many = Array.from({ length: ENTRY_CAP + 5 }, (_, i) => ({
    property: 'Name',
    value: `v${String(i).padStart(4, '0')}`,
    count: i + 1,
  }));
  const top = String(ENTRY_CAP + 4).padStart(4, '0');

  const descending = (table: HTMLElement, name: string) => {
    const head = within(table).getByRole('columnheader', { name });
    fireEvent.click(within(head).getByRole('button', { name }));
    expect(within(table).getByRole('columnheader', { name })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  };

  it('shows the true top row of a descending flat sort', () => {
    render(<SummaryTable entries={many} />);
    const table = screen.getByRole('table');
    descending(table, 'Count');
    expect(within(table).getAllByRole('row')[1]?.children[1]?.textContent).toBe(
      `v${top}`,
    );
  });

  it('shows the true top row of a descending grouped block', () => {
    render(<SummaryTable entries={many} view={view({ layout: 'grouped' })} />);
    const table = screen.getByRole('table', { name: 'Name' });
    descending(table, 'Count');
    expect(within(table).getAllByRole('row')[1]?.children[0]?.textContent).toBe(
      `v${top}`,
    );
  });
});

describe('SummaryTable sorted cap', () => {
  it('keeps the full descending order in the capped slice', () => {
    const many = Array.from({ length: ENTRY_CAP + 100 }, (_, i) => ({
      property: 'Name',
      value: `v${String(i).padStart(4, '0')}`,
      count: i % 7,
    }));
    render(<SummaryTable entries={many} />);
    const table = screen.getByRole('table');
    const head = within(table).getByRole('columnheader', { name: 'Count' });
    fireEvent.click(within(head).getByRole('button', { name: 'Count' }));
    expect(head).toHaveAttribute('aria-sort', 'descending');
    const shown = within(table)
      .getAllByRole('row')
      .slice(1, ENTRY_CAP + 1)
      .map((row) => row.children[1]?.textContent ?? '');
    const expected = many
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.count - a.entry.count || a.index - b.index)
      .slice(0, ENTRY_CAP)
      .map(({ entry }) => entry.value);
    expect(shown).toEqual(expected);
  });
});

describe('SummaryTable sort values', () => {
  const sortRows: PropertyRow[] = [
    { dbId: 1, name: 'a', properties: { Category: 'A', Area: '2 m²' } },
    { dbId: 2, name: 'b', properties: { Category: 'B', Area: '10 m²' } },
    { dbId: 3, name: 'c', properties: { Category: 'C', Area: '' } },
  ];

  const sortBy = (table: HTMLElement, name: string, want: string) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const head = within(table).getByRole('columnheader', { name });
      if (head.getAttribute('aria-sort') === want) return;
      fireEvent.click(within(head).getByRole('button', { name }));
    }
    throw new Error(`could not sort ${name} ${want}`);
  };

  const column = (table: HTMLElement, index: number) =>
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.children[index]?.textContent ?? '');

  it('orders numbers numerically and keeps blanks last both ways', () => {
    render(
      <SummaryTable
        entries={summarize(sortRows, ['Category'])}
        rows={sortRows}
        view={view({ columns: [area] })}
      />,
    );
    const table = screen.getByRole('table');
    sortBy(table, 'Sum of Area', 'descending');
    expect(column(table, 2)).toEqual(['10 m²', '2 m²', 'n/a']);
    sortBy(table, 'Sum of Area', 'ascending');
    expect(column(table, 2)).toEqual(['2 m²', '10 m²', 'n/a']);
  });
});

describe('SummaryTable sorting', () => {
  const values = (table: HTMLElement) =>
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.children[1]?.textContent ?? '');

  it('sorts the flat table by a column and clears back to the view order', () => {
    const unsorted = [
      { property: 'Name', value: 'Beta', count: 1 },
      { property: 'Name', value: 'Alpha', count: 2 },
    ];
    render(<SummaryTable entries={unsorted} />);
    const table = screen.getByRole('table');
    const before = values(table);
    expect(before).toEqual(['Beta', 'Alpha']);
    const ascending = [...before].sort((a, b) => a.localeCompare(b));
    expect(ascending).not.toEqual(before);
    const value = screen.getByRole('columnheader', { name: 'Value' });
    expect(value).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(within(value).getByRole('button', { name: 'Value' }));
    expect(value).toHaveAttribute('aria-sort', 'ascending');
    expect(values(table)).toEqual(ascending);
    fireEvent.click(within(value).getByRole('button', { name: 'Value' }));
    expect(value).toHaveAttribute('aria-sort', 'descending');
    expect(values(table)).toEqual([...ascending].reverse());
    fireEvent.click(within(value).getByRole('button', { name: 'Value' }));
    expect(value).toHaveAttribute('aria-sort', 'none');
    expect(values(table)).toEqual(before);
  });

  it('sorts each grouped block on its own', () => {
    render(
      <SummaryTable
        entries={groupedEntries}
        rows={rows}
        view={view({ layout: 'grouped' })}
      />,
    );
    const category = screen.getByRole('table', { name: 'Category' });
    const level = screen.getByRole('table', { name: 'Level' });
    const rowsOf = (table: HTMLElement) =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent ?? '');
    const categoryBefore = rowsOf(category);
    const levelBefore = rowsOf(level);
    fireEvent.click(within(category).getByRole('button', { name: 'Value' }));
    expect(rowsOf(category)).toEqual(
      [...categoryBefore].sort((a, b) => a.localeCompare(b)),
    );
    expect(
      within(category).getByRole('columnheader', { name: 'Value' }),
    ).toHaveAttribute('aria-sort', 'ascending');
    expect(rowsOf(level)).toEqual(levelBefore);
    expect(
      within(level).getByRole('columnheader', { name: 'Value' }),
    ).toHaveAttribute('aria-sort', 'none');
  });

  it('offers no sorting on a decorative or pivot table', () => {
    render(<SummaryTable entries={entries} decorative />);
    expect(
      screen.queryByRole('button', { name: 'Value' }),
    ).not.toBeInTheDocument();
  });

  it('offers no sorting on the pivot table', () => {
    render(
      <SummaryTable
        entries={[]}
        rows={rows}
        view={view({ layout: 'pivot', groupBy: ['Category'] })}
      />,
    );
    const table = screen.getByRole('table', { name: 'Pivot by Category' });
    expect(within(table).queryByRole('button', { name: 'Value' })).toBeNull();
    expect(
      within(table).getByRole('columnheader', { name: 'Value' }),
    ).not.toHaveAttribute('aria-sort');
  });
});

describe('SummaryTable column resizing', () => {
  const sized = (name: string) =>
    screen.getByRole('columnheader', { name }).style.width;

  it('adds a named handle per column and keeps the header names', () => {
    render(
      <SummaryTable
        entries={entries}
        rows={rows}
        view={view({
          columns: [COUNT_COLUMN, summaryColumn('Missing', 'sum')],
        })}
      />,
    );
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.ariaLabel),
    ).toEqual([
      'Property',
      'Value',
      'Count',
      'Sum of Missing, no values in these elements',
    ]);
    expect(
      screen.getAllByRole('separator').map((handle) => handle.ariaLabel),
    ).toEqual([
      'Resize Property column',
      'Resize Value column',
      'Resize Count column',
      'Resize Sum of Missing, no values in these elements column',
    ]);
    expect(screen.getByRole('table')).not.toHaveAttribute('data-fixed');
    expect(sized('Value')).toBe('');
  });

  it('has no handle on a decorative table', () => {
    render(<SummaryTable entries={entries} decorative />);
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeVisible();
  });

  it('drags from the measured width and resets on a double click', () => {
    const measure = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 120 } as DOMRect);
    render(<SummaryTable entries={entries} />);
    const handle = screen.getByRole('separator', {
      name: 'Resize Value column',
    });
    expect(fireEvent.mouseDown(handle, { clientX: 300 })).toBe(false);
    fireEvent.mouseMove(document, { clientX: 340 });
    fireEvent.mouseUp(document, { clientX: 340 });
    measure.mockRestore();
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('data-fixed');
    expect(sized('Value')).toBe('160px');
    expect(sized('Property')).toBe('120px');
    expect(sized('Count')).toBe('120px');
    expect(table.style.width).toBe('400px');
    expect(handle).toHaveAttribute('aria-valuenow', '160');
    fireEvent.doubleClick(handle);
    expect(table).not.toHaveAttribute('data-fixed');
    expect(table.style.width).toBe('');
    expect(sized('Value')).toBe('');
  });

  it('resizes with the arrow keys within the limits and resets on Enter', () => {
    const measure = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 56 } as DOMRect);
    render(<SummaryTable entries={entries} />);
    const handle = screen.getByRole('separator', {
      name: 'Resize Count column',
    });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(sized('Count')).toBe('72px');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(sized('Count')).toBe('48px');
    fireEvent.keyDown(handle, { key: 'Enter' });
    measure.mockRestore();
    expect(sized('Count')).toBe('');
  });

  it('keeps sizes per table in the grouped layout', () => {
    render(
      <SummaryTable
        entries={groupedEntries}
        rows={rows}
        view={view({ layout: 'grouped' })}
      />,
    );
    const first = screen.getByRole('table', { name: 'Category' });
    fireEvent.keyDown(within(first).getAllByRole('separator')[0] as Element, {
      key: 'ArrowRight',
    });
    expect(first).toHaveAttribute('data-fixed');
    expect(screen.getByRole('table', { name: 'Level' })).not.toHaveAttribute(
      'data-fixed',
    );
  });

  it('resizes with mirrored arrow keys in a right-to-left container', () => {
    const measure = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 56 } as DOMRect);
    render(
      <div dir="rtl">
        <SummaryTable entries={entries} />
      </div>,
    );
    const handle = screen.getByRole('separator', {
      name: 'Resize Count column',
    });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(sized('Count')).toBe('72px');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(sized('Count')).toBe('56px');
    measure.mockRestore();
  });

  it('drags toward the end side in a right-to-left container', () => {
    const measure = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 120 } as DOMRect);
    render(
      <div dir="rtl">
        <SummaryTable entries={entries} />
      </div>,
    );
    const handle = screen.getByRole('separator', {
      name: 'Resize Value column',
    });
    fireEvent.mouseDown(handle, { clientX: 300 });
    fireEvent.mouseMove(document, { clientX: 260 });
    fireEvent.mouseUp(document, { clientX: 260 });
    measure.mockRestore();
    expect(sized('Value')).toBe('160px');
    expect(sized('Property')).toBe('120px');
  });
});
