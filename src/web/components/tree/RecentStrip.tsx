import { useMemo, useSyncExternalStore } from 'react';
import {
  type ModelContext,
  parseModelContext,
} from '../../api/modelContext.js';
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

export interface Pin extends ModelContext {
  urn: string;
}

export function sanitizePins(raw: unknown): Pin[] {
  if (!Array.isArray(raw)) return [];
  const pins = new Map<string, Pin>();
  for (const item of raw) {
    const urn = typeof item === 'string' ? item : (item as Pin | null)?.urn;
    if (typeof urn !== 'string' || urn === '' || pins.has(urn)) continue;
    const { with: _with, ...context } = parseModelContext(
      typeof item === 'string' ? {} : item,
    );
    pins.set(urn, { urn, ...context });
  }
  return [...pins.values()];
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
  onTogglePin: (entry: Entry) => void;
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
        onClick={() => onTogglePin(entry)}
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
  const [pins, setPins] = usePersistedState<Pin[]>(
    PINNED_KEY,
    [],
    sanitizePins,
  );
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
  const toggle = (entry: Entry) =>
    setPins((current) =>
      current.some((pin) => pin.urn === entry.urn)
        ? current.filter((pin) => pin.urn !== entry.urn)
        : [{ urn: entry.urn, ...entry.context }, ...current],
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
              pinned={pinnedUrns.includes(entry.urn)}
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
