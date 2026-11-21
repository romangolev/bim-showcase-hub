import { type ChangeEvent, useId, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import { saveBlob } from '../extensions/download.js';
import {
  applySummaryPreset,
  BUILT_IN_SUMMARY_PRESETS,
  missingPresetProperties,
  SUMMARY_PRESET_KIND,
  SUMMARY_PRESETS,
  type SummaryPresetData,
  type SummaryStarter,
  saveSummaryPreset,
} from '../extensions/summaryPresets.js';
import { useSavedKindItems } from '../store/savedKinds.js';
import {
  exportSaved,
  importSaved,
  MAX_IMPORT_BYTES,
  MAX_NAME_LENGTH,
} from '../store/savedStore.js';
import { notify } from '../tasks/notifications.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';
import './panels.css';

export const SUMMARY_PRESET_EXPORT_FILE = 'bsh-summary-presets.json';

interface SummaryPresetsProps {
  adapter: ViewerAdapter | null;
  properties: readonly string[];
  view: unknown;
}

interface PresetBodyProps {
  adapter: ViewerAdapter | null;
  properties: readonly string[];
  view: unknown;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function PresetGaps({ missing }: { missing: readonly string[] }) {
  if (missing.length === 0) return null;
  return (
    <span className="bsh-summary-presets__missing">
      <Icon name="alert" size={12} />
      <span>Not in this model: {missing.join(', ')}</span>
    </span>
  );
}

function PresetBody({ adapter, properties, view }: PresetBodyProps) {
  const items = useSavedKindItems(SUMMARY_PRESETS);
  const catalog = usePropertyCatalog(adapter);
  const [name, setName] = useState('');
  const [applied, setApplied] = useState<{
    name: string;
    missing: string[];
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const known =
    catalog.status === 'ready' ? catalog.catalog.map((info) => info.name) : [];
  const gapsOf = (names: readonly string[]) =>
    known.length > 0 ? missingPresetProperties(names, known) : [];

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!saveSummaryPreset(trimmed, properties, view)) {
      notify(
        'Could not save the preset. Delete some saved items and try again.',
        { tone: 'error' },
      );
      return;
    }
    setName('');
    notify(`Saved the summary preset "${trimmed}"`, { tone: 'success' });
  };

  const apply = (label: string, data: SummaryPresetData) => {
    if (!applySummaryPreset(data)) {
      notify(`Could not apply the summary preset "${label}".`, {
        tone: 'error',
      });
      return;
    }
    const missing = gapsOf(data.properties);
    setApplied({ name: label, missing });
    notify(
      missing.length > 0
        ? `Applied the summary preset "${label}". Not in this model: ${missing.join(', ')}.`
        : `Applied the summary preset "${label}"`,
      { tone: 'success' },
    );
  };

  const copy = (starter: SummaryStarter) => {
    const saved = saveSummaryPreset(
      starter.name,
      starter.data.properties,
      starter.data.view,
    );
    notify(
      saved
        ? `Saved "${starter.name}" to your presets`
        : 'Could not save the preset. Delete some saved items and try again.',
      { tone: saved ? 'success' : 'error' },
    );
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const target = event.target;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      notify('File is too large.', { tone: 'error' });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      notify('Could not read the file.', { tone: 'error' });
      return;
    }
    const result = importSaved(text);
    notify(result.error ?? `Imported ${plural(result.accepted, 'item')}.`, {
      tone: result.error ? 'error' : 'success',
    });
  };

  return (
    <div className="bsh-summary-presets__body">
      <div className="bsh-presets">
        <input
          type="text"
          className="field"
          aria-label="Summary preset name"
          placeholder="Name this summary"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={!name.trim()}
          onClick={save}
        >
          Save current summary
        </button>
      </div>
      {applied ? (
        <p className="bsh-summary-presets__note">
          {`Applied "${applied.name}".`}
          {applied.missing.length > 0
            ? ` ${applied.missing.length} ${applied.missing.length === 1 ? 'property is' : 'properties are'} not in this model: ${applied.missing.join(', ')}.`
            : ''}
        </p>
      ) : null}
      <ul
        className="bsh-summary-presets__list"
        aria-label="Starter summary presets"
      >
        {BUILT_IN_SUMMARY_PRESETS.map((starter) => (
          <li
            key={starter.id}
            className="bsh-summary-presets__row"
            data-kind="starter"
          >
            <span className="bsh-summary-presets__name">{starter.name}</span>
            <span
              className="bsh-summary-presets__properties"
              title={starter.data.properties.join(', ')}
            >
              {starter.data.properties.join(', ')}
            </span>
            <PresetGaps missing={gapsOf(starter.data.properties)} />
            <button
              type="button"
              className="btn"
              aria-label={`Apply ${starter.name}`}
              onClick={() => apply(starter.name, starter.data)}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn"
              aria-label={`Copy ${starter.name} to my presets`}
              onClick={() => copy(starter)}
            >
              Copy
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 ? (
        <p className="bsh-summary-presets__hint">No saved presets yet.</p>
      ) : (
        <ul
          className="bsh-summary-presets__list"
          aria-label="Saved summary presets"
        >
          {items.map((item) => (
            <li
              key={`${item.id}:${item.name}`}
              className="bsh-summary-presets__row"
            >
              <input
                type="text"
                className="field bsh-summary-presets__rename"
                aria-label={`Rename ${item.name}`}
                maxLength={MAX_NAME_LENGTH}
                defaultValue={item.name}
                onBlur={(event) => {
                  const ok = SUMMARY_PRESETS.rename(
                    item.id,
                    event.target.value,
                  );
                  if (!ok) {
                    event.target.value = item.name;
                    notify('Could not rename the preset.', { tone: 'error' });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <span
                className="bsh-summary-presets__properties"
                title={item.data.properties.join(', ')}
              >
                {item.data.properties.join(', ')}
              </span>
              <PresetGaps missing={gapsOf(item.data.properties)} />
              <button
                type="button"
                className="btn"
                aria-label={`Apply ${item.name}`}
                onClick={() => apply(item.name, item.data)}
              >
                Apply
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`Delete ${item.name}`}
                onClick={() => {
                  if (!SUMMARY_PRESETS.remove(item.id)) {
                    notify('Could not delete the preset.', { tone: 'error' });
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="bsh-presets">
        <button
          type="button"
          className="btn"
          onClick={() =>
            saveBlob(
              new Blob([exportSaved(SUMMARY_PRESET_KIND)], {
                type: 'application/json',
              }),
              SUMMARY_PRESET_EXPORT_FILE,
            )
          }
        >
          Export presets
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => fileInput.current?.click()}
        >
          Import presets
        </button>
        <input
          ref={fileInput}
          type="file"
          aria-label="Summary presets file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={onFile}
        />
      </div>
    </div>
  );
}

export function SummaryPresets({
  adapter,
  properties,
  view,
}: SummaryPresetsProps) {
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  return (
    <section className="bsh-summary-presets">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        Presets
      </button>
      {open ? (
        <div id={bodyId}>
          <PresetBody adapter={adapter} properties={properties} view={view} />
        </div>
      ) : null}
    </section>
  );
}
