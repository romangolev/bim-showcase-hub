import { useEffect, useId, useRef, useState } from 'react';
import { MAX_NAME_LENGTH } from '../../store/savedStore.js';
import { notify } from '../../tasks/notifications.js';
import { Icon } from '../icons.js';
import { DOC_SEARCHES, type DocSearchData } from './deepSearch.js';

export function SaveSearchDialog({
  data,
  onDone,
}: {
  data: DocSearchData;
  onDone: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved = DOC_SEARCHES.save(trimmed, data);
    notify(
      saved
        ? `Saved the search "${trimmed}"`
        : 'Could not save the search. Delete some saved items and try again.',
      { tone: saved ? 'success' : 'error' },
    );
    onDone();
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal modal--sm"
      aria-labelledby={titleId}
      onClose={onDone}
    >
      <div className="modal__panel">
        <header className="modal__head">
          <h2 id={titleId} className="modal__title">
            Save search
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onDone}
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="modal__body">
          <label className="bsh-field">
            <span>Search name</span>
            <input
              type="text"
              className="bsh-input"
              aria-label="Search name"
              placeholder="Name this search"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
            />
          </label>
          <p className="settings__hint">
            A saved search applies to the project you have open.
          </p>
          <div className="bsh-presets">
            <button type="button" className="bsh-button" onClick={onDone}>
              Cancel
            </button>
            <button
              type="button"
              className="bsh-button"
              disabled={!name.trim()}
              onClick={save}
            >
              Save search
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
