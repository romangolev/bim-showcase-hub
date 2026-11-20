import {
  hexToRgba,
  paintSelection,
  resetPaint,
  resolvePaintPalette,
} from '../extensions/paintBrushes.js';
import { notify } from '../tasks/notifications.js';
import { PAINT_SETTINGS } from '../tools/paint/paintSettings.js';
import { listSets, saveSelectionSet } from '../viewer/selectionSets.js';
import { selectSet, stableKeysFor } from '../viewer/setResolution.js';
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

interface ViewerShortcut {
  command: string;
  keys: string;
  label: string;
}

export const VIEWER_SHORTCUTS: readonly ViewerShortcut[] = [
  {
    command: 'viewer.isolate',
    keys: 'mod+alt+i',
    label: 'Isolate selection',
  },
  { command: 'viewer.hide', keys: 'mod+alt+h', label: 'Hide selection' },
  {
    command: 'viewer.showAll',
    keys: 'mod+alt+shift+h',
    label: 'Show all elements',
  },
  {
    command: 'viewer.invertSelection',
    keys: 'mod+alt+shift+i',
    label: 'Invert selection',
  },
  {
    command: 'viewer.paint',
    keys: 'mod+alt+b',
    label: 'Paint selection with the first swatch',
  },
  {
    command: 'viewer.resetPaint',
    keys: 'mod+alt+shift+r',
    label: 'Reset appearance',
  },
];

const SHORTCUT_KEYS = new Map(
  VIEWER_SHORTCUTS.map((shortcut) => [shortcut.command, shortcut.keys]),
);

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
  ): Command => {
    const commandId = `viewer.${id}`;
    const keys = SHORTCUT_KEYS.get(commandId);
    return {
      id: commandId,
      title,
      group: 'Viewer',
      ...(keys ? { keys: [keys] } : {}),
      ...(disabled ? { disabled } : {}),
      run: () => (adapter ? run(adapter) : undefined),
    };
  };
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
    make(
      'paint',
      'Paint selection with the first swatch',
      needsSelection,
      (viewer) => {
        const settings = PAINT_SETTINGS.read();
        const [first] = resolvePaintPalette(
          settings.paletteId,
          settings.palette,
        );
        if (first) paintSelection(viewer, hexToRgba(first, settings.intensity));
      },
    ),
    make('resetPaint', 'Reset appearance', noModel, (viewer) =>
      resetPaint(viewer),
    ),
  ];
}
