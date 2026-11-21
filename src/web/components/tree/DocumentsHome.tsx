import { useSyncExternalStore } from 'react';
import type { ModelContext } from '../../api/modelContext.js';
import {
  listRecentModels,
  modelStoreVersion,
  recallModel,
  subscribeModelStore,
} from '../../api/modelStore.js';
import { useT } from '../../i18n/i18n.js';
import { ModelSets } from '../../panels/ModelSets.js';
import { PANE_SETTINGS } from '../../settings/paneSettings.js';
import { usePersisted } from '../../storage.js';
import { useSelectionSets } from '../../viewer/selectionSets.js';
import { Icon } from '../icons.js';
import { Menu, type MenuEntry } from '../Menu.js';
import { StateBlock } from '../StateBlock.js';
import type { PickedModel } from './DocumentTree.js';
import { usePins } from './pins.js';
import { RecentStrip } from './RecentStrip.js';
import type { ModelOpeners } from './useModelOpeners.js';

interface DocumentsHomeProps {
  selectedUrn?: string;
  openers: ModelOpeners;
}

function documentsOfSet(modelIds: readonly string[]): PickedModel[] {
  return [...new Set(modelIds)].map((urn) => ({
    urn,
    context: recallModel(urn) ?? {},
  }));
}

export function DocumentsHome({ selectedUrn, openers }: DocumentsHomeProps) {
  const [view, setView] = usePersisted(PANE_SETTINGS.tree.view);
  const sets = useSelectionSets();
  const t = useT();
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
      label: t('documents.showPinned'),
      checked: view.homePinned,
      onSelect: () => setView({ ...view, homePinned: !view.homePinned }),
    },
    {
      id: 'home-recent',
      label: t('documents.showRecent'),
      checked: view.homeRecent,
      onSelect: () => setView({ ...view, homeRecent: !view.homeRecent }),
    },
    {
      id: 'home-sets',
      label: t('documents.showSets'),
      checked: view.homeSets,
      onSelect: () => setView({ ...view, homeSets: !view.homeSets }),
    },
    {
      id: 'home-model-sets',
      label: t('documents.showModelSets'),
      checked: view.homeModelSets,
      onSelect: () => setView({ ...view, homeModelSets: !view.homeModelSets }),
    },
  ];

  const openSet = (modelIds: readonly string[]) => {
    const models = documentsOfSet(modelIds);
    const [first] = models;
    if (!first) return;
    if (models.length > 1) openers.openTabs(models);
    else openers.open(first.urn, first.context);
  };

  return (
    <section className="docs-home" aria-label={t('documents.homeAria')}>
      <div className="docs-home__head">
        <h3 className="docs-home__title">{t('documents.homeTitle')}</h3>
        <Menu
          label={t('documents.homeSections')}
          title={t('documents.chooseHomeSections')}
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
            title={t('documents.emptyTitle')}
            titleAs="h3"
            message={t('documents.emptyMessage')}
            compact
          />
        ) : (
          <>
            {view.homePinned || view.homeRecent ? (
              <RecentStrip
                variant="home"
                selectedUrn={selectedUrn}
                onOpen={openers.open}
                onOpenModal={openers.openModal}
                addTarget={openers.addTarget}
                show={{ pinned: view.homePinned, recent: view.homeRecent }}
              />
            ) : null}
            {view.homeSets ? (
              <section
                aria-label={t('documents.selectionSets')}
                className="docs-home__section"
              >
                <h3 className="docs-home__heading">
                  {t('documents.selectionSets')}
                </h3>
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
                            {set.items.length === 1
                              ? t('documents.oneElement', {
                                  count: set.items.length,
                                })
                              : t('documents.manyElements', {
                                  count: set.items.length,
                                })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="docs-home__empty">{t('documents.noSets')}</p>
                )}
              </section>
            ) : null}
            {view.homeModelSets ? <ModelSets openers={openers} /> : null}
          </>
        )}
      </div>
    </section>
  );
}
