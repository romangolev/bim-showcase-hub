import { StateBlock } from '../components/StateBlock.js';
import { formatCount } from '../i18n/format.js';
import { useSettings } from '../settings/SettingsContext.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  HIDDEN_MESSAGE,
  HIDDEN_TITLE,
  type ScopedRows,
} from './useScopedRows.js';

export function ScopedRowsStatus({
  state,
  resolved,
}: {
  state: ScopedRows;
  resolved: ViewerAdapter | null;
}) {
  const { language } = useSettings().settings;
  return (
    <>
      {state.status === 'hidden' ? (
        <StateBlock
          variant="empty"
          compact
          title={HIDDEN_TITLE}
          message={HIDDEN_MESSAGE}
        />
      ) : null}
      {resolved && state.status === 'loading' ? (
        <div className="bsh-summary__progress">
          <progress
            aria-label="Reading element properties"
            max={state.progress?.total || undefined}
            value={state.progress ? state.progress.loaded : undefined}
          />
          <span role="status">
            {state.progress && state.progress.total > 0
              ? `Reading element properties: ${formatCount(state.progress.loaded, language)} of ${formatCount(state.progress.total, language)}${state.progress.partial ? ' (partial data)' : ''}`
              : 'Reading element properties'}
          </span>
          <button type="button" className="btn" onClick={state.cancel}>
            Cancel
          </button>
        </div>
      ) : null}
      {resolved && state.status === 'ready' && state.pending ? (
        <StateBlock
          variant="loading"
          compact
          message="Reading element properties"
          rows={3}
        />
      ) : null}
      {state.status === 'ready' && state.stale ? (
        <div className="bsh-summary__partial" role="status">
          <span>Data may be stale.</span>
          <button type="button" className="btn" onClick={state.refresh}>
            Refresh
          </button>
        </div>
      ) : null}
      {state.status === 'error' ? (
        <StateBlock
          variant="error"
          compact
          message="We could not read this model's properties. Try again."
          detail={state.message}
          action={{ label: 'Retry', onClick: state.refresh }}
        />
      ) : null}
      {state.status === 'cancelled' ? (
        <div className="bsh-summary__partial" role="status">
          <span>Partial data: the read was cancelled.</span>
          <button type="button" className="btn" onClick={state.refresh}>
            Read again
          </button>
        </div>
      ) : null}
    </>
  );
}
