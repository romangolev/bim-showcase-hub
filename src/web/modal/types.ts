import type { ComponentType } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'sheet';

export interface ModalBodyProps {
  close: () => void;
}

export interface ModalDefinition {
  id: string;
  title: string;
  size: ModalSize;
  Body: ComponentType<ModalBodyProps>;
  onClose?: () => void;
}
