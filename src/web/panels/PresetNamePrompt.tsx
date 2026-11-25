import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Icon } from '../components/icons.js';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';

interface PresetNamePromptOptions {
  title: string;
  confirm: string;
  initial?: string;
  onSubmit: (name: string) => void;
}

function PresetNameDialog({
  title,
  confirm,
  initial = '',
  onSubmit,
  onDone,
}: PresetNamePromptOptions & { onDone: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [name, setName] = useState(initial);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
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
            {title}
          </h2>
          <IconButton label="Close" onClick={onDone}>
            <Icon name="close" size={16} />
          </IconButton>
        </header>
        <div className="modal__body">
          <label className="bsh-field">
            <span>Preset name</span>
            <input
              ref={inputRef}
              type="text"
              className="field"
              aria-label="Preset name"
              placeholder="Name this preset"
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
          </label>
          <div className="bsh-presets">
            <Button onClick={onDone}>Cancel</Button>
            <Button disabled={!name.trim()} onClick={submit}>
              {confirm}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

export function promptPresetName(options: PresetNamePromptOptions): void {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    root.unmount();
    host.remove();
  };
  flushSync(() => root.render(<PresetNameDialog {...options} onDone={done} />));
}
