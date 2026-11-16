import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_EXPORT_PROPERTIES,
  DEFAULT_FILE_NAME,
  describeStatus,
  type ExportStatus,
  exportToXlsx,
} from '../extensions/excelExport.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { useResolvedAdapter } from './usePropertyRows.js';
import './panels.css';

export interface ExportButtonProps {
  adapter?: ViewerAdapter | null;
  propertyNames?: readonly string[];
  groupBy?: string | null;
  fileName?: string;
  label?: string;
  onStatus?: (status: ExportStatus) => void;
  className?: string;
}

const TOAST_MS = 4000;

function badgeVariant(status: ExportStatus): string {
  if (status.phase === 'error') return 'badge--error';
  if (status.phase === 'done') return '';
  return 'badge--busy';
}

export function ExportButton({
  adapter,
  propertyNames = DEFAULT_EXPORT_PROPERTIES,
  groupBy,
  fileName = DEFAULT_FILE_NAME,
  label = 'Export to Excel',
  onStatus,
  className,
}: ExportButtonProps) {
  const resolved = useResolvedAdapter(adapter);
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = status?.phase === 'reading' || status?.phase === 'building';

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handle = useCallback(
    (next: ExportStatus) => {
      if (timer.current) clearTimeout(timer.current);
      setStatus(next);
      onStatus?.(next);
      if (next.phase !== 'reading' && next.phase !== 'building') {
        timer.current = setTimeout(() => setStatus(null), TOAST_MS);
      }
    },
    [onStatus],
  );

  const run = () => {
    if (!resolved || busy) return;
    void exportToXlsx(resolved, {
      propertyNames,
      groupBy,
      fileName,
      onStatus: handle,
    });
  };

  return (
    <div className={`bsh-export ${className ?? ''}`.trim()}>
      <button
        type="button"
        className="bsh-button"
        disabled={!resolved || busy}
        aria-busy={busy}
        onClick={run}
      >
        {label}
      </button>
      <div className="bsh-export__status" role="status" aria-live="polite">
        {status ? (
          <span className={`badge ${badgeVariant(status)}`.trim()}>
            <span className="badge__dot" aria-hidden="true" />
            {describeStatus(status)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
