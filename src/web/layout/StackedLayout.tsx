import { Fragment } from 'react';
import type { PaneTitles } from './layoutContext.js';
import { PANES, type PaneId } from './paneRegistry.js';
import { useModelUrn } from './panes.js';
import { type HostStore, PaneSlot } from './ViewerHost.js';

export interface StackedLayoutProps {
  hosts: HostStore<PaneId>;
  open: readonly PaneId[];
  titles?: PaneTitles;
  onAttach: (id: PaneId) => void;
  treeOpen: boolean;
  onCloseTree: () => void;
}

const STACK_ORDER: readonly PaneId[] = ['viewer', 'dashboard', 'summary'];

export function stackedPanes(
  open: readonly PaneId[],
  onModel: boolean,
): PaneId[] {
  return STACK_ORDER.filter((id) => {
    const pane = PANES.find((entry) => entry.id === id);
    if (!pane) return false;
    if (!pane.closable) return true;
    if (pane.requires === 'viewer' && !onModel) return false;
    return open.includes(id);
  });
}

export function StackedLayout({
  hosts,
  open,
  titles = {},
  onAttach,
  treeOpen,
  onCloseTree,
}: StackedLayoutProps) {
  const onModel = useModelUrn() !== null;
  return (
    <div className="app-body stack">
      <div className="stack__tree" hidden={!treeOpen}>
        <PaneSlot hosts={hosts} id="tree" onAttach={onAttach} />
      </div>
      <button
        type="button"
        className="tree-backdrop"
        aria-label="Close document tree"
        tabIndex={-1}
        hidden={!treeOpen}
        onClick={onCloseTree}
      />
      <div className="app-main stack__column" inert={treeOpen}>
        {stackedPanes(open, onModel).map((id) => (
          <Fragment key={id}>
            {id === 'viewer' && titles.viewer ? (
              <h2
                className="stack__label"
                title={titles.viewer.tooltip}
                data-pane-label="viewer"
              >
                {titles.viewer.label}
              </h2>
            ) : null}
            <PaneSlot
              hosts={hosts}
              id={id}
              onAttach={onAttach}
              className={`stack__pane stack__pane--${id}`}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
