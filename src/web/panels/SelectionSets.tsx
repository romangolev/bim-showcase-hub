import { useState } from 'react';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { notify } from '../tasks/notifications.js';
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
  failed:
    'Could not save the set. Saved items hold up to 4 MB; delete some and try again.',
};

export function SelectionSets({ adapter }: { adapter: ViewerAdapter | null }) {
  const sets = useSelectionSets();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    if (!adapter) return;
    const result = saveSelectionSet(name, adapter.getModelSelection());
    if (result === 'ok') {
      notify(`Saved the selection set "${name.trim()}"`, { tone: 'success' });
      setName('');
      setProblem(null);
    } else {
      setProblem(SET_MESSAGES[result]);
      notify(SET_MESSAGES[result], { tone: 'error' });
    }
  };

  const select = (adapter: ViewerAdapter, id: string, total: number) => {
    const count = selectSet(adapter, id);
    if (count === 0 && total > 0) {
      setProblem("None of this set's models are open.");
    } else if (count < total) {
      setProblem(
        `Selected ${count.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} elements. The rest belong to models that are not open.`,
      );
    } else setProblem(null);
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
                {set.items.length.toLocaleString('en-US')} elements
              </span>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Select ${set.name}`}
                disabled={!adapter}
                onClick={() =>
                  adapter && select(adapter, set.id, set.items.length)
                }
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
