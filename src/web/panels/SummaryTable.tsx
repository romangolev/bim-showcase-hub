import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PropertyRow } from '../../shared/types.js';
import { Icon } from '../components/icons.js';
import {
  blockTitle,
  COUNT_COLUMN,
  columnCells,
  columnRef,
  columnTitle,
  countShare,
  EMPTY_VALUE_LABEL,
  entryCells,
  formatCell,
  formatCount,
  formatValue,
  MAX_GROUP_BY,
  MAX_TITLE_LENGTH,
  type PivotNode,
  pivotTree,
  type SummaryCell,
  type SummaryColumnSpec,
  type SummaryEntry,
  type SummaryView,
  summaryBlocks,
} from '../extensions/modelSummary.js';
import { useScrollable } from './useScrollable.js';
import './panels.css';

export const ENTRY_CAP = 500;

const DEFAULT_COLUMNS: readonly SummaryColumnSpec[] = [COUNT_COLUMN];
const NO_CELL: SummaryCell = { status: 'none' };
const BLANK_NOTE = 'no values in these elements';

export function entryKey(entry: SummaryEntry): string {
  return `${entry.property}\u0000${entry.value}`;
}

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
    <input
      ref={ref}
      type="text"
      className="field bsh-table-block__input"
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

function CountCell({ count, max }: { count: number; max: number }) {
  const share = countShare(count, max);
  return (
    <td className="bsh-num" title={formatCount(count)}>
      <span
        className="bsh-count-bar"
        aria-hidden="true"
        style={{ width: `${share}%` }}
      />
      <span className="bsh-clamp bsh-count-value">{formatCount(count)}</span>
    </td>
  );
}

function ColumnCell({
  column,
  cell,
  max,
}: {
  column: SummaryColumnSpec;
  cell: SummaryCell;
  max: number | null;
}) {
  if (max !== null && column.property === null && cell.status === 'ok') {
    return <CountCell count={cell.value} max={max} />;
  }
  const text = formatCell(cell, column);
  return (
    <td
      className="bsh-num"
      title={
        cell.status === 'mixed' ? `Mixed units: ${cell.units.join(', ')}` : text
      }
    >
      <span className="bsh-clamp bsh-measure">{text}</span>
    </td>
  );
}

function ColumnHeaders({
  columns,
  blank,
}: {
  columns: readonly SummaryColumnSpec[];
  blank: ReadonlySet<string>;
}) {
  return (
    <>
      {columns.map((column) => {
        const title = columnTitle(column);
        const empty = column.property !== null && blank.has(column.property);
        return (
          <th
            key={column.id}
            scope="col"
            className="bsh-num"
            title={empty ? `${title}: ${BLANK_NOTE}` : title}
          >
            {title}
            {empty ? (
              <>
                <Icon name="alert" size={12} />
                <span className="bsh-sr-only">, {BLANK_NOTE}</span>
              </>
            ) : null}
          </th>
        );
      })}
    </>
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(wrapRef);
  const [collapsedBlocks, setCollapsedBlocks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [collapsedNodes, setCollapsedNodes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
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
  const propertiesKey = [...available].join('\u0000');
  const refsKey = columns.map((column) => column.id).join('\u0000');
  const refs = useMemo(
    () => (refsKey ? refsKey.split('\u0000').map(columnRef) : []),
    [refsKey],
  );
  const titles = view?.titles ?? {};

  const cells = useMemo(() => {
    const map = new Map<string, SummaryCell[]>();
    if (!rows || layout === 'pivot') return map;
    for (const property of propertiesKey.split('\u0000')) {
      if (!property) continue;
      for (const [value, list] of columnCells(rows, property, refs)) {
        map.set(`${property}\u0000${value}`, list);
      }
    }
    return map;
  }, [rows, propertiesKey, refs, layout]);
  const blank = useMemo(() => {
    const names = new Set<string>();
    if (!rows || rows.length === 0) return names;
    for (const { property } of refs) {
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
  }, [rows, refs]);
  const cellsFor = (entry: SummaryEntry) =>
    entryCells(entry, refs, cells.get(entryKey(entry)));
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
  const hiddenTotal = [...flat.hidden.values()].reduce((a, b) => a + b, 0);
  const expandProps = (properties: Iterable<string>) =>
    setExpandedProps((previous) => new Set([...previous, ...properties]));
  const tree = useMemo(() => {
    if (layout !== 'pivot' || !rows || !groupByKey) return [];
    return pivotTree(rows, groupByKey.split('\u0000'), { columns: refs });
  }, [layout, rows, groupByKey, refs]);
  const pivotRows = useMemo(
    () => flattenPivot(tree, collapsedNodes, '', 0, []),
    [tree, collapsedNodes],
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
  const valueLabel = (entry: SummaryEntry) =>
    onPick ? (
      <button
        type="button"
        className="bsh-row-pick"
        onClick={() => onPick(entry)}
      >
        <span className="bsh-clamp">{entry.value}</span>
      </button>
    ) : (
      <span className="bsh-clamp">{entry.value}</span>
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
        <button type="button" className="btn" onClick={expandAll}>
          Expand all
        </button>
        <button type="button" className="btn" onClick={collapseAll}>
          Collapse all
        </button>
      </div>
    ) : null;

  const flatTable = (
    <table className="bsh-table bsh-table--summary">
      <thead>
        <tr>
          {showProperty ? (
            <th scope="col" className="bsh-col-property">
              Property
            </th>
          ) : null}
          <th scope="col" className="bsh-col-value">
            Value
          </th>
          <ColumnHeaders columns={columns} blank={blank} />
        </tr>
      </thead>
      <tbody>
        {flat.shown.map((entry) => {
          const key = entryKey(entry);
          const list = cellsFor(entry);
          return (
            <tr key={key} data-active={activeKey === key ? 'true' : undefined}>
              {showProperty ? (
                <td className="bsh-col-property" title={entry.property}>
                  <span className="bsh-clamp">{entry.property}</span>
                </td>
              ) : null}
              <td className="bsh-col-value" title={entry.value}>
                {valueLabel(entry)}
              </td>
              {columns.map((column, index) => (
                <ColumnCell
                  key={column.id}
                  column={column}
                  cell={list[index] ?? NO_CELL}
                  max={null}
                />
              ))}
            </tr>
          );
        })}
        {hiddenTotal > 0 ? (
          <tr>
            <td colSpan={(showProperty ? 2 : 1) + columns.length}>
              <button
                type="button"
                className="btn"
                onClick={() => expandProps(flat.hidden.keys())}
              >
                Show {formatCount(hiddenTotal)} more
              </button>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );

  const groupedTable = (
    <div className="bsh-summary-blocks">
      {tools(true)}
      {blocks.map((block, index) => {
        const title = blockTitle(titles, block.property);
        const collapsed = collapsedBlocks.has(block.property);
        const max = block.entries.reduce(
          (largest, entry) => Math.max(largest, entry.count),
          0,
        );
        const bodyId = `${uid}-block-${index}`;
        return (
          <section
            key={block.property}
            className="bsh-table-block"
            data-collapsed={collapsed}
            aria-labelledby={`${bodyId}-title`}
          >
            <div className="bsh-table-block__header">
              <button
                type="button"
                className="icon-button bsh-table-block__toggle"
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
                <span className="bsh-sr-only">
                  {collapsed ? `Expand ${title}` : `Collapse ${title}`}
                </span>
              </button>
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
                  <button
                    type="button"
                    className="btn bsh-table-block__rename"
                    onClick={() => setEditing(block.property)}
                  >
                    Rename
                  </button>
                )
              ) : null}
            </div>
            <div
              id={bodyId}
              className="bsh-table-block__body"
              hidden={collapsed}
            >
              <table
                className="bsh-table bsh-table--summary"
                aria-label={title}
              >
                <thead>
                  <tr>
                    <th scope="col" className="bsh-col-value">
                      Value
                    </th>
                    <ColumnHeaders columns={columns} blank={blank} />
                  </tr>
                </thead>
                <tbody>
                  {(expandedProps.has(block.property)
                    ? block.entries
                    : block.entries.slice(0, ENTRY_CAP)
                  ).map((entry) => {
                    const key = entryKey(entry);
                    const list = cellsFor(entry);
                    return (
                      <tr
                        key={key}
                        data-active={activeKey === key ? 'true' : undefined}
                      >
                        <th
                          scope="row"
                          className="bsh-col-value"
                          title={entry.value}
                        >
                          {valueLabel(entry)}
                        </th>
                        {columns.map((column, columnIndex) => (
                          <ColumnCell
                            key={column.id}
                            column={column}
                            cell={list[columnIndex] ?? NO_CELL}
                            max={max}
                          />
                        ))}
                      </tr>
                    );
                  })}
                  {!expandedProps.has(block.property) &&
                  block.entries.length > ENTRY_CAP ? (
                    <tr>
                      <td colSpan={1 + columns.length}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => expandProps([block.property])}
                        >
                          Show {formatCount(block.entries.length - ENTRY_CAP)}{' '}
                          more
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );

  const pivotTable = (
    <>
      {tools(true)}
      <table
        className="bsh-table bsh-table--summary bsh-table--pivot"
        aria-label={`Pivot by ${groupBy.join(', ')}`}
      >
        <thead>
          <tr>
            <th scope="col" className="bsh-col-value">
              Value
            </th>
            <ColumnHeaders columns={columns} blank={blank} />
          </tr>
        </thead>
        <tbody>
          {pivotRows.map(({ node, depth, key }) => {
            const collapsed = collapsedNodes.has(key);
            const hasChildren = node.children.length > 0;
            return (
              <tr key={key}>
                <th
                  scope="row"
                  className="bsh-col-value bsh-pivot__value"
                  style={{ paddingInlineStart: `${0.5 + depth * 0.9}rem` }}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      className="icon-button bsh-pivot__toggle"
                      aria-expanded={!collapsed}
                      onClick={() => toggleNode(key)}
                    >
                      <Icon
                        name="chevron"
                        size={14}
                        className="bsh-pivot__chevron"
                        data-expanded={!collapsed}
                      />
                      <span className="bsh-sr-only">
                        {collapsed
                          ? `Expand ${node.value}`
                          : `Collapse ${node.value}`}
                      </span>
                    </button>
                  ) : (
                    <span className="bsh-pivot__spacer" aria-hidden="true" />
                  )}
                  <span className="bsh-clamp">{node.value}</span>
                </th>
                {columns.map((column, index) => (
                  <ColumnCell
                    key={column.id}
                    column={column}
                    cell={node.cells[index] ?? NO_CELL}
                    max={pivotMax}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
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
