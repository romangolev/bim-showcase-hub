import { StateBlock } from '../components/StateBlock.js';
import { formatCount } from '../i18n/format.js';
import { useSettings } from '../settings/SettingsContext.js';
import { Button } from '../ui/Button.js';
import { Progress } from '../ui/Progress.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { FailedModels, UnavailableModels } from './ModelScope.js';
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
          <Progress
            label="Reading element properties"
            max={state.progress?.total || 100}
            value={state.progress?.total ? state.progress.loaded : null}
          />
          <span role="status">
            {state.progress && state.progress.total > 0
              ? `Reading element properties: ${formatCount(state.progress.loaded, language)} of ${formatCount(state.progress.total, language)}${state.progress.partial ? ' (partial data)' : ''}`
              : 'Reading element properties'}
          </span>
          {state.partialRows.length > 0 && state.progress ? (
            <span role="status">
              {`Partial: ${formatCount(state.partialRows.length, language)} of ${formatCount(state.progress.total, language)} elements`}
            </span>
          ) : null}
          <Button onClick={state.cancel}>Cancel</Button>
        </div>
      ) : null}
      {state.status === 'ready' || state.status === 'cancelled' ? (
        <>
          <UnavailableModels models={state.models.unavailable} />
          <FailedModels
            names={state.failed}
            unavailable={state.models.unavailable}
          />
        </>
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
          <Button onClick={state.refresh}>Refresh</Button>
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
          <span>
            {state.total > 0
              ? 'Partial data: the read was cancelled, so these counts may be out of date.'
              : 'The read was cancelled, so there is nothing to summarize yet.'}
          </span>
          <Button onClick={state.refresh}>Read again</Button>
        </div>
      ) : null}
    </>
  );
}
