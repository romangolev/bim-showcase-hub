import {
  type ColumnDef,
  columnResizingFeature,
  columnSizingFeature,
  createSortedRowModel,
  FlexRender,
  metaHelper,
  type Row,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import {
  type CSSProperties,
  memo,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropertyRow } from '../../shared/types.js';
import { Icon } from '../components/icons.js';
import {
  blockTitle,
  COUNT_COLUMN,
  cellsByEntry,
  columnTitle,
  countShare,
  EMPTY_VALUE_LABEL,
  entryKey,
  formatCell,
  formatCount,
  formatValue,
  MAX_GROUP_BY,
  MAX_TITLE_LENGTH,
  NO_CELL,
  type PivotNode,
  pivotTree,
  type SummaryCell,
  type SummaryColumnSpec,
  type SummaryEntry,
  type SummaryView,
  summaryBlocks,
} from '../extensions/modelSummary.js';
import { useSettings } from '../settings/SettingsContext.js';
import type { Language } from '../settings/settings.js';
import { useScrollable } from './useScrollable.js';
import './panels.css';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import { Input } from '../ui/Input.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableResizeHandle,
  TableRow,
  TableSortHead,
} from '../ui/Table.js';

export const ENTRY_CAP = 500;

const DEFAULT_COLUMNS: readonly SummaryColumnSpec[] = [COUNT_COLUMN];
const NO_ROWS: readonly PropertyRow[] = [];
const BLANK_NOTE = 'no values in these elements';

function TitleInput({
  property,
  title,
  onCommit,
  onCancel,
}: {
  property: string;
  title: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(title);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <Input
      ref={ref}
      type="text"
      className="bsh-table-block__input"
      aria-label={`Title for ${property}`}
      maxLength={MAX_TITLE_LENGTH}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit(value);
        if (event.key === 'Escape') onCancel();
      }}
    />
  );
}

interface Line {
  key: string;
  cells: readonly SummaryCell[];
  entry?: SummaryEntry;
  node?: PivotNode;
  depth?: number;
  collapsed?: boolean;
}

interface CellAttrs {
  title?: string;
  style?: CSSProperties;
}

interface ColumnMeta {
  label: string;
  className: string;
  cellClassName?: string;
  title?: string;
  rowHeader?: boolean;
  numeric?: boolean;
  sortValue?: (line: Line) => string | number | null;
  attrs?: (line: Line) => CellAttrs;
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function sortableColumn(column: GridColumn): GridColumn {
  const sortValue = column.meta?.sortValue;
  if (!sortValue) return column;
  return {
    ...column,
    accessorFn: sortValue,
    sortFn: (rowA, rowB) =>
      compareValues(sortValue(rowA.original), sortValue(rowB.original)),
  };
}

const features = tableFeatures({
  columnMeta: metaHelper<ColumnMeta>(),
  columnSizingFeature,
  columnResizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

type GridColumn = ColumnDef<typeof features, Line>;

const NO_ATTRS: CellAttrs = {};
const COLUMN_LIMITS = { minSize: 48, maxSize: 1600 };
const RESIZE_STEP = 16;
const NO_CELLS: readonly SummaryCell[] = [];
const PROPERTY_COLUMN: GridColumn = {
  id: 'bsh:property',
  header: 'Property',
  cell: ({ row }) => (
    <span className="bsh-clamp">{row.original.entry?.property}</span>
  ),
  meta: {
    label: 'Property',
    className: 'bsh-col-property',
    sortValue: (line) => line.entry?.property ?? null,
    attrs: (line) => ({ title: line.entry?.property }),
  },
};

function specColumns(
  specs: readonly SummaryColumnSpec[],
  blank: ReadonlySet<string>,
  max: number | null,
  language: Language,
): GridColumn[] {
  return specs.map((spec, index) => {
    const title = columnTitle(spec);
    const empty = spec.property !== null && blank.has(spec.property);
    const format = (line: Line) => {
      const cell = line.cells[index] ?? NO_CELL;
      if (max !== null && spec.property === null && cell.status === 'ok') {
        const text = formatCount(cell.value);
        return { text, title: text, share: countShare(cell.value, max) };
      }
      const text = formatCell(cell, spec, language);
      return {
        text,
        title:
          cell.status === 'mixed'
            ? `Mixed units: ${cell.units.join(', ')}`
            : text,
        share: null,
      };
    };
    const seen = new WeakMap<Line, ReturnType<typeof format>>();
    const read = (line: Line) => {
      const known = seen.get(line);
      if (known) return known;
      const fresh = format(line);
      seen.set(line, fresh);
      return fresh;
    };
    return {
      id: spec.id,
      header: () => (
        <>
          {title}
          {empty ? (
            <>
              <Icon name="alert" size={12} />
              <span className="bsh-sr-only">, {BLANK_NOTE}</span>
            </>
          ) : null}
        </>
      ),
      cell: ({ row }) => {
        const { text, share } = read(row.original);
        return share === null ? (
          <span className="bsh-clamp bsh-measure">{text}</span>
        ) : (
          <>
            <span
              className="bsh-count-bar"
              aria-hidden="true"
              style={{ width: `${share}%` }}
            />
            <span className="bsh-clamp bsh-count-value">{text}</span>
          </>
        );
      },
      meta: {
        label: empty ? `${title}, ${BLANK_NOTE}` : title,
        className: 'bsh-num',
        numeric: true,
        title: empty ? `${title}: ${BLANK_NOTE}` : title,
        sortValue: (line) => {
          const cell = line.cells[index] ?? NO_CELL;
          return cell.status === 'ok' && typeof cell.value === 'number'
            ? cell.value
            : read(line).text;
        },
        attrs: (line) => ({ title: read(line).title }),
      },
    };
  });
}

const GridRow = memo(function GridRow({
  row,
  active,
}: {
  row: Row<typeof features, Line>;
  columns: GridColumn[];
  active: boolean;
}) {
  return (
    <TableRow data-active={active ? 'true' : undefined}>
      {row.getAllCells().map((cell) => {
        const meta = cell.column.columnDef.meta;
        return (
          <TableCell
            key={cell.id}
            rowHeader={meta?.rowHeader}
            numeric={meta?.numeric}
            className={meta?.cellClassName ?? meta?.className}
            {...(meta?.attrs?.(row.original) ?? NO_ATTRS)}
          >
            <FlexRender cell={cell} />
          </TableCell>
        );
      })}
    </TableRow>
  );
});

function Grid({
  columns,
  lines,
  className,
  label,
  activeKey,
  resizable,
  sortable = true,
  children,
}: {
  columns: GridColumn[];
  lines: Line[];
  className: string;
  label?: string;
  activeKey?: string | null;
  resizable: boolean;
  sortable?: boolean;
  children?: ReactNode;
}) {
  const gridColumns = useMemo(() => columns.map(sortableColumn), [columns]);
  const table = useTable({
    features,
    columns: gridColumns,
    data: lines,
    getRowId: (line) => line.key,
    columnResizeMode: 'onChange',
    defaultColumn: COLUMN_LIMITS,
    enableSorting: sortable,
    enableSortingRemoval: true,
    enableMultiSort: false,
  });
  const sized = Object.keys(table.state.columnSizing).length > 0;
  const freeze = (handle: Element) => {
    if (sized) return;
    const cells = handle.closest('tr')?.children;
    const widths: Record<string, number> = {};
    table.getAllLeafColumns().forEach((column, index) => {
      widths[column.id] = cells?.[index]?.getBoundingClientRect().width ?? 0;
    });
    table.setColumnSizing(widths);
  };
  return (
    <Table
      className={className}
      aria-label={label}
      fixed={sized}
      style={sized ? { width: table.getTotalSize() } : undefined}
    >
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => {
              const { column } = header;
              const meta = column.columnDef.meta;
              const sorted = column.getIsSorted();
              const start = (event: { currentTarget: Element }) => {
                freeze(event.currentTarget);
                header.getResizeHandler()(event);
              };
              const headProps = {
                className: meta?.className,
                title: meta?.title,
                'aria-label': resizable ? meta?.label : undefined,
                style: sized ? { width: header.getSize() } : undefined,
              };
              const resize = resizable ? (
                <TableResizeHandle
                  label={`Resize ${meta?.label} column`}
                  value={sized ? Math.round(header.getSize()) : undefined}
                  active={column.getIsResizing()}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    start(event);
                  }}
                  onTouchStart={start}
                  onDoubleClick={() => table.resetColumnSizing(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      table.resetColumnSizing(true);
                      return;
                    }
                    const step =
                      event.key === 'ArrowRight'
                        ? RESIZE_STEP
                        : event.key === 'ArrowLeft'
                          ? -RESIZE_STEP
                          : 0;
                    if (!step) return;
                    event.preventDefault();
                    freeze(event.currentTarget);
                    table.setColumnSizing((old) => ({
                      ...old,
                      [column.id]: Math.min(
                        COLUMN_LIMITS.maxSize,
                        Math.max(
                          COLUMN_LIMITS.minSize,
                          (old[column.id] ?? 0) + step,
                        ),
                      ),
                    }));
                  }}
                />
              ) : null;
              if (sortable && column.getCanSort()) {
                return (
                  <TableSortHead
                    key={header.id}
                    {...headProps}
                    sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                    onSort={() => column.toggleSorting()}
                    indicator={
                      sorted ? (
                        <Icon
                          name={sorted === 'asc' ? 'arrowUp' : 'arrowDown'}
                          size={12}
                          className="bsh-sort-icon"
                          aria-hidden="true"
                        />
                      ) : null
                    }
                    trailing={resize}
                  >
                    <table.FlexRender header={header} />
                  </TableSortHead>
                );
              }
              return (
                <TableHead key={header.id} {...headProps}>
                  <table.FlexRender header={header} />
                  {resize}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <GridRow
            key={row.id}
            row={row}
            columns={columns}
            active={activeKey === row.id}
          />
        ))}
        {children}
      </TableBody>
    </Table>
  );
}

function MoreRow({
  span,
  count,
  onShow,
}: {
  span: number;
  count: number;
  onShow: () => void;
}) {
  return (
    <TableRow>
      <TableCell colSpan={span}>
        <Button onClick={onShow}>Show {formatCount(count)} more</Button>
      </TableCell>
    </TableRow>
  );
}

function BlockGrid({
  entries,
  expanded,
  cells,
  valueColumn,
  specs,
  blank,
  language,
  title,
  activeKey,
  resizable,
  sortable,
  onExpand,
}: {
  entries: readonly SummaryEntry[];
  expanded: boolean;
  cells: ReadonlyMap<string, readonly SummaryCell[]>;
  valueColumn: GridColumn;
  specs: readonly SummaryColumnSpec[];
  blank: ReadonlySet<string>;
  language: Language;
  title: string;
  activeKey?: string | null;
  resizable: boolean;
  sortable: boolean;
  onExpand: () => void;
}) {
  const columns = useMemo(() => {
    const max = entries.reduce((most, entry) => Math.max(most, entry.count), 0);
    return [valueColumn, ...specColumns(specs, blank, max, language)];
  }, [entries, valueColumn, specs, blank, language]);
  const lines = useMemo(
    () =>
      (expanded ? entries : entries.slice(0, ENTRY_CAP)).map((entry): Line => {
        const key = entryKey(entry);
        return { key, entry, cells: cells.get(key) ?? NO_CELLS };
      }),
    [entries, expanded, cells],
  );
  return (
    <Grid
      columns={columns}
      lines={lines}
      className="bsh-table bsh-table--summary"
      label={title}
      activeKey={activeKey}
      resizable={resizable}
      sortable={sortable}
    >
      {!expanded && entries.length > ENTRY_CAP ? (
        <MoreRow
          span={columns.length}
          count={entries.length - ENTRY_CAP}
          onShow={onExpand}
        />
      ) : null}
    </Grid>
  );
}

interface PivotRow {
  node: PivotNode;
  depth: number;
  key: string;
}

function flattenPivot(
  nodes: readonly PivotNode[],
  collapsed: ReadonlySet<string>,
  prefix: string,
  depth: number,
  out: PivotRow[],
): PivotRow[] {
  for (const node of nodes) {
    const key = `${prefix}\u0000${node.value}`;
    out.push({ node, depth, key });
    if (!collapsed.has(key)) {
      flattenPivot(node.children, collapsed, key, depth + 1, out);
    }
  }
  return out;
}

function allPivotKeys(
  nodes: readonly PivotNode[],
  prefix = '',
  out: string[] = [],
): string[] {
  for (const node of nodes) {
    const key = `${prefix}\u0000${node.value}`;
    out.push(key);
    allPivotKeys(node.children, key, out);
  }
  return out;
}

export function SummaryTable({
  entries,
  decorative = false,
  activeKey,
  onPick,
  propertyNames,
  view,
  rows,
  onTitleChange,
}: {
  entries: SummaryEntry[];
  decorative?: boolean;
  activeKey?: string | null;
  onPick?: (entry: SummaryEntry) => void;
  propertyNames?: readonly string[];
  view?: SummaryView;
  rows?: readonly PropertyRow[];
  onTitleChange?: (property: string, title: string) => void;
}) {
  const uid = useId();
  const { language } = useSettings().settings;
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(wrapRef);
  const [collapsedBlocks, setCollapsedBlocks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [collapsedNodes, setCollapsedNodes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pivotAll, setPivotAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [expandedProps, setExpandedProps] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const layout = view?.layout ?? 'flat';
  const columns = view?.columns ?? DEFAULT_COLUMNS;
  const showProperty = view?.showProperty ?? true;
  const available = useMemo(
    () => new Set(propertyNames ?? entries.map((entry) => entry.property)),
    [propertyNames, entries],
  );
  const chosen = propertyNames
    ? (view?.groupBy ?? []).filter((name) => available.has(name))
    : (view?.groupBy ?? []);
  const groupBy =
    chosen.length > 0 ? chosen : [...available].slice(0, MAX_GROUP_BY);
  const groupByKey = groupBy.join('\u0000');
  const titles = view?.titles ?? {};

  const blank = useMemo(() => {
    const names = new Set<string>();
    if (!rows || rows.length === 0) return names;
    for (const { property } of columns) {
      if (
        property !== null &&
        rows.every(
          (row) => formatValue(row.properties[property]) === EMPTY_VALUE_LABEL,
        )
      ) {
        names.add(property);
      }
    }
    return names;
  }, [rows, columns]);
  const blocks = useMemo(() => summaryBlocks(entries), [entries]);
  const flat = useMemo(() => {
    const seen = new Map<string, number>();
    const hidden = new Map<string, number>();
    const shown: SummaryEntry[] = [];
    for (const entry of entries) {
      const index = seen.get(entry.property) ?? 0;
      seen.set(entry.property, index + 1);
      if (index < ENTRY_CAP || expandedProps.has(entry.property)) {
        shown.push(entry);
      } else {
        hidden.set(entry.property, (hidden.get(entry.property) ?? 0) + 1);
      }
    }
    return { shown, hidden };
  }, [entries, expandedProps]);
  const cells = useMemo(
    () =>
      layout === 'pivot'
        ? new Map<string, SummaryCell[]>()
        : cellsByEntry(rows ?? NO_ROWS, flat.shown, columns),
    [layout, rows, flat.shown, columns],
  );
  const hiddenTotal = [...flat.hidden.values()].reduce((a, b) => a + b, 0);
  const expandProps = (properties: Iterable<string>) =>
    setExpandedProps((previous) => new Set([...previous, ...properties]));
  const tree = useMemo(() => {
    if (layout !== 'pivot' || !rows || !groupByKey) return [];
    return pivotTree(rows, groupByKey.split('\u0000'), { columns });
  }, [layout, rows, groupByKey, columns]);
  const pivotRows = useMemo(
    () => flattenPivot(tree, collapsedNodes, '', 0, []),
    [tree, collapsedNodes],
  );
  const pivotShown = useMemo(
    () => (pivotAll ? pivotRows : pivotRows.slice(0, ENTRY_CAP)),
    [pivotAll, pivotRows],
  );
  const pivotMax = useMemo(
    () => tree.reduce((max, node) => Math.max(max, node.count), 0),
    [tree],
  );

  const toggleBlock = (property: string) => {
    setCollapsedBlocks((previous) => {
      const next = new Set(previous);
      if (next.has(property)) next.delete(property);
      else next.add(property);
      return next;
    });
  };
  const toggleNode = (key: string) => {
    setCollapsedNodes((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const expandAll = () => {
    setCollapsedBlocks(new Set());
    setCollapsedNodes(new Set());
  };
  const collapseAll = () => {
    setCollapsedBlocks(new Set(blocks.map((block) => block.property)));
    setCollapsedNodes(new Set(allPivotKeys(tree)));
  };
  const actions = useRef({ onPick, toggleNode });
  actions.current = { onPick, toggleNode };
  const pickable = Boolean(onPick);
  const valueColumns = useMemo(() => {
    const column = (rowHeader: boolean): GridColumn => ({
      id: 'bsh:value',
      header: 'Value',
      cell: ({ row }) => {
        const entry = row.original.entry;
        if (!entry) return null;
        return pickable ? (
          <button
            type="button"
            className="bsh-row-pick"
            onClick={() => actions.current.onPick?.(entry)}
          >
            <span className="bsh-clamp">{entry.value}</span>
          </button>
        ) : (
          <span className="bsh-clamp">{entry.value}</span>
        );
      },
      meta: {
        label: 'Value',
        className: 'bsh-col-value',
        rowHeader,
        sortValue: (line) => line.entry?.value ?? null,
        attrs: (line) => ({ title: line.entry?.value }),
      },
    });
    return { cell: column(false), rowHeader: column(true) };
  }, [pickable]);
  const flatColumns = useMemo(
    () => [
      ...(showProperty ? [PROPERTY_COLUMN] : []),
      valueColumns.cell,
      ...specColumns(columns, blank, null, language),
    ],
    [showProperty, valueColumns, columns, blank, language],
  );
  const flatLines = useMemo(
    () =>
      flat.shown.map((entry): Line => {
        const key = entryKey(entry);
        return { key, entry, cells: cells.get(key) ?? NO_CELLS };
      }),
    [flat.shown, cells],
  );
  const pivotColumns = useMemo(
    (): GridColumn[] => [
      {
        id: 'bsh:value',
        header: 'Value',
        cell: ({ row }) => {
          const { node, collapsed, key } = row.original;
          if (!node) return null;
          return (
            <>
              {node.children.length > 0 ? (
                <IconButton
                  label={
                    collapsed
                      ? `Expand ${node.value}`
                      : `Collapse ${node.value}`
                  }
                  className="bsh-pivot__toggle"
                  aria-expanded={!collapsed}
                  onClick={() => actions.current.toggleNode(key)}
                >
                  <Icon
                    name="chevron"
                    size={14}
                    className="bsh-pivot__chevron"
                    data-expanded={!collapsed}
                  />
                </IconButton>
              ) : (
                <span className="bsh-pivot__spacer" aria-hidden="true" />
              )}
              <span className="bsh-clamp">{node.value}</span>
            </>
          );
        },
        meta: {
          label: 'Value',
          className: 'bsh-col-value',
          cellClassName: 'bsh-col-value bsh-pivot__value',
          rowHeader: true,
          attrs: (line) => ({
            style: {
              paddingInlineStart: `${0.5 + (line.depth ?? 0) * 0.9}rem`,
            },
          }),
        },
      },
      ...specColumns(columns, blank, pivotMax, language),
    ],
    [columns, blank, pivotMax, language],
  );
  const pivotLines = useMemo(
    () =>
      pivotShown.map(
        ({ node, depth, key }): Line => ({
          key,
          node,
          depth,
          collapsed: collapsedNodes.has(key),
          cells: node.cells,
        }),
      ),
    [pivotShown, collapsedNodes],
  );
  const regionProps =
    scrollable && !decorative
      ? {
          role: 'region' as const,
          tabIndex: 0,
          'aria-label': 'Summary table, scrollable',
        }
      : {};
  const tools = (show: boolean) =>
    show ? (
      <div className="bsh-summary-blocks__tools">
        <Button onClick={expandAll}>Expand all</Button>
        <Button onClick={collapseAll}>Collapse all</Button>
      </div>
    ) : null;

  const flatTable = (
    <Grid
      columns={flatColumns}
      lines={flatLines}
      className="bsh-table bsh-table--summary"
      activeKey={activeKey}
      resizable={!decorative}
      sortable={!decorative}
    >
      {hiddenTotal > 0 ? (
        <MoreRow
          span={flatColumns.length}
          count={hiddenTotal}
          onShow={() => expandProps(flat.hidden.keys())}
        />
      ) : null}
    </Grid>
  );

  const groupedTable = (
    <div className="bsh-summary-blocks">
      {tools(true)}
      {blocks.map((block, index) => {
        const title = blockTitle(titles, block.property);
        const collapsed = collapsedBlocks.has(block.property);
        const bodyId = `${uid}-block-${index}`;
        return (
          <section
            key={block.property}
            className="bsh-table-block"
            data-collapsed={collapsed}
            aria-labelledby={`${bodyId}-title`}
          >
            <div className="bsh-table-block__header">
              <IconButton
                label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
                className="bsh-table-block__toggle"
                aria-expanded={!collapsed}
                aria-controls={bodyId}
                onClick={() => toggleBlock(block.property)}
              >
                <Icon
                  name="chevron"
                  size={16}
                  className="bsh-table-block__chevron"
                  data-expanded={!collapsed}
                />
              </IconButton>
              <h3 id={`${bodyId}-title`} className="bsh-table-block__title">
                {title}
              </h3>
              {onTitleChange ? (
                editing === block.property ? (
                  <TitleInput
                    property={block.property}
                    title={title}
                    onCommit={(next) => {
                      onTitleChange?.(block.property, next.trim());
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <Button
                    className="bsh-table-block__rename"
                    onClick={() => setEditing(block.property)}
                  >
                    Rename
                  </Button>
                )
              ) : null}
            </div>
            <div
              id={bodyId}
              className="bsh-table-block__body"
              hidden={collapsed}
            >
              <BlockGrid
                entries={block.entries}
                expanded={expandedProps.has(block.property)}
                cells={cells}
                valueColumn={valueColumns.rowHeader}
                specs={columns}
                blank={blank}
                language={language}
                title={title}
                activeKey={activeKey}
                resizable={!decorative}
                sortable={!decorative}
                onExpand={() => expandProps([block.property])}
              />
            </div>
          </section>
        );
      })}
    </div>
  );

  const pivotTable = (
    <>
      {tools(true)}
      <Grid
        columns={pivotColumns}
        lines={pivotLines}
        className="bsh-table bsh-table--summary bsh-table--pivot"
        label={`Pivot by ${groupBy.join(', ')}`}
        resizable={!decorative}
        sortable={false}
      >
        {pivotShown.length < pivotRows.length ? (
          <MoreRow
            span={pivotColumns.length}
            count={pivotRows.length - pivotShown.length}
            onShow={() => setPivotAll(true)}
          />
        ) : null}
      </Grid>
    </>
  );

  const body =
    layout === 'grouped'
      ? groupedTable
      : layout === 'pivot' && tree.length > 0
        ? pivotTable
        : flatTable;

  return (
    <div ref={wrapRef} className="bsh-table-wrap" {...regionProps}>
      {body}
    </div>
  );
}
