import { useState } from 'react';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import {
  deleteSet,
  MAX_SET_ELEMENTS,
  renameSet,
  type SaveSetResult,
  saveSelectionSet,
  selectSet,
  useSelectionSets,
} from '../viewer/selectionSets.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export const SET_MESSAGES: Record<Exclude<SaveSetResult, 'ok'>, string> = {
  empty: 'Select elements in the viewer first.',
  'too-big': `A set holds up to ${MAX_SET_ELEMENTS.toLocaleString('en-US')} elements.`,
  failed: 'Could not save the set. Delete some saved items and try again.',
};

export function SelectionSets({ adapter }: { adapter: ViewerAdapter | null }) {
  const sets = useSelectionSets();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    if (!adapter) return;
    const result = saveSelectionSet(name, adapter.getModelSelection());
    if (result === 'ok') {
      setName('');
      setProblem(null);
    } else setProblem(SET_MESSAGES[result]);
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
            if (event.key === 'Enter') save();
          }}
        />
        <button
          type="button"
          className="bsh-button"
          disabled={!adapter || !name.trim()}
          onClick={save}
        >
          Save selection as set
        </button>
      </div>
      {problem ? (
        <p role="alert" className="settings__hint">
          {problem}
        </p>
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
                onBlur={(event) => renameSet(set.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <span className="settings__hint">
                {set.items.length.toLocaleString('en-US')} elements
              </span>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Select ${set.name}`}
                disabled={!adapter}
                onClick={() => adapter && selectSet(adapter, set.id)}
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
