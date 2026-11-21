import { StateBlock } from '../components/StateBlock.js';
import { saveBlob } from '../extensions/download.js';
import { formatDateTime } from '../i18n/format.js';
import { useSettings } from '../settings/SettingsContext.js';
import { activityFile } from './activityExport.js';
import {
  type Notification,
  type NotificationStore,
  notifications,
} from './notifications.js';
import { useNotifications } from './useNotifications.js';

const TONE_LABEL: Record<Notification['tone'], string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

export function ActivityPane({
  store = notifications,
}: {
  store?: NotificationStore;
}) {
  const { log } = useNotifications(store);
  const { language } = useSettings().settings;
  const empty = log.length === 0;
  return (
    <div
      className="pane-activity"
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        flexDirection: 'column',
      }}
    >
      <div
        className="pane-activity__toolbar"
        style={{
          display: 'flex',
          flex: '0 0 auto',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          borderBottom: 'var(--border-hairline)',
        }}
      >
        <button
          type="button"
          className="btn btn-small"
          disabled={empty}
          onClick={() => {
            const file = activityFile(log);
            saveBlob(
              new Blob([file.text], { type: 'application/json' }),
              file.name,
            );
          }}
        >
          Download log
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={empty}
          onClick={() => store.clearLog()}
        >
          Clear log
        </button>
      </div>
      {empty ? (
        <StateBlock
          variant="empty"
          title="No activity yet"
          message="Outcomes, exports and errors appear here."
          icon="alert"
          compact
        />
      ) : (
        <ol
          className="activity-log"
          style={{
            display: 'flex',
            flex: '1 1 auto',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            margin: 0,
            padding: 'var(--space-2) var(--space-3)',
            listStyle: 'none',
            overflowY: 'auto',
          }}
        >
          {log.map((entry) => (
            <li
              key={entry.id}
              className="activity-log__row"
              data-tone={entry.tone}
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'baseline',
                fontSize: 'var(--text-13)',
              }}
            >
              <time
                dateTime={new Date(entry.createdAt).toISOString()}
                style={{
                  flex: '0 0 auto',
                  color: 'var(--color-fog)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatDateTime(entry.createdAt, language)}
              </time>
              <span
                className="activity-log__tone"
                style={{ flex: '0 0 auto', color: 'var(--color-fog)' }}
              >
                {TONE_LABEL[entry.tone]}
              </span>
              <span className="activity-log__message" style={{ minWidth: 0 }}>
                {entry.message}
              </span>
              {entry.detail ? (
                <span
                  className="activity-log__detail"
                  style={{ color: 'var(--color-fog)' }}
                >
                  {entry.detail}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
