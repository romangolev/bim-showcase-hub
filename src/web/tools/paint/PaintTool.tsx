import {
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
import { PaintFields } from './PaintFields.js';
import { PAINT_SETTINGS, type PaintSettings } from './paintSettings.js';

export const PAINT_TOOLTIP = 'Paint selection';
export const PAINT_SELECT_HINT = 'Select elements to paint';
export const PAINT_RESET_HINT = 'Nothing painted yet';

export class PaintTool extends ViewerTool<PaintSettings> {
  readonly id = 'paint';
  readonly title = 'Paint brushes';
  readonly description =
    'Colour the selected elements from the viewer toolbar.';
  readonly settings = PAINT_SETTINGS;
  readonly legacy = {
    fields: ['paintBrushes', 'paintPalette', 'paintIntensity'],
    read: (blob: Record<string, unknown>) => ({
      enabled: blob.paintBrushes,
      palette: blob.paintPalette,
      intensity: blob.paintIntensity,
    }),
  };

  contribute(ctx: ToolContext, settings: PaintSettings): ToolContribution {
    const { adapter } = ctx;
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
    return [settings.enabled, settings.palette, settings.intensity];
  }

  override onDisabled(adapter: ViewerAdapter): void {
    resetPaint(adapter);
  }

  protected override renderFields() {
    return <PaintFields />;
  }
}
