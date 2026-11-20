import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PropertyRow } from '../../shared/types.js';
import { Icon } from '../components/icons.js';
import {
  blockTitle,
  countShare,
  formatCount,
  formatMeasure,
  MAX_TITLE_LENGTH,
  type MeasureCell,
  measureByValue,
  type PivotNode,
  pivotTree,
  type SummaryColumn,
  type SummaryEntry,
  type SummaryView,
  summaryBlocks,
} from '../extensions/modelSummary.js';
import { useScrollable } from './useScrollable.js';
import './panels.css';

const COLUMNS: { id: SummaryColumn; header: string; className: string }[] = [
  { id: 'property', header: 'Property', className: 'bsh-col-property' },
  { id: 'value', header: 'Value', className: 'bsh-col-value' },
  { id: 'count', header: 'Count', className: 'bsh-num' },
];

const MISSING_MEASURE: MeasureCell = { status: 'missing' };

export function entryKey(entry: SummaryEntry): string {
  return `${entry.property}\u0000${entry.value}`;
}

function measureText(
  cell: MeasureCell | undefined,
  view: SummaryView | undefined,
): string {
  const resolved = cell ?? MISSING_MEASURE;
  const text = formatMeasure(resolved, {
    precision: view?.precision ?? 0,
    unitLabel: view?.unitLabel ?? '',
  });
  if (resolved.status !== 'ok' || resolved.skipped === 0) return text;
  return `${text} (${resolved.skipped.toLocaleString('en-US')} missing)`;
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
      className="bsh-input bsh-table-block__input"
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

function CountCell({
  count,
  max,
  className = 'bsh-num',
}: {
  count: number;
  max: number;
  className?: string;
}) {
  const share = countShare(count, max);
  return (
    <td className={className} title={formatCount(count)}>
      <span
        className="bsh-count-bar"
        aria-hidden="true"
        style={{ width: `${share}%` }}
      />
      <span className="bsh-clamp bsh-count-value">{formatCount(count)}</span>
    </td>
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
  hiddenColumns = [],
  activeKey,
  onPick,
  propertyNames,
  view,
  rows,
  onTitleChange,
}: {
  entries: SummaryEntry[];
  decorative?: boolean;
  hiddenColumns?: readonly SummaryColumn[];
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

  const layout = view?.layout ?? 'flat';
  const available = useMemo(
    () => new Set(propertyNames ?? entries.map((entry) => entry.property)),
    [propertyNames, entries],
  );
  const measureProperty = view?.measure ?? null;
  const groupBy = propertyNames
    ? (view?.groupBy ?? []).filter((name) => available.has(name))
    : (view?.groupBy ?? []);
  const groupByKey = groupBy.join('\u0000');
  const propertiesKey = [...available].join('\u0000');
  const titles = view?.titles ?? {};

  const measures = useMemo(() => {
    if (!measureProperty || layout === 'pivot') return null;
    const cells = new Map<string, MeasureCell>();
    for (const property of propertiesKey.split('\u0000')) {
      if (!property) continue;
      for (const [value, cell] of measureByValue(
        rows ?? [],
        property,
        measureProperty,
      )) {
        cells.set(`${property}\u0000${value}`, cell);
      }
    }
    return cells;
  }, [rows, propertiesKey, measureProperty, layout]);
  const measureFor = (entry: SummaryEntry) =>
    measures?.get(`${entry.property}\u0000${entry.value}`);
  const blocks = useMemo(() => summaryBlocks(entries), [entries]);
  const tree = useMemo(() => {
    if (layout !== 'pivot' || !rows || !groupByKey) return [];
    return pivotTree(rows, groupByKey.split('\u0000'), {
      measure: measureProperty,
    });
  }, [layout, rows, groupByKey, measureProperty]);
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
  const columns = COLUMNS.filter(({ id }) => !hiddenColumns.includes(id));
  const measureHeader = measureProperty ? (
    <th scope="col" className="bsh-num">
      Measure
    </th>
  ) : null;
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
        <button type="button" className="bsh-button" onClick={expandAll}>
          Expand all
        </button>
        <button type="button" className="bsh-button" onClick={collapseAll}>
          Collapse all
        </button>
      </div>
    ) : null;

  const flatTable = (
    <table className="bsh-table bsh-table--summary">
      <thead>
        <tr>
          {columns.map(({ id, header, className }) => (
            <th key={id} scope="col" className={className}>
              {header}
            </th>
          ))}
          {measureHeader}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const key = entryKey(entry);
          return (
            <tr key={key} data-active={activeKey === key ? 'true' : undefined}>
              {columns.map(({ id, className }) => {
                const text =
                  id === 'count' ? formatCount(entry.count) : entry[id];
                return (
                  <td key={id} className={className} title={String(text)}>
                    {onPick && id === 'value' ? (
                      <button
                        type="button"
                        className="bsh-row-pick"
                        onClick={() => onPick(entry)}
                      >
                        <span className="bsh-clamp">{text}</span>
                      </button>
                    ) : (
                      <span className="bsh-clamp">{text}</span>
                    )}
                  </td>
                );
              })}
              {measureProperty ? (
                <td
                  className="bsh-num"
                  title={measureText(measureFor(entry), view)}
                >
                  <span className="bsh-clamp bsh-measure">
                    {measureText(measureFor(entry), view)}
                  </span>
                </td>
              ) : null}
            </tr>
          );
        })}
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
                className="bsh-icon-button bsh-table-block__toggle"
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
                    className="bsh-button bsh-table-block__rename"
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
                    {!hiddenColumns.includes('value') ? (
                      <th scope="col" className="bsh-col-value">
                        Value
                      </th>
                    ) : null}
                    {!hiddenColumns.includes('count') ? (
                      <th scope="col" className="bsh-num">
                        Count
                      </th>
                    ) : null}
                    {measureHeader}
                  </tr>
                </thead>
                <tbody>
                  {block.entries.map((entry) => {
                    const key = entryKey(entry);
                    return (
                      <tr
                        key={key}
                        data-active={activeKey === key ? 'true' : undefined}
                      >
                        {!hiddenColumns.includes('value') ? (
                          <th
                            scope="row"
                            className="bsh-col-value"
                            title={entry.value}
                          >
                            {onPick ? (
                              <button
                                type="button"
                                className="bsh-row-pick"
                                onClick={() => onPick(entry)}
                              >
                                <span className="bsh-clamp">{entry.value}</span>
                              </button>
                            ) : (
                              <span className="bsh-clamp">{entry.value}</span>
                            )}
                          </th>
                        ) : null}
                        {!hiddenColumns.includes('count') ? (
                          <CountCell count={entry.count} max={max} />
                        ) : null}
                        {measureProperty ? (
                          <td
                            className="bsh-num"
                            title={measureText(measureFor(entry), view)}
                          >
                            <span className="bsh-clamp bsh-measure">
                              {measureText(measureFor(entry), view)}
                            </span>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
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
            <th scope="col" className="bsh-num">
              Count
            </th>
            {measureHeader}
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
                      className="bsh-icon-button bsh-pivot__toggle"
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
                <CountCell count={node.count} max={pivotMax} />
                {measureProperty ? (
                  <td
                    className="bsh-num"
                    title={measureText(node.measure ?? undefined, view)}
                  >
                    <span className="bsh-clamp bsh-measure">
                      {measureText(node.measure ?? undefined, view)}
                    </span>
                  </td>
                ) : null}
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
