import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortHead,
} from './Table.js';

function Sample({ onSort = () => undefined }: { onSort?: () => void }) {
  return (
    <Table aria-label="Walls" size="small">
      <TableHeader>
        <TableRow>
          <TableSortHead sort="descending" onSort={onSort} sticky>
            Value
          </TableSortHead>
          <TableHead numeric>Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow selected>
          <TableCell rowHeader>Basic Wall</TableCell>
          <TableCell numeric className="app-count">
            12
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe('Table', () => {
  it('keeps the native table roles and names', () => {
    render(<Sample />);
    expect(screen.getByRole('table', { name: 'Walls' })).toHaveAttribute(
      'data-slot',
      'table',
    );
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual(['Value', 'Count']);
    expect(screen.getByRole('rowheader', { name: 'Basic Wall' }).tagName).toBe(
      'TH',
    );
    expect(screen.getByRole('cell', { name: '12' })).toHaveAttribute(
      'data-slot',
      'table-cell',
    );
    expect(screen.getAllByRole('rowgroup')).toHaveLength(2);
  });

  it('marks the size, the selected row and the sort state for styling', () => {
    render(<Sample />);
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('data-size', 'small');
    expect(table).toHaveAttribute('data-compact');
    const row = screen.getByRole('row', { selected: true });
    expect(row).toHaveAttribute('data-selected');
    expect(screen.getByRole('columnheader', { name: 'Value' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(
      screen.getByRole('columnheader', { name: 'Count' }),
    ).not.toHaveAttribute('aria-sort');
  });

  it('writes no compact or selected mark by default', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table')).not.toHaveAttribute('data-compact');
    expect(screen.getByRole('row')).not.toHaveAttribute('data-selected');
    expect(screen.getByRole('row')).not.toHaveAttribute('aria-selected');
    expect(screen.getByRole('cell').tagName).toBe('TD');
  });

  it('sorts from a real button inside the header cell', () => {
    const onSort = vi.fn();
    render(<Sample onSort={onSort} />);
    const button = screen.getByRole('button', { name: 'Value' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('min-h-hit');
    fireEvent.click(button);
    expect(onSort).toHaveBeenCalledTimes(1);
  });

  it('shows the indicator the caller passes', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableSortHead
              sort="ascending"
              onSort={() => undefined}
              indicator={<span data-testid="arrow" aria-hidden="true" />}
            >
              Value
            </TableSortHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    expect(screen.getByRole('button', { name: 'Value' })).toContainElement(
      screen.getByTestId('arrow'),
    );
  });

  it('lets an app class win and keeps a caller scope', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="colgroup" sticky numeric>
              Group
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell numeric className="app-count">
              12
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const head = screen.getByRole('columnheader');
    expect(head).toHaveAttribute('scope', 'colgroup');
    expect(head).toHaveClass('sticky', 'text-end');
    expect(screen.getByRole('cell')).toHaveClass('app-count', 'tabular-nums');
  });
});
