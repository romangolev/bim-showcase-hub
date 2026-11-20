import { useEffect, useRef, useState } from 'react';
import {
  clearLocalData,
  formatStorageBytes,
  storageReport,
} from './storageAudit.js';

function readoutLines(report: ReturnType<typeof storageReport>) {
  return report.families.filter((family) => family.keys > 0);
}

export function LocalDataSettings() {
  const [report, setReport] = useState(storageReport);
  const [confirming, setConfirming] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [notice, setNotice] = useState('');
  const confirmRef = useRef<HTMLFieldSetElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const families = readoutLines(report);
  const canClear =
    report.personal.keys > 0 || (preferences && report.preference.keys > 0);

  useEffect(() => {
    if (confirming) {
      wasConfirming.current = true;
      confirmRef.current?.focus();
      return;
    }
    if (wasConfirming.current) {
      wasConfirming.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  const clear = () => {
    const result = clearLocalData({ preferences });
    setReport(storageReport());
    setConfirming(false);
    setNotice(
      `Cleared ${result.keys} ${result.keys === 1 ? 'key' : 'keys'} (${formatStorageBytes(result.bytes)}). ${
        preferences
          ? 'Preferences are back to their defaults.'
          : 'Preferences were kept.'
      }`,
    );
  };

  return (
    <section
      className="settings__section"
      aria-labelledby="settings-local-data"
    >
      <h3 id="settings-local-data" className="settings__heading">
        Local data
      </h3>
      <p className="settings__hint">
        This browser uses about {formatStorageBytes(report.total.bytes)} across{' '}
        {report.total.keys} {report.total.keys === 1 ? 'key' : 'keys'}.{' '}
        {formatStorageBytes(report.personal.bytes)} is personal data and{' '}
        {formatStorageBytes(report.preference.bytes)} is preferences.
      </p>
      {families.length > 0 ? (
        <ul className="settings__readout" aria-label="Storage use by data type">
          {families.map((family) => (
            <li key={family.id} className="settings__readout-row">
              <span className="settings__readout-name">
                {family.label}
                {family.kind === 'other' ? ' (not cleared)' : ''}
              </span>
              <span>
                {family.keys} {family.keys === 1 ? 'key' : 'keys'} ·{' '}
                {formatStorageBytes(family.bytes)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings__hint">Nothing is stored in this browser yet.</p>
      )}
      {confirming ? (
        <fieldset
          ref={confirmRef}
          tabIndex={-1}
          className="settings__confirm"
          aria-label="Confirm clearing local data"
        >
          <p className="settings__total">
            Clear {report.personal.keys} personal{' '}
            {report.personal.keys === 1 ? 'key' : 'keys'} (
            {formatStorageBytes(report.personal.bytes)}) from this browser?
            Saved items, workspaces, pane setup and the stored open-model list
            are removed. Open tabs stay open until a reload. You stay signed in.
          </p>
          <label className="settings__check">
            <input
              type="checkbox"
              checked={preferences}
              disabled={report.preference.keys === 0}
              onChange={(event) => setPreferences(event.target.checked)}
            />
            Also reset preferences ({report.preference.keys}{' '}
            {report.preference.keys === 1 ? 'key' : 'keys'},{' '}
            {formatStorageBytes(report.preference.bytes)})
          </label>
          <div className="settings__actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canClear}
              onClick={clear}
            >
              Clear all local data
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </fieldset>
      ) : (
        <div className="settings__actions">
          <button
            ref={triggerRef}
            type="button"
            className="btn"
            disabled={report.total.keys === 0}
            onClick={() => setConfirming(true)}
          >
            Clear all local data…
          </button>
        </div>
      )}
      <p role="status" className="settings__hint">
        {notice}
      </p>
    </section>
  );
}
