import { notify } from '../tasks/notifications.js';
import {
  listSets,
  saveSelectionSet,
  selectSet,
  stableKeysFor,
} from '../viewer/selectionSets.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  goToViewpoint,
  listViewpoints,
  nextViewpointName,
  saveViewpoint,
  VIEWPOINT_MESSAGES,
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
    make(
      'invertSelection',
      'Invert selection',
      needsSelection,
      async (viewer) => {
        const selected = new Set(
          viewer
            .getModelSelection()
            .map(({ modelId, dbId }) => `${modelId}:${dbId}`),
        );
        const visible = await viewer.getVisible();
        viewer.selectModelIds(
          visible.filter(
            ({ modelId, dbId }) => !selected.has(`${modelId}:${dbId}`),
          ),
        );
      },
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
    make('saveSet', 'Save selection as set', needsSelection, async (viewer) => {
      const name = `Selection ${listSets().length + 1}`;
      const items = viewer.getModelSelection();
      const result = saveSelectionSet(
        name,
        items,
        await stableKeysFor(viewer, items),
      );
      notify(
        result === 'ok'
          ? `Saved the selection set "${name}"`
          : 'Could not save the selection set',
        { tone: result === 'ok' ? 'success' : 'error' },
      );
    }),
    make('saveViewpoint', 'Save viewpoint', noModel, (viewer) => {
      const name = nextViewpointName();
      const result = saveViewpoint(name, viewer.getState());
      notify(result === 'ok' ? `Saved ${name}` : VIEWPOINT_MESSAGES[result], {
        tone: result === 'ok' ? 'success' : 'error',
      });
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
        async (viewer) => {
          await selectSet(viewer, set.id);
        },
      ),
    ),
    make('resetPaint', 'Reset appearance', noModel, (viewer) =>
      viewer.clearThemingColors(),
    ),
  ];
}
