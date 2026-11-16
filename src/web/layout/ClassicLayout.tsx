import type { PaneId } from './paneRegistry.js';
import { useModelUrn } from './panes.js';
import { type HostStore, PaneSlot } from './ViewerHost.js';

export interface ClassicLayoutProps {
  hosts: HostStore<PaneId>;
  onAttach: (id: PaneId) => void;
  treeOpen: boolean;
  overlayOpen: boolean;
  onCloseTree: () => void;
  summaryCollapsed: boolean;
}

export function ClassicLayout({
  hosts,
  onAttach,
  treeOpen,
  overlayOpen,
  onCloseTree,
  summaryCollapsed,
}: ClassicLayoutProps) {
  const urn = useModelUrn();
  return (
    <div className="app-body">
      <div className="tree-slot" hidden={!treeOpen}>
        <PaneSlot hosts={hosts} id="tree" onAttach={onAttach} />
      </div>
      <button
        type="button"
        className="tree-backdrop"
        aria-label="Close document tree"
        tabIndex={-1}
        hidden={!overlayOpen}
        onClick={onCloseTree}
      />
      <div className="app-main" inert={overlayOpen}>
        {urn ? (
          <div className="model-page" data-summary-collapsed={summaryCollapsed}>
            <PaneSlot
              hosts={hosts}
              id="viewer"
              onAttach={onAttach}
              className="model-main"
            />
            <div className="model-dashboard">
              <PaneSlot hosts={hosts} id="dashboard" onAttach={onAttach} />
            </div>
            <div className="model-summary">
              <PaneSlot hosts={hosts} id="summary" onAttach={onAttach} />
            </div>
          </div>
        ) : (
          <PaneSlot
            hosts={hosts}
            id="viewer"
            onAttach={onAttach}
            className="app-main__content"
          />
        )}
      </div>
    </div>
  );
}
