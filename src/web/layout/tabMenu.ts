import type { OpenModelsState, OpenModelsStore } from '../api/openModels.js';
import type { MenuEntry } from '../components/Menu.js';

export function modelTabEntries(
  store: Pick<OpenModelsStore, 'setView'>,
  state: OpenModelsState,
  urn: string,
): MenuEntry[] {
  const entry = state.models.find((model) => model.urn === urn);
  if (!entry) return [];
  const remember = entry.remember !== false;
  return [
    {
      id: 'tab.remember',
      label: 'Remember view state',
      description:
        'Keeps camera, section planes, explode and hidden elements when the tab is paused or the page reloads. Measurements are not kept.',
      checked: remember,
      onSelect: () => store.setView(urn, { remember: !remember }),
    },
  ];
}
