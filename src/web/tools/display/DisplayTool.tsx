import type { FormDefinition } from '../../components/SettingsForm.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { type ToolContribution, ViewerTool } from '../kernel/ViewerTool.js';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS,
  type DisplayToolSettings,
  displaySettingsOf,
  LIGHT_PRESETS,
} from './displaySettings.js';

export const DISPLAY_FORM: FormDefinition<DisplayToolSettings> = {
  title: 'Viewer display',
  intro:
    'Lighting, shadows, edges and rendering quality of the active viewer. Options this viewer build does not offer stay unchanged.',
  fields: [
    {
      key: 'lightPreset',
      kind: 'select',
      label: 'Light preset',
      options: [
        { value: '', label: 'Model default' },
        ...LIGHT_PRESETS.map((preset) => ({
          value: String(preset.value),
          label: preset.label,
        })),
      ],
      hint: 'A light preset carries its own background, so the app theme still owns the page around the viewer.',
    },
    {
      key: 'groundShadow',
      kind: 'toggle',
      label: 'Ground shadow',
      hint: 'Not available on 2D sheets.',
    },
    {
      key: 'groundReflection',
      kind: 'toggle',
      label: 'Ground reflection',
      hint: 'Not available on 2D sheets.',
    },
    {
      key: 'edges',
      kind: 'toggle',
      label: 'Edges',
      hint: 'Draws edge topology where the model has it.',
    },
    {
      key: 'ambientOcclusion',
      kind: 'toggle',
      label: 'Ambient occlusion',
      hint: 'Darker creases and corners. Costs frame time on large models.',
    },
    {
      key: 'antialiasing',
      kind: 'toggle',
      label: 'Antialiasing',
      hint: 'Smoother diagonals. Costs frame time on large models.',
    },
    {
      key: 'performance',
      kind: 'toggle',
      label: 'Optimise navigation',
      hint: 'Turns antialiasing and ambient occlusion off while the camera moves, and stops progressive rendering. Smooth on large models, softer while moving.',
    },
  ],
  reset: {
    label: 'Reset display',
    patch: {
      lightPreset: DEFAULT_DISPLAY_SETTINGS.lightPreset,
      groundShadow: DEFAULT_DISPLAY_SETTINGS.groundShadow,
      groundReflection: DEFAULT_DISPLAY_SETTINGS.groundReflection,
      edges: DEFAULT_DISPLAY_SETTINGS.edges,
      ambientOcclusion: DEFAULT_DISPLAY_SETTINGS.ambientOcclusion,
      antialiasing: DEFAULT_DISPLAY_SETTINGS.antialiasing,
      performance: DEFAULT_DISPLAY_SETTINGS.performance,
    },
  },
};

function apply(adapter: ViewerAdapter, settings: DisplayToolSettings): void {
  adapter.applyDisplaySettings(displaySettingsOf(settings));
}

export class DisplayTool extends ViewerTool<DisplayToolSettings> {
  readonly id = 'display';
  readonly title = 'Viewer display';
  readonly description = 'Lighting, shadows, edges and rendering quality.';
  readonly settings = DISPLAY_SETTINGS;
  readonly form = DISPLAY_FORM;

  contribute(): ToolContribution {
    return {};
  }

  override toolbarSignature(settings: DisplayToolSettings): unknown {
    return [settings.enabled, displaySettingsOf(settings)];
  }

  override onSettingsChanged(
    adapter: ViewerAdapter,
    _previous: DisplayToolSettings | undefined,
    next: DisplayToolSettings,
  ): void {
    if (!next.enabled) return;
    apply(adapter, next);
  }

  override onModelsReady(
    adapter: ViewerAdapter,
    settings: DisplayToolSettings,
  ): void {
    if (!settings.enabled) return;
    apply(adapter, settings);
  }

  override onDisabled(adapter: ViewerAdapter): void {
    apply(adapter, DEFAULT_DISPLAY_SETTINGS);
  }
}
