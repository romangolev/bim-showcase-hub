import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.js';
import type { CommonProps, Size } from './types.js';

type PartProps<T extends 'table' | 'thead' | 'tbody' | 'tr' | 'th' | 'td'> =
  Omit<ComponentProps<T>, 'className'> & CommonProps;

const cell = 'border-b px-2 py-1.5 text-start group-data-compact/table:py-0.5';
const head =
  'border-line bg-surface font-label whitespace-nowrap text-fg-subtle';
const body = 'border-line text-fg-muted';
const stuck = 'sticky top-0 z-raised';
const number = 'text-end whitespace-nowrap tabular-nums';

export type TableSort = 'ascending' | 'descending' | 'none';

export type TableProps = PartProps<'table'> & { size?: Size };

export function Table({
  className,
  effect,
  size = 'default',
  ...props
}: TableProps) {
  return (
    <table
      {...props}
      data-slot="table"
      data-size={size}
      data-compact={size === 'small' ? '' : undefined}
      data-effect={effect}
      className={cn(
        'group/table w-full border-separate border-spacing-0 text-13',
        className,
      )}
    />
  );
}

export function TableHeader({
  className,
  effect,
  ...props
}: PartProps<'thead'>) {
  return (
    <thead
      {...props}
      data-slot="table-header"
      data-effect={effect}
      className={cn(className)}
    />
  );
}

export function TableBody({ className, effect, ...props }: PartProps<'tbody'>) {
  return (
    <tbody
      {...props}
      data-slot="table-body"
      data-effect={effect}
      className={cn(className)}
    />
  );
}

export type TableRowProps = PartProps<'tr'> & { selected?: boolean };

export function TableRow({
  className,
  effect,
  selected,
  ...props
}: TableRowProps) {
  return (
    <tr
      {...props}
      aria-selected={selected}
      data-selected={selected ? '' : undefined}
      data-slot="table-row"
      data-effect={effect}
      className={cn('data-selected:bg-fill', className)}
    />
  );
}

export type TableHeadProps = PartProps<'th'> & {
  sticky?: boolean;
  numeric?: boolean;
};

export function TableHead({
  className,
  effect,
  sticky = false,
  numeric = false,
  ...props
}: TableHeadProps) {
  return (
    <th
      scope="col"
      {...props}
      data-slot="table-head"
      data-effect={effect}
      className={cn(cell, head, sticky && stuck, numeric && number, className)}
    />
  );
}

export type TableSortHeadProps = Omit<TableHeadProps, 'aria-sort'> & {
  sort: TableSort;
  onSort: () => void;
  indicator?: ReactNode;
};

export function TableSortHead({
  className,
  effect,
  sticky = false,
  numeric = false,
  sort,
  onSort,
  indicator,
  children,
  ...props
}: TableSortHeadProps) {
  return (
    <th
      scope="col"
      {...props}
      aria-sort={sort}
      data-slot="table-sort-head"
      data-effect={effect}
      className={cn(cell, head, sticky && stuck, numeric && number, className)}
    >
      <button
        type="button"
        data-slot="table-sort-button"
        className="inline-flex min-h-hit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-inherit hover:text-fg"
        onClick={onSort}
      >
        {children}
        {indicator}
      </button>
    </th>
  );
}

export type TableCellProps = PartProps<'td'> & {
  rowHeader?: boolean;
  numeric?: boolean;
};

export function TableCell({
  className,
  effect,
  rowHeader = false,
  numeric = false,
  ...props
}: TableCellProps) {
  const Tag = rowHeader ? 'th' : 'td';
  return (
    <Tag
      scope={rowHeader ? 'row' : undefined}
      {...props}
      data-slot="table-cell"
      data-effect={effect}
      className={cn(
        cell,
        body,
        rowHeader && 'font-body',
        numeric && number,
        className,
      )}
    />
  );
}
