import { Icon } from '../components/icons.js';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog.js';
import { IconButton } from '../ui/IconButton.js';
import type { ModalBack } from './modalApi.js';
import type { ModalDefinition } from './types.js';

export interface ModalHostProps {
  definition: ModalDefinition;
  back?: ModalBack;
  onClose: () => void;
}

export function ModalHost({ definition, back, onClose }: ModalHostProps) {
  const { Body } = definition;

  return (
    <Dialog size={definition.size} onClose={onClose}>
      <DialogHeader>
        {back ? (
          <IconButton
            className="settings-nav__back"
            label={back.label}
            tooltip
            onClick={back.go}
          >
            <Icon name="chevron" size={16} />
          </IconButton>
        ) : null}
        <DialogTitle>{definition.title}</DialogTitle>
        <DialogClose>
          <Icon name="close" size={16} />
        </DialogClose>
      </DialogHeader>
      <DialogBody className="settings">
        <Body close={onClose} />
      </DialogBody>
    </Dialog>
  );
}
