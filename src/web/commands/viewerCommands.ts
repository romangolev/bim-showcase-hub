import {
  listSets,
  saveSelectionSet,
  selectSet,
} from '../viewer/selectionSets.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  goToViewpoint,
  listViewpoints,
  nextViewpointName,
  saveViewpoint,
} from '../viewer/viewpoints.js';
import type { Command } from './types.js';

export const NO_MODEL_REASON = 'Open a model first';
export const NO_SELECTION_REASON = 'Select elements first';

export function viewerCommands(adapter: ViewerAdapter | null): Command[] {
  const noModel = adapter ? undefined : NO_MODEL_REASON;
  const needsSelection =
    noModel ??
    (adapter && adapter.getModelSelection().length === 0
      ? NO_SELECTION_REASON
      : undefined);
  const make = (
    id: string,
    title: string,
    disabled: string | undefined,
    run: (viewer: ViewerAdapter) => void | Promise<void>,
  ): Command => ({
    id: `viewer.${id}`,
    title,
    group: 'Viewer',
    ...(disabled ? { disabled } : {}),
    run: () => (adapter ? run(adapter) : undefined),
  });
  return [
    make('selectAll', 'Select all visible elements', noModel, async (viewer) =>
      viewer.selectModelIds(await viewer.getVisible()),
    ),
    make('isolate', 'Isolate selection', needsSelection, (viewer) =>
      viewer.isolateModelIds(viewer.getModelSelection()),
    ),
    make('hide', 'Hide selection', needsSelection, (viewer) =>
      viewer.hideModelIds(viewer.getModelSelection()),
    ),
    make('showAll', 'Show all elements', noModel, (viewer) => viewer.showAll()),
    make('clearSelection', 'Clear selection', noModel, (viewer) =>
      viewer.clearSelection(),
    ),
    make('fit', 'Zoom to selection', needsSelection, (viewer) =>
      viewer.fitToView(),
    ),
    make('saveSet', 'Save selection as set', needsSelection, (viewer) => {
      saveSelectionSet(
        `Selection ${listSets().length + 1}`,
        viewer.getModelSelection(),
      );
    }),
    make('saveViewpoint', 'Save viewpoint', noModel, (viewer) => {
      saveViewpoint(nextViewpointName(), viewer.getState());
    }),
    ...listViewpoints().map((point) =>
      make(
        `viewpoint.${point.id}`,
        `Go to viewpoint ${point.name}`,
        noModel,
        async (viewer) => {
          await goToViewpoint(viewer, point.id);
        },
      ),
    ),
    ...listSets().map((set) =>
      make(
        `selectSet.${set.id}`,
        `Select set ${set.name}`,
        noModel,
        (viewer) => {
          selectSet(viewer, set.id);
        },
      ),
    ),
    make('resetPaint', 'Reset appearance', noModel, (viewer) =>
      viewer.clearThemingColors(),
    ),
  ];
}
