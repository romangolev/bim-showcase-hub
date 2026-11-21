import { useCallback, useEffect, useState } from 'react';
import { StateBlock } from '../components/StateBlock.js';
import { writeClipboard } from '../extensions/clipboard.js';
import { notify } from '../tasks/notifications.js';
import { measurementsCsv } from '../viewer/measurements.js';
import type {
  MeasureMode,
  MeasurementInfo,
  ViewerAdapter,
} from '../viewer/ViewerAdapter.js';
import { useResolvedAdapter } from './useScopedRows.js';
import './panels.css';

export interface MeasurementsPanelProps {
  adapter?: ViewerAdapter | null;
}

const NOT_AVAILABLE = 'The Measure tool is not available in this viewer.';

const MODES: readonly { mode: MeasureMode; label: string }[] = [
  { mode: 'distance', label: 'Distance' },
  { mode: 'angle', label: 'Angle' },
  { mode: 'area', label: 'Area' },
];

export function MeasurementsPanel({
  adapter: override,
}: MeasurementsPanelProps) {
  const adapter = useResolvedAdapter(override);
  const [list, setList] = useState<MeasurementInfo[]>([]);
  const [notice, setNotice] = useState('');

  const read = useCallback(() => {
    setList(adapter ? adapter.listMeasurements() : []);
  }, [adapter]);

  useEffect(() => {
    read();
    if (!adapter) return;
    return adapter.onMeasurementsChange(read);
  }, [adapter, read]);

  const measure = async (mode: MeasureMode) => {
    if (!adapter) return;
    let started = false;
    try {
      started = await adapter.startMeasure(mode);
    } catch {
      started = false;
    }
    setNotice(started ? '' : NOT_AVAILABLE);
    read();
  };

  const copy = async () => {
    if (await writeClipboard(measurementsCsv(list))) {
      notify('Measurements copied');
    } else {
      setNotice('Could not copy to the clipboard');
    }
  };

  const clear = () => {
    if (!adapter) return;
    adapter.clearMeasurements();
    read();
  };

  return (
    <section className="bsh-card bsh-measures" aria-label="Measurements">
      <header className="bsh-card__header">
        <h2 className="bsh-card__title">Measurements</h2>
      </header>
      {adapter ? (
        <>
          <div className="bsh-measures__tools">
            {MODES.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                className="bsh-button"
                onClick={() => void measure(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <StateBlock
              variant="empty"
              title="No measurements yet"
              message="Pick Distance, Angle or Area, then measure in the viewer."
              compact
            />
          ) : (
            <ul className="bsh-measures__list">
              {list.map((entry) => (
                <li key={entry.id} className="bsh-measures__row">
                  <span className="bsh-measures__type">{entry.type}</span>
                  <span className="bsh-measures__value">{entry.value}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="bsh-measures__tools">
            <button
              type="button"
              className="bsh-button"
              onClick={() => void copy()}
            >
              Copy CSV
            </button>
            <button type="button" className="bsh-button" onClick={clear}>
              Clear
            </button>
            <button type="button" className="bsh-button" onClick={read}>
              Refresh
            </button>
          </div>
          {notice ? (
            <p className="bsh-measures__notice" role="status">
              {notice}
            </p>
          ) : null}
        </>
      ) : (
        <StateBlock
          variant="empty"
          title="No model loaded"
          message="Open a model to measure it in the viewer."
          compact
        />
      )}
      <p className="bsh-muted">
        Measurements are not saved with the tab, a viewpoint or a share link.
        Units and precision follow the Measure tool's own settings.
      </p>
    </section>
  );
}
