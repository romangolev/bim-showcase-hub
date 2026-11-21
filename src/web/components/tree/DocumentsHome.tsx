import { useSyncExternalStore } from 'react';
import type { ModelContext } from '../../api/modelContext.js';
import {
  listRecentModels,
  modelStoreVersion,
  recallModel,
  subscribeModelStore,
} from '../../api/modelStore.js';
import { PANE_SETTINGS } from '../../settings/paneSettings.js';
import { usePersisted } from '../../storage.js';
import { useSelectionSets } from '../../viewer/selectionSets.js';
import { Icon } from '../icons.js';
import { Menu, type MenuEntry } from '../Menu.js';
import { StateBlock } from '../StateBlock.js';
import type { AddTarget, PickedModel } from './DocumentTree.js';
import { usePins } from './pins.js';
import { RecentStrip } from './RecentStrip.js';

interface DocumentsHomeProps {
  selectedUrn?: string;
  onOpen: (urn: string, context: ModelContext) => void;
  onOpenModal?: (urn: string, context: ModelContext) => void;
  onOpenTabs?: (models: PickedModel[]) => void;
  addTarget?: AddTarget | null;
}

function documentsOfSet(modelIds: readonly string[]): PickedModel[] {
  return [...new Set(modelIds)].map((urn) => ({
    urn,
    context: recallModel(urn) ?? {},
  }));
}

export function DocumentsHome({
  selectedUrn,
  onOpen,
  onOpenModal,
  onOpenTabs,
  addTarget,
}: DocumentsHomeProps) {
  const [view, setView] = usePersisted(PANE_SETTINGS.tree.view);
  const sets = useSelectionSets();
  useSyncExternalStore(
    subscribeModelStore,
    modelStoreVersion,
    modelStoreVersion,
  );
  const { pins } = usePins();
  const fresh =
    listRecentModels().length === 0 && pins.length === 0 && sets.length === 0;

  const entries = (): MenuEntry[] => [
    {
      id: 'home-pinned',
      label: 'Show pinned',
      checked: view.homePinned,
      onSelect: () => setView({ ...view, homePinned: !view.homePinned }),
    },
    {
      id: 'home-recent',
      label: 'Show recent',
      checked: view.homeRecent,
      onSelect: () => setView({ ...view, homeRecent: !view.homeRecent }),
    },
    {
      id: 'home-sets',
      label: 'Show selection sets',
      checked: view.homeSets,
      onSelect: () => setView({ ...view, homeSets: !view.homeSets }),
    },
  ];

  const openSet = (modelIds: readonly string[]) => {
    const models = documentsOfSet(modelIds);
    const [first] = models;
    if (!first) return;
    if (onOpenTabs && models.length > 1) onOpenTabs(models);
    else onOpen(first.urn, first.context);
  };

  return (
    <section className="docs-home" aria-label="Documents home">
      <div className="docs-home__head">
        <h3 className="docs-home__title">Home</h3>
        <Menu
          label="Home sections"
          title="Choose home sections"
          trigger={<Icon name="settings" size={14} />}
          triggerClassName="doc-tree__view"
          items={entries}
        />
      </div>
      <div className="docs-home__scroll">
        {fresh ? (
          <StateBlock
            variant="empty"
            icon="folder"
            title="Pick a file to start"
            titleAs="h3"
            message="Below, choose a hub, then a project and a folder, and select a version to open it in the viewer."
            compact
          />
        ) : (
          <>
            {view.homePinned || view.homeRecent ? (
              <RecentStrip
                variant="home"
                selectedUrn={selectedUrn}
                onOpen={onOpen}
                onOpenModal={onOpenModal}
                addTarget={addTarget}
                show={{ pinned: view.homePinned, recent: view.homeRecent }}
              />
            ) : null}
            {view.homeSets ? (
              <section
                aria-label="Selection sets"
                className="docs-home__section"
              >
                <h3 className="docs-home__heading">Selection sets</h3>
                {sets.length > 0 ? (
                  <ul className="docs-home__list">
                    {sets.map((set) => (
                      <li key={set.id}>
                        <button
                          type="button"
                          className="docs-home__set"
                          onClick={() =>
                            openSet(set.items.map((item) => item.modelId))
                          }
                        >
                          <span className="docs-home__set-name">
                            {set.name}
                          </span>
                          <span className="docs-home__set-meta">
                            {set.items.length}{' '}
                            {set.items.length === 1 ? 'element' : 'elements'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="docs-home__empty">
                    Save a selection in the viewer to see it here.
                  </p>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
