import { isRecord } from '../../shared/guards.js';
import { OPEN_MODELS } from '../api/openModels.js';
import { useT } from '../i18n/i18n.js';
import { STACKED_QUERY } from '../layout/breakpoint.js';
import {
  parseLayout,
  type SerializedDock,
  type SerializedNode,
} from '../layout/layoutState.js';
import { BSH_KEYS, getStorageAdapter } from '../storage.js';
import { Skeleton } from '../ui/Skeleton.js';
import { Hint } from './Hint.js';
import { TopBar } from './TopBar.js';
import { useMediaQuery } from './useMediaQuery.js';
import './app-skeleton.css';

const FALLBACK_TABS = ['Documents'];

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

function tabsOf(dock: SerializedDock, views: unknown): string[] {
  if (!Array.isArray(views)) return FALLBACK_TABS;
  const titles = views.map((id) => {
    const panel = typeof id === 'string' ? dock.panels[id] : undefined;
    return typeof panel?.title === 'string' ? panel.title : String(id);
  });
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
      <Skeleton rows={5} className="px-4" />
    </section>
  );
}

function Branch({
  nodes,
  horizontal,
  dock,
}: {
  nodes: SerializedNode[];
  horizontal: boolean;
  dock: SerializedDock;
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
                dock={dock}
              />
            ) : (
              <Leaf node={node} dock={dock} />
            )}
          </div>
        ))}
    </div>
  );
}

function Leaf({ node, dock }: { node: SerializedNode; dock: SerializedDock }) {
  const group = isRecord(node.data) ? node.data : {};
  const tabs = tabsOf(dock, group.views);
  const active =
    typeof group.activeView === 'string' && Array.isArray(group.views)
      ? Math.max(0, group.views.indexOf(group.activeView))
      : 0;
  return <Pane tabs={tabs} active={active} />;
}

export function SkeletonDock() {
  const stacked = useMediaQuery(STACKED_QUERY);
  const dock = stacked ? null : savedDock();
  const root = dock?.grid.root;
  return (
    <div className="dock-root app-skeleton">
      {dock && root && Array.isArray(root.data) ? (
        <Branch
          nodes={root.data as SerializedNode[]}
          horizontal={dock.grid.orientation === 'HORIZONTAL'}
          dock={dock}
        />
      ) : (
        <Pane tabs={FALLBACK_TABS} active={0} />
      )}
    </div>
  );
}

export function AppSkeleton() {
  const t = useT();
  const stacked = useMediaQuery(STACKED_QUERY);
  const locked = getStorageAdapter().get(
    'local',
    BSH_KEYS.preference.layoutLocked,
  );
  const home = OPEN_MODELS.read().models.length === 0;
  return (
    <>
      <TopBar />
      {!stacked && locked !== 'true' ? (
        home ? (
          <Hint id="palette">{t('hints.palette')}</Hint>
        ) : (
          <Hint id="move-panes">{t('hints.movePanes')}</Hint>
        )
      ) : null}
      <div className="app-body app-body--dock">
        <main
          id="main"
          className="app-skeleton__main"
          tabIndex={-1}
          role="status"
          aria-live="polite"
          aria-label="Loading"
        >
          <SkeletonDock />
        </main>
      </div>
    </>
  );
}
