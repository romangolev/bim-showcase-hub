import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useRef } from 'react';
import {
  formatCount,
  type SummaryColumn,
  type SummaryEntry,
} from '../extensions/modelSummary.js';
import { useScrollable } from './useScrollable.js';
import './panels.css';

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, SummaryEntry>();
const columns = helper.columns([
  helper.accessor('property', { header: 'Property' }),
  helper.accessor('value', { header: 'Value' }),
  helper.accessor('count', {
    header: 'Count',
    cell: (info) => formatCount(info.getValue()),
  }),
]);

const COLUMN_CLASS: Record<string, string> = {
  property: 'bsh-col-property',
  value: 'bsh-col-value',
  count: 'bsh-num',
};

export function entryKey(entry: SummaryEntry): string {
  return `${entry.property}\u0000${entry.value}`;
}

export function SummaryTable({
  entries,
  decorative = false,
  hiddenColumns = [],
  activeKey,
  onPick,
}: {
  entries: SummaryEntry[];
  decorative?: boolean;
  hiddenColumns?: readonly SummaryColumn[];
  activeKey?: string | null;
  onPick?: (entry: SummaryEntry) => void;
}) {
  const table = useTable({ features, columns, data: entries });
  const visible = (id: string) => !hiddenColumns.includes(id as SummaryColumn);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(wrapRef);

  return (
    <div
      ref={wrapRef}
      className="bsh-table-wrap"
      {...(scrollable && !decorative
        ? {
            role: 'region',
            tabIndex: 0,
            'aria-label': 'Summary table, scrollable',
          }
        : {})}
    >
      <table className="bsh-table bsh-table--summary">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers
                .filter((header) => visible(header.column.id))
                .map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={COLUMN_CLASS[header.column.id]}
                  >
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              data-active={
                activeKey === entryKey(row.original) ? 'true' : undefined
              }
            >
              {row
                .getAllCells()
                .filter((cell) => visible(cell.column.id))
                .map((cell) => (
                  <td
                    key={cell.id}
                    className={COLUMN_CLASS[cell.column.id]}
                    title={
                      cell.column.id === 'count'
                        ? formatCount(Number(cell.getValue()))
                        : String(cell.getValue() ?? '')
                    }
                  >
                    {onPick && cell.column.id === 'value' ? (
                      <button
                        type="button"
                        className="bsh-row-pick"
                        onClick={() => onPick(row.original)}
                      >
                        <span className="bsh-clamp">
                          <table.FlexRender cell={cell} />
                        </span>
                      </button>
                    ) : (
                      <span className="bsh-clamp">
                        <table.FlexRender cell={cell} />
                      </span>
                    )}
                  </td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
