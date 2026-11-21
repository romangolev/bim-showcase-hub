import {
  describeStatus,
  exportPreview,
  PREVIEW_ROWS,
} from '../extensions/excelExport.js';
import { usePersisted } from '../storage.js';
import { ExcelFields } from '../tools/excel/ExcelFields.js';
import {
  excelFileNameFrom,
  startExcelExport,
} from '../tools/excel/excelJob.js';
import { EXCEL_SETTINGS } from '../tools/excel/excelSettings.js';
import { useExcelStatus } from '../tools/excel/excelStatus.js';
import { useModelColoring } from '../viewer/modelColoring.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ScopedRowsStatus } from './ScopedRowsStatus.js';
import { useResolvedAdapter, useScopedRows } from './useScopedRows.js';
import './panels.css';

export interface ExportPanelProps {
  adapter?: ViewerAdapter | null;
  fileName: string;
}

export function ExportPanel({ adapter, fileName }: ExportPanelProps) {
  const resolved = useResolvedAdapter(adapter);
  const [excel, setExcel] = usePersisted(EXCEL_SETTINGS);
  const state = useScopedRows(resolved, {
    names: excel.properties,
    elements: excel.scope,
    models: {
      value: excel.modelScope,
      onChange: (modelScope) =>
        setExcel((current) => ({ ...current, modelScope })),
    },
  });
  const status = useExcelStatus(resolved);
  const coloring = useModelColoring(resolved);
  const emptyText = excel.emptyLabel === 'blank' ? '' : '(empty)';
  const preview =
    state.status === 'ready'
      ? exportPreview(
          state.rows,
          excel.properties,
          emptyText,
          excel.colorColumn ? coloring : null,
          excel.columnFormats,
        )
      : null;
  return (
    <section className="bsh-card bsh-drawer" aria-labelledby="export-panel">
      <header className="bsh-card__header bsh-drawer__header">
        <h2 id="export-panel" className="bsh-card__title">
          Export
        </h2>
      </header>
      <div className="bsh-drawer__body">
        <div className="settings">
          <ExcelFields />
        </div>
        <p className="settings__hint">
          File: {excelFileNameFrom(fileName, excel)}
        </p>
        <div className="bsh-presets">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (resolved) startExcelExport(resolved, fileName);
            }}
            disabled={!resolved}
          >
            Export
          </button>
        </div>
        {status ? (
          <p className="settings__hint">{describeStatus(status)}</p>
        ) : null}
        <ScopedRowsStatus state={state} resolved={resolved} />
        {preview ? (
          <>
            <p className="settings__hint">
              Rows: {state.total} · first {PREVIEW_ROWS}
            </p>
            <div className="bsh-table-wrap">
              <table
                className="bsh-table"
                aria-label="Export preview"
                aria-rowcount={preview.rows.length + 1}
              >
                <thead>
                  <tr>
                    {preview.header.map((name) => (
                      <th key={name} scope="col">
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, column) => (
                        <td key={column}>{String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
