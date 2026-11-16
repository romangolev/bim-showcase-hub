import { Fragment } from 'react';
import type { OpenModelsState } from '../api/openModels.js';
import { Icon } from '../components/icons.js';
import type { PaneTitles } from './layoutContext.js';
import { PANES, type PaneId, type PanelId } from './paneRegistry.js';
import { modelPanelId } from './panes.js';
import { type HostStore, PaneSlot } from './ViewerHost.js';

export interface StackedLayoutProps {
  hosts: HostStore<PanelId>;
  open: readonly PaneId[];
  titles?: PaneTitles;
  models: OpenModelsState;
  onSelectModel: (urn: string) => void;
  onCloseModel: (urn: string) => void;
  onAttach: (id: PanelId) => void;
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
    if (pane.instances) return onModel;
    if (pane.requires === 'viewer' && !onModel) return false;
    return !pane.closable || open.includes(id);
  });
}

export interface ModelSwitcherProps {
  models: OpenModelsState;
  titles: PaneTitles;
  onSelect: (urn: string) => void;
  onClose: (urn: string) => void;
}

export function ModelSwitcher({
  models,
  titles,
  onSelect,
  onClose,
}: ModelSwitcherProps) {
  if (models.models.length === 0) return null;
  return (
    <div className="stack__models" role="tablist" aria-label="Open models">
      {models.models.map(({ urn }) => {
        const title = titles[modelPanelId(urn)];
        const label = title?.label ?? urn;
        const selected = urn === models.active;
        return (
          <div
            key={urn}
            className="stack__model"
            data-active={selected}
            title={title?.tooltip}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className="stack__model-tab"
              onClick={() => onSelect(urn)}
            >
              {label}
            </button>
            <button
              type="button"
              className="stack__model-close"
              aria-label={`Close ${label}`}
              onClick={() => onClose(urn)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function StackedLayout({
  hosts,
  open,
  titles = {},
  models,
  onSelectModel,
  onCloseModel,
  onAttach,
  treeOpen,
  onCloseTree,
}: StackedLayoutProps) {
  const onModel = models.active !== null;
  if (!onModel) {
    return (
      <div className="app-body stack" data-home="true">
        <div className="app-main stack__column">
          <PaneSlot
            hosts={hosts}
            id="tree"
            onAttach={onAttach}
            className="stack__pane stack__pane--tree"
          />
        </div>
      </div>
    );
  }
  const viewerSlot = modelPanelId(models.active as string);
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
            {id === 'viewer' ? (
              <ModelSwitcher
                models={models}
                titles={titles}
                onSelect={onSelectModel}
                onClose={onCloseModel}
              />
            ) : null}
            <PaneSlot
              key={id === 'viewer' ? viewerSlot : id}
              hosts={hosts}
              id={id === 'viewer' ? viewerSlot : id}
              onAttach={onAttach}
              className={`stack__pane stack__pane--${id}`}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
