import { useEffect, useId, useRef } from 'react';
import { Icon } from '../components/icons.js';
import type { ModalDefinition } from './types.js';

export interface ModalHostProps {
  definition: ModalDefinition;
  onClose: () => void;
}

export function ModalHost({ definition, onClose }: ModalHostProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { Body } = definition;

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement as HTMLElement | null;
    const onBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) onClose();
    };
    dialog?.addEventListener('click', onBackdropClick);
    dialog?.showModal();
    return () => {
      dialog?.removeEventListener('click', onBackdropClick);
      if (dialog?.open) dialog.close();
      opener?.focus();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={`modal modal--${definition.size}`}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="modal__panel">
        <header className="modal__head">
          <h2 id={titleId} className="modal__title">
            {definition.title}
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
        <div className="modal__body">
          <Body close={onClose} />
        </div>
      </div>
    </dialog>
  );
}
