import { Fragment, type ReactNode, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface HostStore<Id extends string = string> {
  get(id: Id): HTMLElement;
  release(id: Id): void;
}

export function createHostStore<Id extends string>(): HostStore<Id> {
  const hosts = new Map<Id, HTMLElement>();
  return {
    get(id) {
      let host = hosts.get(id);
      if (!host) {
        host = document.createElement('div');
        host.className = 'pane-host';
        host.dataset.pane = id;
        hosts.set(id, host);
      }
      return host;
    },
    release(id) {
      const host = hosts.get(id);
      if (!host) return;
      host.remove();
      hosts.delete(id);
    },
  };
}

export interface PaneHostsProps<Id extends string> {
  hosts: HostStore<Id>;
  panes: readonly Id[];
  render: (id: Id) => ReactNode;
}

export function PaneHosts<Id extends string>({
  hosts,
  panes,
  render,
}: PaneHostsProps<Id>) {
  return (
    <>
      {panes.map((id) => (
        <Fragment key={id}>
          {createPortal(render(id), hosts.get(id), id)}
        </Fragment>
      ))}
    </>
  );
}

export interface PaneSlotProps<Id extends string> {
  hosts: HostStore<Id>;
  id: Id;
  onAttach?: (id: Id) => void;
  visible?: boolean;
  className?: string;
}

export function PaneSlot<Id extends string>({
  hosts,
  id,
  onAttach,
  visible = true,
  className,
}: PaneSlotProps<Id>) {
  const ref = useRef<HTMLDivElement>(null);
  const onAttachRef = useRef(onAttach);
  onAttachRef.current = onAttach;

  useLayoutEffect(() => {
    const slot = ref.current;
    if (!slot) return;
    const host = hosts.get(id);
    slot.appendChild(host);
    return () => {
      if (host.parentNode === slot) slot.removeChild(host);
    };
  }, [hosts, id]);

  useLayoutEffect(() => {
    if (visible) onAttachRef.current?.(id);
  }, [id, visible]);

  return (
    <div
      ref={ref}
      className={className ? `pane-slot ${className}` : 'pane-slot'}
      data-slot={id}
    />
  );
}
