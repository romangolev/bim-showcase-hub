import { useMemo, useSyncExternalStore } from 'react';
import type { ModelContext } from '../../api/modelContext.js';
import {
  listRecentModels,
  modelStoreVersion,
  PINNED_KEY,
  subscribeModelStore,
} from '../../api/modelStore.js';
import { usePersistedState } from '../../panels/usePersistedState.js';
import { modelTabTitle } from '../../routes/ModelPage.js';
import { useSettings } from '../../settings/SettingsContext.js';
import { Icon } from '../icons.js';

export function sanitizePins(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter((u): u is string => typeof u === 'string' && u !== ''),
    ),
  ];
}

export interface RecentStripProps {
  selectedUrn?: string;
  onOpen: (urn: string, context: ModelContext) => void;
}

interface Entry {
  urn: string;
  context: ModelContext;
}

function Row({
  entry,
  pinned,
  selected,
  onOpen,
  onTogglePin,
}: {
  entry: Entry;
  pinned: boolean;
  selected: boolean;
  onOpen: RecentStripProps['onOpen'];
  onTogglePin: (urn: string) => void;
}) {
  const title = modelTabTitle(entry.urn, entry.context);
  return (
    <li className="recent-strip__row" data-selected={selected}>
      <button
        type="button"
        className="recent-strip__open"
        title={title.tooltip}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onOpen(entry.urn, entry.context)}
      >
        {title.label}
      </button>
      <button
        type="button"
        className="recent-strip__pin"
        aria-pressed={pinned}
        aria-label={`${pinned ? 'Unpin' : 'Pin'} ${title.label}`}
        onClick={() => onTogglePin(entry.urn)}
      >
        <Icon name="star" size={14} />
      </button>
    </li>
  );
}

export function RecentStrip({ selectedUrn, onOpen }: RecentStripProps) {
  const { settings } = useSettings();
  const version = useSyncExternalStore(
    subscribeModelStore,
    modelStoreVersion,
    modelStoreVersion,
  );
  const [pins, setPins] = usePersistedState<string[]>(
    PINNED_KEY,
    [],
    sanitizePins,
  );
  const stored = useMemo(() => {
    void version;
    return listRecentModels();
  }, [version]);
  const known = (urn: string): Entry => {
    const found = stored.find((item) => item.urn === urn);
    if (!found) return { urn, context: {} };
    const { urn: _urn, with: _with, ...context } = found;
    return { urn, context };
  };
  const pinned = pins.map(known);
  const recent = stored
    .filter((item) => !pins.includes(item.urn))
    .slice(0, settings.recentsLength)
    .map((item) => known(item.urn));
  const toggle = (urn: string) =>
    setPins((current) =>
      current.includes(urn)
        ? current.filter((item) => item !== urn)
        : [urn, ...current],
    );
  if (pinned.length === 0 && recent.length === 0) return null;
  const section = (heading: string, entries: Entry[]) =>
    entries.length > 0 ? (
      <section aria-label={heading} className="recent-strip__section">
        <h3 className="recent-strip__heading">{heading}</h3>
        <ul className="recent-strip__list">
          {entries.map((entry) => (
            <Row
              key={entry.urn}
              entry={entry}
              pinned={pins.includes(entry.urn)}
              selected={entry.urn === selectedUrn}
              onOpen={onOpen}
              onTogglePin={toggle}
            />
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <div className="recent-strip">
      {section('Pinned', pinned)}
      {section('Recent', recent)}
    </div>
  );
}
