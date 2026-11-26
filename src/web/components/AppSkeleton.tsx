import { useState } from 'react';
import { isRecord } from '../../shared/guards.js';
import {
  LAST_SESSION,
  OPEN_MODELS,
  type OpenModel,
} from '../api/openModels.js';
import { useT } from '../i18n/i18n.js';
import { STACKED_QUERY } from '../layout/breakpoint.js';
import {
  parseLayout,
  type SerializedDock,
  type SerializedNode,
} from '../layout/layoutState.js';
import { paneById, paneKind } from '../layout/paneRegistry.js';
import { readSettings } from '../settings/settings.js';
import { BSH_KEYS, defineRecord, getStorageAdapter } from '../storage.js';
import { Skeleton } from '../ui/Skeleton.js';
import { Hint } from './Hint.js';
import { TopBar } from './TopBar.js';
import { useMediaQuery } from './useMediaQuery.js';
import './app-skeleton.css';

const FALLBACK_TABS = [paneById('tree').title];

export const LAYOUT_LOCKED = defineRecord<boolean>({
  key: BSH_KEYS.preference.layoutLocked,
  initial: false,
  sanitize: (raw) => raw === true,
});

export function isHomeLayout(models: readonly unknown[]): boolean {
  return models.length === 0;
}

function savedDock(): SerializedDock | null {
  try {
    return (
      parseLayout(getStorageAdapter().get('local', BSH_KEYS.personal.layout))
        ?.dock ?? null
    );
  } catch {
    return null;
  }
}

function seededModels(): readonly OpenModel[] {
  const open = OPEN_MODELS.read().models;
  if (open.length > 0 || !readSettings().restoreSession) return open;
  const last = LAST_SESSION.read().models;
  return last.length > 0 ? last : open;
}

function tabTitleOf(view: unknown): string | null {
  if (typeof view !== 'string') return null;
  const kind = paneKind(view);
  return kind ? paneById(kind).title : null;
}

function tabsOf(views: unknown): string[] {
  if (!Array.isArray(views)) return FALLBACK_TABS;
  const titles = views
    .map(tabTitleOf)
    .filter((title): title is string => title !== null);
  return titles.length > 0 ? titles : FALLBACK_TABS;
}

function Pane({ tabs, active }: { tabs: string[]; active: number }) {
  return (
    <section className="app-skeleton__pane">
      <div className="app-skeleton__tabs">
        {tabs.map((title, index) => (
          <span
            key={index}
            className="app-skeleton__tab"
            data-active={index === active}
          >
            {title}
          </span>
        ))}
      </div>
      <Skeleton rows={5} />
    </section>
  );
}

function Branch({
  nodes,
  horizontal,
}: {
  nodes: SerializedNode[];
  horizontal: boolean;
}) {
  return (
    <div className="app-skeleton__branch" data-horizontal={horizontal}>
      {nodes
        .filter((node) => node.visible !== false)
        .map((node, index) => (
          <div
            key={index}
            className="app-skeleton__cell"
            style={{ flexGrow: node.size && node.size > 0 ? node.size : 1 }}
          >
            {node.type === 'branch' && Array.isArray(node.data) ? (
              <Branch
                nodes={node.data as SerializedNode[]}
                horizontal={!horizontal}
              />
            ) : (
              <Leaf node={node} />
            )}
          </div>
        ))}
    </div>
  );
}

function Leaf({ node }: { node: SerializedNode }) {
  const group = isRecord(node.data) ? node.data : {};
  const tabs = tabsOf(group.views);
  const active =
    typeof group.activeView === 'string' && Array.isArray(group.views)
      ? Math.max(0, group.views.indexOf(group.activeView))
      : 0;
  return <Pane tabs={tabs} active={active} />;
}

export function SkeletonDock({ dock }: { dock: SerializedDock | null }) {
  const t = useT();
  const stacked = useMediaQuery(STACKED_QUERY);
  const shown = stacked ? null : dock;
  const root = shown?.grid.root;
  return (
    <div className="app-skeleton">
      <span className="visually-hidden" role="status" aria-live="polite">
        {t('ui.loading')}
      </span>
      {shown && root && Array.isArray(root.data) ? (
        <Branch
          nodes={root.data as SerializedNode[]}
          horizontal={shown.grid.orientation === 'HORIZONTAL'}
        />
      ) : (
        <Pane tabs={FALLBACK_TABS} active={0} />
      )}
    </div>
  );
}

export function AppSkeleton({ hints = false }: { hints?: boolean }) {
  const t = useT();
  const stacked = useMediaQuery(STACKED_QUERY);
  const [saved] = useState(savedDock);
  const [locked] = useState(() => LAYOUT_LOCKED.read());
  const home = isHomeLayout(seededModels());
  return (
    <>
      <TopBar />
      {hints && !stacked && !locked ? (
        home ? (
          <Hint id="palette">{t('hints.palette')}</Hint>
        ) : (
          <Hint id="move-panes">{t('hints.movePanes')}</Hint>
        )
      ) : null}
      <div className="app-skeleton__body">
        <main id="main" className="app-skeleton__main" tabIndex={-1}>
          <SkeletonDock dock={saved} />
        </main>
      </div>
    </>
  );
}
