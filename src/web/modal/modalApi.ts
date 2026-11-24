import { createContext, useContext } from 'react';

export interface ModalApi {
  open: (id: string) => void;
  close: () => void;
}

export const ModalContext = createContext<ModalApi | null>(null);

export function useModalApi(): ModalApi | null {
  return useContext(ModalContext);
}
