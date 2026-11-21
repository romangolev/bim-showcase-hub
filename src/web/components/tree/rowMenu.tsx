import { defaultStringifySearch } from '@tanstack/react-router';
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useRef,
  useState,
} from 'react';
import { MAX_COMBINED_MODELS } from '../../../shared/combined.js';
import type { ModelContext } from '../../api/modelContext.js';
import { Menu, type MenuEntry } from '../Menu.js';
import type { AddTarget } from './DocumentTree.js';

export const LONG_PRESS_MS = 500;

export function modelHref(
  urn: string,
  context: ModelContext,
  origin = window.location.origin,
): string {
  return `${origin}/model/${encodeURIComponent(urn)}${defaultStringifySearch(context)}`;
}

export interface ModelMenuSource {
  urn: string | null;
  context: ModelContext;
  addTarget?: AddTarget | null;
  pinned?: boolean;
  onOpen: () => void;
  onOpenTab?: () => void;
  onOpenModal?: () => void;
  onAdd?: () => void;
  onTogglePin?: () => void;
  onCopyLink?: () => void;
  onRevealPath?: () => void;
  onShowVersions?: () => void;
  onVersionHistory?: () => void;
}

export function modelMenuEntries(source: ModelMenuSource): MenuEntry[] {
  const { urn, addTarget } = source;
  const entries: MenuEntry[] = [
    { id: 'open', label: 'Open', onSelect: source.onOpen },
  ];
  if (urn && source.onOpenTab) {
    entries.push({
      id: 'open-tab',
      label: 'Open in new tab',
      onSelect: source.onOpenTab,
    });
  }
  if (urn && source.onOpenModal) {
    entries.push({
      id: 'modal',
      label: 'Open as modal',
      onSelect: source.onOpenModal,
    });
  }
  if (addTarget) {
    if (urn && addTarget.has(urn)) {
      entries.push({
        id: 'remove',
        label: 'Remove from open model',
        onSelect: () => addTarget.onRemove(urn),
      });
    } else {
      const capped = urn !== null && !addTarget.canAdd(urn);
      entries.push({
        id: 'add',
        label: 'Add to open model',
        disabled: urn === null || capped,
        description: capped
          ? `Combined viewer holds ${MAX_COMBINED_MODELS} models`
          : urn === null
            ? 'This version is not ready to view'
            : undefined,
        onSelect: () =>
          source.onAdd
            ? source.onAdd()
            : urn && addTarget.onAdd([{ urn, context: source.context }]),
      });
    }
  }
  if (urn && source.onTogglePin) {
    entries.push({ kind: 'separator', id: 'pin-separator' });
    entries.push({
      id: 'pin',
      label: source.pinned ? 'Unpin' : 'Pin',
      onSelect: source.onTogglePin,
    });
  }
  if (
    source.onCopyLink ||
    source.onRevealPath ||
    source.onShowVersions ||
    source.onVersionHistory
  ) {
    entries.push({ kind: 'separator', id: 'locate-separator' });
    if (urn && source.onCopyLink) {
      entries.push({
        id: 'copy-link',
        label: 'Copy link',
        onSelect: source.onCopyLink,
      });
    }
    if (source.onRevealPath) {
      entries.push({
        id: 'reveal-path',
        label: 'Reveal path',
        description: 'Expand the folders that contain this version',
        onSelect: source.onRevealPath,
      });
    }
    if (source.onShowVersions) {
      entries.push({
        id: 'show-versions',
        label: 'Show versions',
        description: 'Expand the item so its versions are visible',
        onSelect: source.onShowVersions,
      });
    }
    if (source.onVersionHistory) {
      entries.push({
        id: 'version-history',
        label: 'Version history',
        description: 'List the versions in their own pane',
        onSelect: source.onVersionHistory,
      });
    }
  }
  return entries;
}

export interface ItemMenuSource {
  hasLastOpened: boolean;
  onOpenLatest: () => void;
  onOpenLastOpened?: () => void;
  onShowVersions: () => void;
  onPreview?: () => void;
  onVersionHistory?: () => void;
}

export function itemMenuEntries(source: ItemMenuSource): MenuEntry[] {
  const entries: MenuEntry[] = [
    {
      id: 'open-latest',
      label: 'Open latest version',
      onSelect: source.onOpenLatest,
    },
  ];
  if (source.hasLastOpened && source.onOpenLastOpened) {
    entries.push({
      id: 'open-last',
      label: 'Open last opened version',
      onSelect: source.onOpenLastOpened,
    });
  }
  if (source.onPreview) {
    entries.push({
      id: 'preview',
      label: 'Preview',
      description: 'Show the file without opening it',
      onSelect: source.onPreview,
    });
  }
  entries.push({ kind: 'separator', id: 'item-separator' });
  entries.push({
    id: 'show-versions',
    label: 'Show versions',
    onSelect: source.onShowVersions,
  });
  if (source.onVersionHistory) {
    entries.push({
      id: 'version-history',
      label: 'Version history',
      description: 'List the versions in their own pane',
      onSelect: source.onVersionHistory,
    });
  }
  return entries;
}

interface Opened {
  x: number;
  y: number;
  entries: MenuEntry[];
  from: HTMLElement | null;
}

export function useRowMenu() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const show = (
    entries: MenuEntry[],
    x: number,
    y: number,
    from: HTMLElement | null,
  ) => setOpened({ x, y, entries, from });

  const showAt = (entries: MenuEntry[], element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    show(entries, box.left, box.bottom, element);
  };

  const bind = (entries: () => MenuEntry[], focusSelector?: string) => {
    const origin = (element: HTMLElement) =>
      (focusSelector && element.querySelector<HTMLElement>(focusSelector)) ||
      element;
    return {
      onContextMenu: (event: MouseEvent<HTMLElement>) => {
        event.preventDefault();
        show(
          entries(),
          event.clientX,
          event.clientY,
          origin(event.currentTarget),
        );
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          show(entries(), box.left, box.bottom, origin(event.currentTarget));
        }
      },
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'touch') return;
        const { clientX, clientY, currentTarget } = event;
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          show(entries(), clientX, clientY, origin(currentTarget));
        }, LONG_PRESS_MS);
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
    };
  };

  const menu = opened ? (
    <Menu
      label="Model actions"
      anchor={{ x: opened.x, y: opened.y }}
      items={() => opened.entries}
      onClose={(restore) => {
        if (restore) opened.from?.focus();
        setOpened(null);
      }}
    />
  ) : null;

  return { bind, menu, showAt, active: opened !== null };
}
