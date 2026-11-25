import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ModalHost } from './ModalHost.js';
import {
  type ModalApi,
  type ModalBack,
  ModalContext,
  useModalApi,
} from './modalApi.js';
import { MODALS } from './registry.js';
import type { ModalDefinition } from './types.js';

export interface ModalProviderProps {
  definitions?: readonly ModalDefinition[];
  children: ReactNode;
}

export function ModalProvider({
  definitions = MODALS,
  children,
}: ModalProviderProps) {
  const [opened, setOpened] = useState<{
    id: string;
    back?: ModalBack;
  } | null>(null);
  const api = useMemo<ModalApi>(
    () => ({
      open: (id, back) => {
        if (definitions.some((definition) => definition.id === id)) {
          setOpened({ id, back });
        }
      },
      close: () => setOpened(null),
    }),
    [definitions],
  );
  const active = definitions.find((definition) => definition.id === opened?.id);
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
        <ModalHost
          key={active.id}
          definition={active}
          back={opened?.back}
          onClose={api.close}
        />
      ) : null}
    </ModalContext.Provider>
  );
}

export function useModal(): ModalApi {
  const api = useModalApi();
  if (!api) throw new Error('useModal must be used inside ModalProvider');
  return api;
}
