import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ModalHost } from './ModalHost.js';
import { MODALS } from './registry.js';
import type { ModalDefinition } from './types.js';

export interface ModalApi {
  open: (id: string) => void;
  close: () => void;
}

const ModalContext = createContext<ModalApi | null>(null);

export interface ModalProviderProps {
  definitions?: readonly ModalDefinition[];
  children: ReactNode;
}

export function ModalProvider({
  definitions = MODALS,
  children,
}: ModalProviderProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const api = useMemo<ModalApi>(
    () => ({
      open: (id) => {
        if (definitions.some((definition) => definition.id === id)) {
          setOpenId(id);
        }
      },
      close: () => setOpenId(null),
    }),
    [definitions],
  );
  const active = definitions.find((definition) => definition.id === openId);
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;
  const activeId = active?.id;

  useEffect(() => {
    if (!activeId) return;
    return definitionsRef.current.find((d) => d.id === activeId)?.onClose;
  }, [activeId]);

  return (
    <ModalContext.Provider value={api}>
      {children}
      {active ? (
        <ModalHost key={active.id} definition={active} onClose={api.close} />
      ) : null}
    </ModalContext.Provider>
  );
}

export function useModal(): ModalApi {
  const api = useContext(ModalContext);
  if (!api) throw new Error('useModal must be used inside ModalProvider');
  return api;
}
