import { type ChangeEvent, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { saveBlob } from '../extensions/download.js';
import type { SummaryView } from '../extensions/modelSummary.js';
import {
  BUILT_IN_SUMMARY_PRESETS,
  type JsonValue,
  missingPresetProperties,
  presetToSpec,
  SUMMARY_PRESET_KIND,
  SUMMARY_PRESETS,
  type SummarySpecPart,
  saveSummaryPreset,
  specPropertyNames,
  summaryPresetKey,
} from '../extensions/summaryPresets.js';
import { useSavedKindItems } from '../store/savedKinds.js';
import {
  exportSaved,
  importSaved,
  MAX_IMPORT_BYTES,
} from '../store/savedStore.js';
import { notify } from '../tasks/notifications.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { promptPresetName } from './PresetNamePrompt.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';

export const SUMMARY_PRESET_EXPORT_FILE = 'bsh-summary-presets.json';

const SAVE_FAILED =
  'Could not save the preset. Delete some saved items and try again.';

const NO_GAPS = (): string[] => [];

interface SummaryPresetMenuProps {
  properties: readonly string[];
  view: SummaryView;
  apply: (spec: SummarySpecPart) => void;
  gaps?: (names: readonly string[]) => string[];
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function SummaryPresetMenu({
  properties,
  view,
  apply,
  gaps = NO_GAPS,
}: SummaryPresetMenuProps) {
  const saved = useSavedKindItems(SUMMARY_PRESETS);
  const [lastId, setLastId] = useState<string | null>(null);
  const current = summaryPresetKey(properties, view);
  const keyOf = (spec: SummarySpecPart) =>
    summaryPresetKey(spec.properties, spec.view);
  const own = saved.flatMap((item) => {
    const spec = presetToSpec(item.data);
    return spec ? [{ item, spec }] : [];
  });
  const starters = BUILT_IN_SUMMARY_PRESETS.flatMap((starter) => {
    const spec = presetToSpec(starter.data);
    return spec ? [{ starter, spec }] : [];
  });
  const builtin = starters.find(({ spec }) => keyOf(spec) === current);
  const ownMatch = own.find(({ spec }) => keyOf(spec) === current);
  const target = ownMatch?.item ?? saved.find((item) => item.id === lastId);
  const label = builtin?.starter.name ?? ownMatch?.item.name ?? 'Custom';

  const note = (spec: SummarySpecPart) => {
    const missing = gaps(specPropertyNames(spec));
    return missing.length > 0
      ? { description: `Not in this model: ${missing.join(', ')}` }
      : {};
  };

  const choose = (name: string, spec: SummarySpecPart, id: string | null) => {
    setLastId(id);
    apply(spec);
    const missing = gaps(specPropertyNames(spec));
    notify(
      missing.length > 0
        ? `Applied the summary preset "${name}". Not in this model: ${missing.join(', ')}.`
        : `Applied the summary preset "${name}"`,
      { tone: 'success' },
    );
  };

  const saveAs = () =>
    promptPresetName({
      title: 'Save current as preset',
      confirm: 'Save preset',
      onSubmit: (name) => {
        const item = SUMMARY_PRESETS.save(name, {
          properties: [...properties],
          view: view as unknown as JsonValue,
        });
        if (item) setLastId(item.id);
        else notify(SAVE_FAILED, { tone: 'error' });
      },
    });

  const entries = (): MenuEntry[] => [
    ...starters.map(({ starter, spec }) => ({
      id: `builtin:${starter.id}`,
      label: starter.name,
      checked: builtin?.starter.id === starter.id,
      ...note(spec),
      onSelect: () => choose(starter.name, spec, null),
    })),
    ...(own.length > 0
      ? [
          { kind: 'separator' as const, id: 'mine' },
          ...own.map(({ item, spec }) => ({
            id: `mine:${item.id}`,
            label: item.name,
            checked: ownMatch?.item.id === item.id,
            ...note(spec),
            onSelect: () => choose(item.name, spec, item.id),
          })),
        ]
      : []),
    { kind: 'separator' as const, id: 'actions-sep' },
    {
      id: 'save-as',
      label: 'Save current as preset...',
      icon: 'plus' as const,
      onSelect: saveAs,
    },
    ...(target
      ? [
          {
            id: 'update',
            label: `Update "${target.name}" with the current summary`,
            onSelect: () => {
              if (
                !saveSummaryPreset(target.name, properties, view, target.id)
              ) {
                notify(SAVE_FAILED, { tone: 'error' });
              }
            },
          },
          {
            id: 'rename',
            label: 'Rename...',
            onSelect: () =>
              promptPresetName({
                title: 'Rename preset',
                confirm: 'Rename',
                initial: target.name,
                onSubmit: (name) => {
                  if (!SUMMARY_PRESETS.rename(target.id, name)) {
                    notify('Could not rename the preset.', { tone: 'error' });
                  }
                },
              }),
          },
          {
            id: 'delete',
            label: 'Delete',
            onSelect: () => {
              if (SUMMARY_PRESETS.remove(target.id)) {
                setLastId(null);
              } else {
                notify('Could not delete the preset.', { tone: 'error' });
              }
            },
          },
        ]
      : []),
  ];

  return (
    <Menu
      label="Summary presets"
      triggerClassName="bsh-presets-trigger"
      align="start"
      trigger={
        <>
          <Icon name="layers" size={13} />
          <span>Presets</span>
          <span className="bsh-presets-trigger__value">{label}</span>
          <Icon name="chevron" size={11} />
        </>
      }
      items={entries}
    />
  );
}

export function SummaryPresetSection({
  adapter,
  properties,
  view,
  apply,
}: Omit<SummaryPresetMenuProps, 'gaps'> & { adapter: ViewerAdapter | null }) {
  const catalog = usePropertyCatalog(adapter);
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const known =
    catalog.status === 'ready' ? catalog.catalog.map((info) => info.name) : [];
  const gaps = (names: readonly string[]) =>
    known.length > 0 ? missingPresetProperties(names, known) : [];

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
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
    <fieldset className="settings__section">
      <legend className="settings__heading">Preset</legend>
      <SummaryPresetMenu
        properties={properties}
        view={view}
        gaps={gaps}
        apply={(spec) => {
          apply(spec);
          const missing = gaps(specPropertyNames(spec));
          setNote(
            missing.length > 0
              ? `${missing.length} ${missing.length === 1 ? 'property is' : 'properties are'} not in this model: ${missing.join(', ')}.`
              : '',
          );
        }}
      />
      <p className="settings__hint">
        Pick a preset, or save the current summary as your own, then update,
        rename or delete it from the same menu.
      </p>
      {note ? (
        <p className="settings__hint" role="status">
          {note}
        </p>
      ) : null}
      <div className="settings__actions">
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
    </fieldset>
  );
}
