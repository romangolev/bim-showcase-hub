import { createContext, type Ref, useContext, useMemo, useState } from 'react';

export function topLayerContainer(origin: Element | null): HTMLElement {
  if (!origin) return document.body;
  let host: Element | null = null;
  try {
    host = origin.closest('dialog, :fullscreen');
  } catch {
    host = origin.closest('dialog');
  }
  return host instanceof HTMLElement ? host : document.body;
}

export interface TriggerScopeValue {
  trigger: HTMLElement | null;
  setTrigger: (node: HTMLElement | null) => void;
}

export const TriggerScope = createContext<TriggerScopeValue | null>(null);

export function useTriggerScopeValue(): TriggerScopeValue {
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  return useMemo(() => ({ trigger, setTrigger }), [trigger]);
}

export function useTriggerRef<T extends HTMLElement>(
  ref: Ref<T> | undefined,
): (node: T | null) => void {
  const scope = useContext(TriggerScope);
  return (node) => {
    scope?.setTrigger(node);
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
}

export function usePopupContainer(
  container: HTMLElement | null | undefined,
): HTMLElement {
  const scope = useContext(TriggerScope);
  return container ?? topLayerContainer(scope?.trigger ?? null);
}
