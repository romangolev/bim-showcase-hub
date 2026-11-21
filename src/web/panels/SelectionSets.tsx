import { useEffect, useState } from 'react';
import { formatCount } from '../i18n/format.js';
import { useSettings } from '../settings/SettingsContext.js';
import type { Language } from '../settings/settings.js';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { notify } from '../tasks/notifications.js';
import {
  deleteSet,
  MAX_SET_ELEMENTS,
  type MergeMode,
  mergeSets,
  renameSet,
  type SaveSetResult,
  saveSelectionSet,
  useSelectionSets,
} from '../viewer/selectionSets.js';
import {
  migrateSelectionSet,
  migrateSelectionSets,
  selectSet,
  stableKeysFor,
} from '../viewer/setResolution.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export function setMessages(
  language: Language,
): Record<Exclude<SaveSetResult, 'ok'>, string> {
  return {
    empty: 'Select elements in the viewer first.',
    'too-big': `A set holds up to ${formatCount(MAX_SET_ELEMENTS, language)} elements.`,
    failed:
      'Could not save the set. Saved items hold up to 4 MB; delete some and try again.',
  };
}

const MERGE_MESSAGES: Record<MergeMode, string> = {
  union: 'Union keeps every element that is in either set.',
  intersect: 'Intersect keeps only the elements that are in both sets.',
};

export function SelectionSets({ adapter }: { adapter: ViewerAdapter | null }) {
  const { language } = useSettings().settings;
  const messages = setMessages(language);
  const sets = useSelectionSets();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [firstId, setFirstId] = useState('');
  const [secondId, setSecondId] = useState('');
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!adapter) return;
    void migrateSelectionSets(adapter).catch(() => undefined);
  }, [adapter, sets.length]);

  const save = async () => {
    if (!adapter) return;
    const items = adapter.getModelSelection();
    const stable = await stableKeysFor(adapter, items);
    const result = saveSelectionSet(name, items, stable);
    if (result === 'ok') {
      notify(`Saved the selection set "${name.trim()}"`, { tone: 'success' });
      setName('');
      setProblem(null);
    } else {
      setProblem(messages[result]);
      notify(messages[result], { tone: 'error' });
    }
  };

  const select = async (adapter: ViewerAdapter, id: string, total: number) => {
    const count = await selectSet(adapter, id);
    if (count === 0 && total > 0) {
      setProblem("None of this set's models are open.");
    } else if (count < total) {
      setProblem(
        `Selected ${formatCount(count, language)} of ${formatCount(total, language)} elements. The rest belong to models that are not open or no longer exist in the model.`,
      );
    } else setProblem(null);
  };

  const ids = new Set(sets.map((set) => set.id));
  const first = ids.has(firstId) ? firstId : '';
  const second = ids.has(secondId) ? secondId : '';
  const canMerge =
    first !== '' && second !== '' && first !== second && !merging;

  const merge = async (mode: MergeMode) => {
    const left = sets.find((set) => set.id === first);
    const right = sets.find((set) => set.id === second);
    if (!canMerge || !left || !right) return;
    setMerging(true);
    if (adapter) {
      try {
        await migrateSelectionSet(adapter, first);
        await migrateSelectionSet(adapter, second);
      } catch {
        setMerging(false);
        setProblem('Could not read the sets. Try again.');
        return;
      }
    }
    const label = (
      name.trim() ||
      `${left.name} ${mode === 'union' ? '∪' : '∩'} ${right.name}`
    ).slice(0, MAX_NAME_LENGTH);
    const result = mergeSets(label, first, second, mode);
    setMerging(false);
    if (result === 'ok') {
      notify(`Saved the merged set "${label}"`, { tone: 'success' });
      setName('');
      setProblem(null);
    } else if (result === 'empty') {
      setProblem('No elements are in both sets.');
    } else {
      setProblem(messages[result]);
      notify(messages[result], { tone: 'error' });
    }
  };

  return (
    <fieldset className="bsh-fieldset">
      <legend>Selection sets</legend>
      <div className="bsh-presets">
        <input
          type="text"
          className="bsh-input"
          aria-label="Selection set name"
          placeholder="Name the current selection"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
          }}
        />
        <button
          type="button"
          className="bsh-button"
          disabled={!adapter || !name.trim()}
          onClick={() => void save()}
        >
          Save selection as set
        </button>
      </div>
      {problem ? (
        <p role="alert" className="settings__hint">
          {problem}
        </p>
      ) : null}
      {sets.length > 0 ? (
        <div className="bsh-presets">
          <label className="bsh-field">
            <span>Merge set A</span>
            <select
              className="bsh-select"
              aria-label="Merge set A"
              value={first}
              onChange={(event) => setFirstId(event.target.value)}
            >
              <option value="">Choose a set</option>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bsh-field">
            <span>Merge set B</span>
            <select
              className="bsh-select"
              aria-label="Merge set B"
              value={second}
              onChange={(event) => setSecondId(event.target.value)}
            >
              <option value="">Choose a set</option>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="bsh-button"
            disabled={!canMerge}
            onClick={() => void merge('union')}
          >
            Union
          </button>
          <button
            type="button"
            className="bsh-button"
            disabled={!canMerge}
            onClick={() => void merge('intersect')}
          >
            Intersect
          </button>
          <p className="settings__hint">
            {MERGE_MESSAGES.union} {MERGE_MESSAGES.intersect}
          </p>
        </div>
      ) : null}
      {sets.length === 0 ? (
        <p className="settings__hint">No selection sets yet.</p>
      ) : (
        <ul className="settings__palette">
          {sets.map((set) => (
            <li key={`${set.id}:${set.name}`} className="bsh-presets">
              <input
                type="text"
                className="bsh-input"
                aria-label={`Rename ${set.name}`}
                maxLength={MAX_NAME_LENGTH}
                defaultValue={set.name}
                onBlur={(event) => {
                  const ok = renameSet(set.id, event.target.value);
                  if (!ok) event.target.value = set.name;
                  setProblem(
                    ok
                      ? null
                      : 'Could not rename the set. Use a non-empty name.',
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <span className="settings__hint">
                {formatCount(set.items.length, language)} elements
              </span>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Select ${set.name}`}
                disabled={!adapter}
                onClick={() => {
                  if (adapter) void select(adapter, set.id, set.items.length);
                }}
              >
                Select
              </button>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Delete ${set.name}`}
                onClick={() => deleteSet(set.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
