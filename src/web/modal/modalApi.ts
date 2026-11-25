import { createContext, useContext } from 'react';

export interface ModalBack {
  label: string;
  go: () => void;
}

export interface ModalApi {
  open: (id: string, back?: ModalBack) => void;
  close: () => void;
}

export const ModalContext = createContext<ModalApi | null>(null);

export function useModalApi(): ModalApi | null {
  return useContext(ModalContext);
}
