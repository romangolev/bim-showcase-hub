import { useState } from 'react';
import { ModalHost } from '../../modal/ModalHost.js';
import type { ModalBodyProps } from '../../modal/types.js';
import { MAX_NAME_LENGTH } from '../../store/savedStore.js';
import { notify } from '../../tasks/notifications.js';
import { SettingsField } from '../SettingsForm.js';
import { DOC_SEARCHES, type DocSearchData } from './deepSearch.js';

function SaveSearchForm({
  data,
  close,
}: ModalBodyProps & { data: DocSearchData }) {
  const [name, setName] = useState('');

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
    close();
  };

  return (
    <>
      <SettingsField
        label="Search name"
        hint="A saved search applies to the project you have open."
      >
        {(id) => (
          <input
            id={id}
            type="text"
            placeholder="Name this search"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
            }}
          />
        )}
      </SettingsField>
      <div className="settings__actions">
        <button type="button" className="btn" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!name.trim()}
          onClick={save}
        >
          Save search
        </button>
      </div>
    </>
  );
}

export function SaveSearchDialog({
  data,
  onDone,
}: {
  data: DocSearchData;
  onDone: () => void;
}) {
  const [definition] = useState(() => ({
    id: 'save-search',
    title: 'Save search',
    size: 'sm' as const,
    Body: ({ close }: ModalBodyProps) => (
      <SaveSearchForm data={data} close={close} />
    ),
  }));
  return <ModalHost definition={definition} onClose={onDone} />;
}
