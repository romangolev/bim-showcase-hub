import { useRef } from 'react';
import {
  formatCount,
  type SummaryColumn,
  type SummaryEntry,
} from '../extensions/modelSummary.js';
import { useScrollable } from './useScrollable.js';
import './panels.css';

const COLUMNS: { id: SummaryColumn; header: string; className: string }[] = [
  { id: 'property', header: 'Property', className: 'bsh-col-property' },
  { id: 'value', header: 'Value', className: 'bsh-col-value' },
  { id: 'count', header: 'Count', className: 'bsh-num' },
];

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
  const columns = COLUMNS.filter(({ id }) => !hiddenColumns.includes(id));
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
          <tr>
            {columns.map(({ id, header, className }) => (
              <th key={id} scope="col" className={className}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const key = entryKey(entry);
            return (
              <tr
                key={key}
                data-active={activeKey === key ? 'true' : undefined}
              >
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
