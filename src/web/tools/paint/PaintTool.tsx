import { useMemo, useState } from 'react';
import { formatShortcut } from '../../commands/shortcuts.js';
import {
  resetViewerShortcuts,
  VIEWER_SHORTCUT_KEYS,
  viewerShortcuts,
} from '../../commands/viewerShortcutMap.js';
import type { FormDefinition } from '../../components/SettingsForm.js';
import { SettingsForm } from '../../components/SettingsForm.js';
import {
  DEFAULT_PAINT_INTENSITY,
  DEFAULT_PAINT_PALETTE,
  DEFAULT_PAINT_PALETTE_ID,
  MAX_PAINT_SWATCHES,
  NEW_SWATCH_COLOR,
  PAINT_PALETTES,
  PALETTE_ICON,
  paletteToPresets,
  RESET_PAINT_LABEL,
  resetPaint,
  resolvePaintPalette,
} from '../../extensions/paintBrushes.js';
import { usePersisted } from '../../storage.js';
import { Button } from '../../ui/Button.js';
import { usePublishedAdapter } from '../../viewer/activeAdapterStore.js';
import { claimGhosting, releaseGhosting } from '../../viewer/ghosting.js';
import type { Rgba, ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import {
  type ToolContext,
  type ToolContribution,
  ViewerTool,
} from '../kernel/ViewerTool.js';
import {
  canRedoPaint,
  canUndoPaint,
  clearPaintState,
  DEFAULT_HISTORY_DEPTH,
  forgetAppliedPaint,
  MAX_HISTORY_DEPTH,
  MAX_HISTORY_ENTRIES,
  paintHistoryEntries,
  paintSwatch,
  recordPaint,
  redoPaint,
  replayPaint,
  undoPaint,
} from './paintHistory.js';
import { PAINT_SETTINGS, type PaintSettings } from './paintSettings.js';

export const PAINT_TOOLTIP = 'Paint selection';
export const PAINT_SELECT_HINT = 'Select elements to paint';
export const PAINT_RESET_HINT = 'Nothing painted yet';

export const PAINT_FORM: FormDefinition<PaintSettings> = {
  title: 'Paint palette',
  intro: 'The swatches in the viewer toolbar paint menu follow this palette.',
  fields: [
    {
      key: 'paletteId',
      kind: 'select',
      label: 'Palette',
      options: PAINT_PALETTES.map((palette) => ({
        value: palette.id,
        label: palette.label,
      })),
      hint: 'Okabe–Ito and Viridis stay distinguishable with common colour-vision deficiencies. High contrast favours strong light and dark pairs.',
    },
    {
      key: 'palette',
      kind: 'list',
      label: 'Custom swatches',
      itemType: 'color',
      newItem: NEW_SWATCH_COLOR,
      min: 1,
      max: MAX_PAINT_SWATCHES,
      addLabel: 'Add swatch',
      itemLabel: (index) => `Swatch ${index + 1}`,
      removeLabel: (index) => `Remove swatch ${index + 1}`,
      hint: 'These swatches are used when the palette is Custom swatches.',
    },
    {
      key: 'intensity',
      kind: 'number',
      label: 'Intensity',
      min: 0.1,
      max: 1,
      slider: { step: 0.05, format: (value) => `${Math.round(value * 100)}%` },
      hint: "How strongly the colour replaces the model's own colour. This is theming intensity, not transparency.",
    },
    {
      key: 'ghostRest',
      kind: 'toggle',
      label: 'Ghost the rest when isolating',
      hint: 'Non-isolated elements stay visible but faded. Off hides non-isolated elements instead of fading them.',
    },
    {
      key: 'restoreOnOpen',
      kind: 'toggle',
      label: 'Restore paint on open',
      hint: 'Repaint a model with its saved colours when it finishes loading. Off keeps the saved history but does not apply it.',
    },
    {
      key: 'historyDepth',
      kind: 'number',
      label: 'History depth',
      min: 1,
      max: MAX_HISTORY_DEPTH,
      hint: `How many paint actions each model remembers for undo. Default ${DEFAULT_HISTORY_DEPTH}.`,
    },
  ],
  reset: {
    label: 'Reset palette',
    patch: {
      paletteId: DEFAULT_PAINT_PALETTE_ID,
      palette: [...DEFAULT_PAINT_PALETTE],
      intensity: DEFAULT_PAINT_INTENSITY,
      ghostRest: true,
      restoreOnOpen: true,
      historyDepth: DEFAULT_HISTORY_DEPTH,
    },
  },
};

export class PaintTool extends ViewerTool<PaintSettings> {
  readonly id = 'paint';
  readonly title = 'Paint brushes';
  readonly description =
    'Colour the selected elements from the viewer toolbar.';
  readonly settings = PAINT_SETTINGS;
  readonly form = PAINT_FORM;

  contribute(ctx: ToolContext, settings: PaintSettings): ToolContribution {
    const { adapter } = ctx;
    return {
      paint: {
        id: ctx.id('paint'),
        tooltip: PAINT_TOOLTIP,
        swatches: paletteToPresets(
          resolvePaintPalette(settings.paletteId, settings.palette),
          settings.intensity,
        ).map((preset) => ({
          id: ctx.id(preset.id),
          icon: PALETTE_ICON,
          label: preset.label,
          swatch: preset.swatch,
          color: preset.color,
        })),
        reset: { id: ctx.id('paint-reset'), label: RESET_PAINT_LABEL },
        selectHint: PAINT_SELECT_HINT,
        resetHint: PAINT_RESET_HINT,
        onPaint: (color: Rgba) =>
          recordPaint(adapter, color, settings.historyDepth),
        onReset: () => clearPaintState(adapter),
      },
    };
  }

  override toolbarSignature(settings: PaintSettings): unknown {
    return [
      settings.enabled,
      settings.paletteId,
      settings.palette,
      settings.intensity,
      settings.ghostRest,
    ];
  }

  override onModelsReady(
    adapter: ViewerAdapter,
    settings: PaintSettings,
  ): void {
    if (!settings.enabled || !settings.restoreOnOpen) {
      forgetAppliedPaint(adapter);
      return;
    }
    replayPaint(adapter).catch(() => {});
  }

  override onSettingsChanged(
    adapter: ViewerAdapter,
    previous: PaintSettings | undefined,
    next: PaintSettings,
  ): void {
    if (next.enabled && !next.ghostRest) releaseGhosting(adapter, 'paint');
    else claimGhosting(adapter, 'paint');
    if (!next.enabled) return;
    if (!previous?.enabled && next.restoreOnOpen) {
      replayPaint(adapter).catch(() => {});
    }
  }

  protected override renderFields() {
    return <PaintFields />;
  }

  override onDisabled(adapter: ViewerAdapter): void {
    forgetAppliedPaint(adapter);
    resetPaint(adapter);
  }
}

function PaintFields() {
  const [settings, setSettings] = usePersisted(PAINT_SETTINGS);
  const [shortcutOverrides] = usePersisted(VIEWER_SHORTCUT_KEYS);
  const shortcuts = viewerShortcuts(shortcutOverrides);
  const adapter = usePublishedAdapter();
  const [revision, setRevision] = useState(0);
  const history = useMemo(
    () => (adapter ? paintHistoryEntries(adapter, MAX_HISTORY_ENTRIES) : []),
    [adapter, revision],
  );
  const undoable = useMemo(
    () => (adapter ? canUndoPaint(adapter) : false),
    [adapter, revision],
  );
  const redoable = useMemo(
    () => (adapter ? canRedoPaint(adapter) : false),
    [adapter, revision],
  );
  const presets = paletteToPresets(
    resolvePaintPalette(settings.paletteId, settings.palette),
    settings.intensity,
  );
  const apply = (run: (target: ViewerAdapter) => boolean) => {
    if (!adapter) return;
    run(adapter);
    setRevision((value) => value + 1);
  };
  return (
    <>
      <SettingsForm
        form={PAINT_FORM}
        value={settings}
        onChange={(patch) =>
          setSettings((current) => ({ ...current, ...patch }))
        }
      />
      <section className="settings__section" aria-label="Active palette">
        <h3 className="settings__heading">Active palette</h3>
        <ul className="settings__palette">
          {presets.map((preset) => (
            <li key={preset.id} className="settings__palette-item">
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: preset.swatch,
                  boxShadow: 'inset 0 0 0 0.5px currentColor',
                }}
              />
              <span>{preset.marker}</span>
              <span>{preset.colorName}</span>
            </li>
          ))}
        </ul>
        <p className="settings__hint">
          Swatches are numbered in the settings and in the viewer toolbar
          tooltip, so colour is not the only cue.
        </p>
      </section>
      <section className="settings__section" aria-label="Paint history">
        <h3 className="settings__heading">Paint history</h3>
        {adapter ? (
          <>
            <div className="settings__actions">
              <Button disabled={!undoable} onClick={() => apply(undoPaint)}>
                Undo paint
              </Button>
              <Button disabled={!redoable} onClick={() => apply(redoPaint)}>
                Redo paint
              </Button>
            </div>
            {history.length > 0 ? (
              <ul className="settings__palette">
                {history.map((entry) => (
                  <li key={entry.action} className="settings__palette-item">
                    <span
                      aria-hidden="true"
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: paintSwatch(entry.rgba),
                        boxShadow: 'inset 0 0 0 0.5px currentColor',
                      }}
                    />
                    <span>
                      {entry.count === 1
                        ? '1 element'
                        : `${entry.count} elements`}
                    </span>
                    <span className="settings__entry-state">
                      {entry.models === 1
                        ? '1 model'
                        : `${entry.models} models`}
                    </span>
                    <span className="settings__entry-state">
                      {new Date(entry.at).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="settings__hint">No paint actions yet.</p>
            )}
          </>
        ) : (
          <p className="settings__hint">
            Open a model to see and undo its paint history.
          </p>
        )}
      </section>
      <section className="settings__section" aria-label="Viewer shortcuts">
        <h3 className="settings__heading">Viewer shortcuts</h3>
        <ul className="settings__readout">
          {shortcuts.map((shortcut) => (
            <li key={shortcut.command} className="settings__readout-row">
              <span>{shortcut.label}</span>
              <kbd className="settings__readout-name">
                {formatShortcut(shortcut.keys)}
              </kbd>
            </li>
          ))}
        </ul>
        <div className="settings__actions">
          <Button onClick={() => resetViewerShortcuts()}>
            Reset shortcuts
          </Button>
        </div>
        <p className="settings__hint">
          Isolate, hide, show all and invert use plain keys only while the
          viewer has focus. Change keys in Settings &gt; Shortcuts.
        </p>
      </section>
    </>
  );
}
