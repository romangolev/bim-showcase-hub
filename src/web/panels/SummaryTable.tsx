import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import type { SummaryEntry } from '../extensions/modelSummary.js';
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

export function SummaryTable({ entries }: { entries: SummaryEntry[] }) {
  const table = useTable({ features, columns, data: entries });

  return (
    <div className="bsh-table-wrap">
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
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
