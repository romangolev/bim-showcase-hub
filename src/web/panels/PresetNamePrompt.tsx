import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Icon } from '../components/icons.js';
import { DetachedUIStrings } from '../i18n/CatalogUIStrings.js';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { Button } from '../ui/Button.js';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog.js';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onDone();
  };

  return (
    <Dialog size="sm" onClose={onDone}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogClose>
          <Icon name="close" size={16} />
        </DialogClose>
      </DialogHeader>
      <DialogBody>
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
      </DialogBody>
    </Dialog>
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
  flushSync(() =>
    root.render(
      <DetachedUIStrings>
        <PresetNameDialog {...options} onDone={done} />
      </DetachedUIStrings>,
    ),
  );
}
