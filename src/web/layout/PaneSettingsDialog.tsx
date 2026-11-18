import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import type { PaneSettingsSchema } from '../settings/paneSettingsSchema.js';

export interface PaneSettingsDialogProps {
  schema: PaneSettingsSchema;
  onClose: () => void;
}

export function PaneSettingsDialog({
  schema,
  onClose,
}: PaneSettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const { Body } = schema;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    let pressedOnDialog = false;
    const onPress = (event: MouseEvent) => {
      pressedOnDialog = event.target === dialog;
    };
    const onBackdropClick = (event: MouseEvent) => {
      const closing = pressedOnDialog && event.target === dialog;
      pressedOnDialog = false;
      if (closing) onCloseRef.current();
    };
    const onNativeClose = () => {
      if (dialog && !dialog.open) onCloseRef.current();
    };
    dialog?.addEventListener('mousedown', onPress);
    dialog?.addEventListener('click', onBackdropClick);
    dialog?.addEventListener('close', onNativeClose);
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.removeEventListener('mousedown', onPress);
      dialog?.removeEventListener('click', onBackdropClick);
      dialog?.removeEventListener('close', onNativeClose);
      opener?.focus();
    };
  }, [opener]);

  return (
    <dialog
      ref={dialogRef}
      className="modal modal--md"
      aria-labelledby={titleId}
    >
      <div className="modal__panel">
        <header className="modal__head">
          <h2 id={titleId} className="modal__title">
            {schema.windowTitle}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="modal__body">{Body ? <Body /> : null}</div>
      </div>
    </dialog>
  );
}
