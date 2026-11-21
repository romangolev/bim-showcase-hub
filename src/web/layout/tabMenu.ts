import type { OpenModelsState, OpenModelsStore } from '../api/openModels.js';
import type { MenuEntry } from '../components/Menu.js';

export function modelTabEntries(
  store: Pick<
    OpenModelsStore,
    'setView' | 'closeOthers' | 'reopenClosed' | 'canReopen'
  >,
  state: OpenModelsState,
  urn: string,
): MenuEntry[] {
  const entry = state.models.find((model) => model.urn === urn);
  if (!entry) return [];
  const remember = entry.remember !== false;
  const pinned = entry.pinned === true;
  const others = state.models.filter(
    (model) => model.urn !== urn && !model.pinned,
  ).length;
  const canReopen = store.canReopen();
  return [
    {
      id: 'tab.remember',
      label: 'Remember view state',
      description:
        'Keeps camera, section planes, explode and hidden elements when the tab is paused or the page reloads. Measurements are not kept.',
      checked: remember,
      onSelect: () => store.setView(urn, { remember: !remember }),
    },
    {
      id: 'tab.pin',
      label: 'Pin tab',
      description:
        'Pinned tabs count toward the memory budget but are never paused.',
      checked: pinned,
      onSelect: () => store.setView(urn, { pinned: !pinned }),
    },
    {
      id: 'tab.closeOthers',
      label: 'Close other tabs',
      description:
        others > 0
          ? 'Keeps this tab and every pinned tab.'
          : 'No other unpinned tabs',
      ...(others > 0 ? {} : { disabled: true }),
      onSelect: () => store.closeOthers(urn),
    },
    {
      id: 'tab.reopen',
      label: 'Reopen closed tab',
      description: canReopen
        ? 'Restores the most recently closed tab with its view state.'
        : 'No closed tabs',
      ...(canReopen ? {} : { disabled: true }),
      onSelect: () => {
        store.reopenClosed();
      },
    },
  ];
}
