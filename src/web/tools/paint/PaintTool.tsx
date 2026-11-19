import type { FormDefinition } from '../../components/SettingsForm.js';
import {
  DEFAULT_PAINT_INTENSITY,
  DEFAULT_PAINT_PALETTE,
  MAX_PAINT_SWATCHES,
  NEW_SWATCH_COLOR,
  PALETTE_ICON,
  paintSelection,
  paletteToPresets,
  RESET_PAINT_LABEL,
  resetPaint,
} from '../../extensions/paintBrushes.js';
import type { Rgba, ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import {
  type ToolContext,
  type ToolContribution,
  ViewerTool,
} from '../kernel/ViewerTool.js';
import { PAINT_SETTINGS, type PaintSettings } from './paintSettings.js';

export const PAINT_TOOLTIP = 'Paint selection';
export const PAINT_SELECT_HINT = 'Select elements to paint';
export const PAINT_RESET_HINT = 'Nothing painted yet';

export const PAINT_FORM: FormDefinition<PaintSettings> = {
  title: 'Paint palette',
  intro: 'The swatches in the viewer toolbar paint menu follow this palette.',
  fields: [
    {
      key: 'palette',
      kind: 'list',
      label: 'Swatches',
      itemType: 'color',
      newItem: NEW_SWATCH_COLOR,
      min: 1,
      max: MAX_PAINT_SWATCHES,
      addLabel: 'Add swatch',
      itemLabel: (index) => `Swatch ${index + 1}`,
      removeLabel: (index) => `Remove swatch ${index + 1}`,
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
      hint: 'Non-isolated elements stay visible but faded. Off hides them.',
    },
  ],
  reset: {
    label: 'Reset palette',
    patch: {
      palette: [...DEFAULT_PAINT_PALETTE],
      intensity: DEFAULT_PAINT_INTENSITY,
      ghostRest: false,
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
    adapter.setGhosting?.(settings.ghostRest);
    return {
      paint: {
        id: ctx.id('paint'),
        tooltip: PAINT_TOOLTIP,
        swatches: paletteToPresets(settings.palette, settings.intensity).map(
          (preset) => ({
            id: ctx.id(preset.id),
            icon: PALETTE_ICON,
            label: preset.label,
            swatch: preset.swatch,
            color: preset.color,
          }),
        ),
        reset: { id: ctx.id('paint-reset'), label: RESET_PAINT_LABEL },
        selectHint: PAINT_SELECT_HINT,
        resetHint: PAINT_RESET_HINT,
        onPaint: (color: Rgba) => paintSelection(adapter, color),
        onReset: () => resetPaint(adapter),
      },
    };
  }

  override toolbarSignature(settings: PaintSettings): unknown {
    return [
      settings.enabled,
      settings.palette,
      settings.intensity,
      settings.ghostRest,
    ];
  }

  override onDisabled(adapter: ViewerAdapter): void {
    adapter.setGhosting?.(false);
    resetPaint(adapter);
  }
}
