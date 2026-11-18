import { type ChangeEvent, useRef, useState } from 'react';
import { saveBlob } from '../extensions/excelExport.js';
import {
  exportSaved,
  importSaved,
  MAX_IMPORT_BYTES,
  readSaved,
} from '../store/savedStore.js';

export const SAVED_EXPORT_FILE = 'bsh-saved.json';

interface Notice {
  text: string;
  error: boolean;
}

function counts(): string {
  const byKind = new Map<string, number>();
  for (const item of readSaved()) {
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
  }
  if (!byKind.size) return 'Nothing saved yet.';
  return [...byKind].map(([kind, n]) => `${kind}: ${n}`).join(', ');
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function SavedItemsSettings() {
  const input = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState(counts);
  const [notice, setNotice] = useState<Notice | null>(null);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const target = event.target;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setNotice({ text: 'File is too large.', error: true });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setNotice({ text: 'Could not read the file.', error: true });
      return;
    }
    const result = importSaved(text);
    setSummary(counts());
    if (result.error) {
      setNotice({ text: result.error, error: true });
      return;
    }
    const skipped = result.rejected
      ? `, skipped ${plural(result.rejected, 'invalid item')}`
      : '';
    setNotice({
      text: `Imported ${plural(result.accepted, 'item')}${skipped}.`,
      error: false,
    });
  };

  return (
    <section className="settings__section" aria-labelledby="settings-saved">
      <h3 id="settings-saved" className="settings__heading">
        Saved items
      </h3>
      <p className="settings__hint">
        Presets and other saved configurations. {summary}
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
