import { Fragment, type KeyboardEvent, useEffect, useRef } from 'react';
import type { OpenModelsState } from '../api/openModels.js';
import { Icon } from '../components/icons.js';
import { Drawer, DrawerBody } from '../ui/Drawer.js';
import { Tab, Tabs, TabsList } from '../ui/Tabs.js';
import type { PaneTags, PaneTitles } from './layoutContext.js';
import { modelPanelId } from './panelIds.js';
import {
  isFollower,
  type PaneId,
  type PanelId,
  paneKind,
  stackablePanes,
} from './paneRegistry.js';
import { type HostStore, PaneSlot } from './ViewerHost.js';

export interface StackedLayoutProps {
  hosts: HostStore<PanelId>;
  open: readonly PaneId[];
  titles?: PaneTitles;
  tags?: PaneTags;
  models: OpenModelsState;
  onSelectModel: (urn: string) => void;
  onCloseModel: (urn: string) => void;
  onAttach: (id: PanelId) => void;
  onVisibility?: (id: PanelId, visible: boolean) => void;
  treeOpen: boolean;
  onCloseTree: () => void;
  userPanels?: readonly PanelId[];
}

export function stackedPanes(
  open: readonly PaneId[],
  onModel: boolean,
): PaneId[] {
  return stackablePanes()
    .filter((pane) => {
      if (pane.instances) return onModel;
      if (isFollower(pane.id) && !onModel) return false;
      return !pane.closable || open.includes(pane.id);
    })
    .map((pane) => pane.id);
}

export interface ModelSwitcherProps {
  models: OpenModelsState;
  titles: PaneTitles;
  tags?: PaneTags;
  onSelect: (urn: string) => void;
  onClose: (urn: string) => void;
}

export const STACK_MODEL_PANEL = 'stack-model-panel';

export function stackTabId(index: number): string {
  return `stack-model-tab-${index}`;
}

export function ModelSwitcher({
  models,
  titles,
  tags = {},
  onSelect,
  onClose,
}: ModelSwitcherProps) {
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef(false);
  const active = models.active;
  useEffect(() => {
    if (!refocus.current || !active) return;
    refocus.current = false;
    tabs.current.get(active)?.focus();
  }, [active]);
  if (models.models.length === 0) return null;
  const labelOf = (urn: string) => titles[modelPanelId(urn)]?.label ?? urn;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const urn = (event.target as HTMLElement).dataset.urn;
    if (!urn || event.key !== 'Delete') return;
    event.preventDefault();
    refocus.current = true;
    onClose(urn);
  };
  return (
    <Tabs
      className="stack__models"
      value={active}
      onValueChange={(urn) => onSelect(urn as string)}
    >
      <TabsList
        className="stack__tabs"
        aria-label="Open models"
        activateOnFocus
        onKeyDown={onKeyDown}
      >
        {models.models.map(({ urn }, index) => (
          <Tab
            key={urn}
            ref={(element) => {
              if (element) tabs.current.set(urn, element);
              else tabs.current.delete(urn);
            }}
            value={urn}
            variant="outline"
            id={stackTabId(index)}
            aria-controls={STACK_MODEL_PANEL}
            aria-keyshortcuts="Delete"
            className="stack__model-tab"
            data-urn={urn}
            data-tag={tags[modelPanelId(urn)]}
            title={titles[modelPanelId(urn)]?.tooltip}
          >
            {labelOf(urn)}
          </Tab>
        ))}
      </TabsList>
      {active ? (
        <button
          type="button"
          className="stack__model-close"
          aria-label={`Close ${labelOf(active)}`}
          title={`Close ${labelOf(active)}`}
          onClick={() => onClose(active)}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </Tabs>
  );
}

export function StackedLayout({
  hosts,
  open,
  titles = {},
  tags = {},
  models,
  onSelectModel,
  onCloseModel,
  onAttach,
  onVisibility,
  treeOpen,
  onCloseTree,
  userPanels = [],
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
      <Drawer className="stack__tree" hidden={!treeOpen}>
        <DrawerBody className="stack__tree-body">
          <PaneSlot hosts={hosts} id="tree" onAttach={onAttach} />
        </DrawerBody>
      </Drawer>
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
                tags={tags}
                onSelect={onSelectModel}
                onClose={onCloseModel}
              />
            ) : null}
            {id === 'viewer' ? (
              <div
                id={STACK_MODEL_PANEL}
                role="tabpanel"
                aria-labelledby={stackTabId(
                  models.models.findIndex(({ urn }) => urn === models.active),
                )}
                className="stack__panel"
              >
                <PaneSlot
                  key={viewerSlot}
                  hosts={hosts}
                  id={viewerSlot}
                  onAttach={onAttach}
                  onVisibility={onVisibility}
                  className="stack__pane stack__pane--viewer"
                />
              </div>
            ) : (
              <PaneSlot
                key={id}
                hosts={hosts}
                id={id}
                onAttach={onAttach}
                onVisibility={onVisibility}
                className={`stack__pane stack__pane--${id}`}
              />
            )}
          </Fragment>
        ))}
        {userPanels.map((id) => (
          <PaneSlot
            key={id}
            hosts={hosts}
            id={id}
            onAttach={onAttach}
            onVisibility={onVisibility}
            className={`stack__pane stack__pane--${paneKind(id)}`}
          />
        ))}
      </div>
    </div>
  );
}
