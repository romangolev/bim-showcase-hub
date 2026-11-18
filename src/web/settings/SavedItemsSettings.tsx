import { type ChangeEvent, useRef, useState } from 'react';
import { saveBlob } from '../extensions/excelExport.js';
import { usePersisted } from '../storage.js';
import {
  exportSaved,
  importSaved,
  MAX_IMPORT_BYTES,
  MAX_ITEMS,
  MAX_TOTAL_BYTES,
  SAVED,
  type SavedItem,
  savedBytes,
} from '../store/savedStore.js';
import { notify } from '../tasks/notifications.js';

export const SAVED_EXPORT_FILE = 'bsh-saved.json';

interface Notice {
  text: string;
  error: boolean;
}

function counts(items: readonly SavedItem[]): string {
  const byKind = new Map<string, number>();
  for (const item of items) {
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
  }
  if (!byKind.size) return 'Nothing saved yet.';
  return [...byKind].map(([kind, n]) => `${kind}: ${n}`).join(', ');
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function bytesLabel(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1000) return `${Math.round(value / 1000)} KB`;
  return `${value} B`;
}

export function SavedItemsSettings() {
  const input = useRef<HTMLInputElement>(null);
  const [items] = usePersisted(SAVED);
  const [notice, setNotice] = useState<Notice | null>(null);

  const report = (next: Notice) => {
    setNotice(next);
    notify(next.text, { tone: next.error ? 'error' : 'success' });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const target = event.target;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      report({ text: 'File is too large.', error: true });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      report({ text: 'Could not read the file.', error: true });
      return;
    }
    const result = importSaved(text);
    if (result.error) {
      report({ text: result.error, error: true });
      return;
    }
    const skipped = result.rejected
      ? `, skipped ${plural(result.rejected, 'invalid item')}`
      : '';
    const older = result.older
      ? `, kept ${plural(result.older, 'newer stored item')}`
      : '';
    const dropped = result.dropped
      ? `, dropped ${plural(result.dropped, 'item')} over the limit of ${MAX_ITEMS}`
      : '';
    const upgraded = result.migrated
      ? `, upgraded ${plural(result.migrated, 'item')}`
      : '';
    report({
      text: `Imported ${plural(result.accepted, 'item')}${upgraded}${skipped}${older}${dropped}.`,
      error: false,
    });
  };

  return (
    <section className="settings__section" aria-labelledby="settings-saved">
      <h3 id="settings-saved" className="settings__heading">
        Saved items
      </h3>
      <p className="settings__hint">
        Presets and other saved configurations. {counts(items)}{' '}
        {bytesLabel(savedBytes())} of {bytesLabel(MAX_TOTAL_BYTES)} used.
      </p>
      <div className="settings__actions">
        <button
          type="button"
          className="btn"
          onClick={() =>
            saveBlob(
              new Blob([exportSaved()], { type: 'application/json' }),
              SAVED_EXPORT_FILE,
            )
          }
        >
          Export saved items
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => input.current?.click()}
        >
          Import saved items
        </button>
        <input
          ref={input}
          type="file"
          aria-label="Saved items file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={onFile}
        />
      </div>
      <p
        role={notice?.error ? 'alert' : 'status'}
        className="settings__hint"
        data-error={notice?.error ? 'true' : undefined}
      >
        {notice?.text}
      </p>
    </section>
  );
}
