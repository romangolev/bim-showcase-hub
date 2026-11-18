import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ModelContext } from '../../api/modelContext.js';
import {
  listRecentModels,
  modelStoreVersion,
  subscribeModelStore,
} from '../../api/modelStore.js';
import { modelTabTitle } from '../../routes/ModelPage.js';
import { useSettings } from '../../settings/SettingsContext.js';
import { Icon } from '../icons.js';
import type { AddTarget } from './DocumentTree.js';
import { MAX_PINS, type Pin, sanitizePins, usePins } from './pins.js';
import { modelMenuEntries, useRowMenu } from './rowMenu.js';

export { MAX_PINS, type Pin, sanitizePins };

export const COLLAPSE_DELAY_MS = 150;

export interface RecentStripProps {
  selectedUrn?: string;
  onOpen: (urn: string, context: ModelContext) => void;
  onOpenModal?: (urn: string, context: ModelContext) => void;
  addTarget?: AddTarget | null;
}

interface Entry {
  urn: string;
  context: ModelContext;
}

export function RecentStrip({
  selectedUrn,
  onOpen,
  onOpenModal,
  addTarget,
}: RecentStripProps) {
  const { settings } = useSettings();
  const version = useSyncExternalStore(
    subscribeModelStore,
    modelStoreVersion,
    modelStoreVersion,
  );
  const { pins, toggle } = usePins();
  const rowMenu = useRowMenu();
  const stored = useMemo(() => {
    void version;
    return listRecentModels();
  }, [version]);
  const known = (urn: string, fallback: ModelContext = {}): Entry => {
    const found = stored.find((item) => item.urn === urn);
    if (!found) return { urn, context: fallback };
    const { urn: _urn, with: _with, ...context } = found;
    return { urn, context };
  };
  const pinnedUrns = pins.map((pin) => pin.urn);
  const pinned = pins.map(({ urn, ...context }) => known(urn, context));
  const recent = stored
    .filter((item) => !pinnedUrns.includes(item.urn))
    .slice(0, settings.recentsLength)
    .map((item) => known(item.urn));

  const [expanded, setExpanded] = useState(false);
  const [sticky, setSticky] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const fromPointer = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();
  const open = expanded || sticky || rowMenu.active;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const collapseSoon = () => {
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      if (hovered.current || rowMenu.active) return;
      if (root.current?.contains(document.activeElement)) return;
      setExpanded(false);
    }, COLLAPSE_DELAY_MS);
  };
  const expand = () => {
    clearTimer();
    setExpanded(true);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const wasMenuActive = useRef(false);
  useEffect(() => {
    if (wasMenuActive.current && !rowMenu.active) collapseSoon();
    wasMenuActive.current = rowMenu.active;
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      setExpanded(false);
      setSticky(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  if (pinned.length === 0 && recent.length === 0) return null;

  const row = (entry: Entry) => {
    const title = modelTabTitle(entry.urn, entry.context);
    const isPinned = pinnedUrns.includes(entry.urn);
    const added = addTarget?.has(entry.urn) ?? false;
    const entries = () =>
      modelMenuEntries({
        urn: entry.urn,
        context: entry.context,
        addTarget,
        pinned: isPinned,
        onOpen: () => onOpen(entry.urn, entry.context),
        onOpenModal: onOpenModal
          ? () => onOpenModal(entry.urn, entry.context)
          : undefined,
        onTogglePin: () => toggle(entry.urn, entry.context),
      });
    return (
      <li
        key={entry.urn}
        className="recent-strip__row"
        data-selected={entry.urn === selectedUrn}
        data-added={added || undefined}
        {...rowMenu.bind(entries, '.recent-strip__open')}
      >
        <button
          type="button"
          className="recent-strip__open"
          title={title.tooltip}
          aria-current={entry.urn === selectedUrn ? 'true' : undefined}
          onClick={() => onOpen(entry.urn, entry.context)}
        >
          {title.label}
        </button>
        {added && addTarget ? (
          <button
            type="button"
            className="recent-strip__remove"
            aria-label={`Remove ${title.label} from the open viewer`}
            title="Remove from the open viewer"
            onClick={() => addTarget.onRemove(entry.urn)}
          >
            <Icon name="close" size={13} />
          </button>
        ) : null}
        <button
          type="button"
          className="recent-strip__pin"
          aria-pressed={isPinned}
          aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${title.label}`}
          onClick={() => toggle(entry.urn, entry.context)}
        >
          <Icon name="star" size={14} />
        </button>
        <button
          type="button"
          className="recent-strip__more"
          aria-haspopup="menu"
          aria-label={`Actions for ${title.label}`}
          onClick={(event) => rowMenu.showAt(entries(), event.currentTarget)}
        >
          <Icon name="more" size={14} />
        </button>
      </li>
    );
  };

  const section = (heading: string, entries: Entry[]) =>
    entries.length > 0 ? (
      <section aria-label={heading} className="recent-strip__section">
        <h3 className="recent-strip__heading">{heading}</h3>
        <ul className="recent-strip__list">{entries.map(row)}</ul>
      </section>
    ) : null;

  const mouse = (event: ReactPointerEvent) => event.pointerType === 'mouse';

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus tracking only, the toggle button is the control
    <div
      ref={root}
      className="recent-strip"
      data-open={open}
      onPointerDownCapture={() => {
        fromPointer.current = true;
      }}
      onPointerEnter={(event) => {
        if (!mouse(event)) return;
        hovered.current = true;
        expand();
      }}
      onPointerLeave={(event) => {
        if (!mouse(event)) return;
        hovered.current = false;
        collapseSoon();
      }}
      onFocus={() => {
        if (fromPointer.current) {
          fromPointer.current = false;
          return;
        }
        expand();
      }}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) {
          collapseSoon();
        }
      }}
    >
      <button
        type="button"
        className="recent-strip__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          clearTimer();
          if (sticky) {
            setSticky(false);
            setExpanded(false);
          } else {
            setSticky(true);
          }
        }}
      >
        <span>Pinned and Recent ({pinned.length + recent.length})</span>
        <Icon name="chevron" size={12} />
      </button>
      <div id={panelId} className="recent-strip__panel" hidden={!open}>
        {section('Pinned', pinned)}
        {section('Recent', recent)}
      </div>
      {rowMenu.menu}
    </div>
  );
}
