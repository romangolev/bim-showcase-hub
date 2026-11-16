import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useRef } from 'react';
import type { SummaryEntry } from '../extensions/modelSummary.js';
import { useScrollable } from './useScrollable.js';
import './panels.css';

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, SummaryEntry>();
const columns = helper.columns([
  helper.accessor('property', { header: 'Property' }),
  helper.accessor('value', { header: 'Value' }),
  helper.accessor('count', { header: 'Count' }),
]);

const COLUMN_CLASS: Record<string, string> = {
  property: 'bsh-col-property',
  value: 'bsh-col-value',
  count: 'bsh-num',
};

export function SummaryTable({
  entries,
  decorative = false,
}: {
  entries: SummaryEntry[];
  decorative?: boolean;
}) {
  const table = useTable({ features, columns, data: entries });
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
              {group.headers.map((header) => (
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
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td
                  key={cell.id}
                  className={COLUMN_CLASS[cell.column.id]}
                  title={String(cell.getValue() ?? '')}
                >
                  <span className="bsh-clamp">
                    <table.FlexRender cell={cell} />
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
