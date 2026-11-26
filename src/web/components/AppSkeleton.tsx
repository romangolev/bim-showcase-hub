import { parseLayout } from '../layout/layoutState.js';
import { TREE_WIDTH_DEFAULT } from '../layout/paneRegistry.js';
import { BSH_KEYS, getStorageAdapter } from '../storage.js';
import { Skeleton } from '../ui/Skeleton.js';
import { TopBar } from './TopBar.js';
import './app-skeleton.css';

function savedTreeWidth(): number {
  const layout = parseLayout(
    getStorageAdapter().get('local', BSH_KEYS.personal.layout),
  );
  return layout?.treeWidth ?? TREE_WIDTH_DEFAULT;
}

export function SkeletonDock() {
  return (
    <div
      className="dock-root app-skeleton"
      style={{ ['--skeleton-tree' as string]: `${savedTreeWidth()}px` }}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <section className="app-skeleton__pane app-skeleton__tree">
        <Skeleton rows={6} className="px-4" />
      </section>
      <section className="app-skeleton__pane app-skeleton__main">
        <div className="app-skeleton__tabs" />
        <Skeleton rows={4} className="px-4" />
      </section>
    </div>
  );
}

export function AppSkeleton() {
  return (
    <>
      <TopBar />
      <div className="app-body app-body--dock">
        <SkeletonDock />
      </div>
    </>
  );
}
