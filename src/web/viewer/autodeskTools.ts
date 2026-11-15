import {
  type AutodeskViewing,
  type ComboButton,
  type ControlButton,
  type ControlGroup,
  type ExtensionManager,
  getViewing,
  type ViewerExtensionClass,
} from './autodesk.js';
import type {
  ToolGroupController,
  ToolGroupState,
} from './toolGroupController.js';

export const TOOLS_EXTENSION_ID = 'BimShowcaseHub.Tools';
export const PAINT_ICON_CLASS = 'bsh-ico-paint';
export const RESET_ICON_CLASS = 'bsh-ico-reset';
export const EXPORT_ICON_CLASS = 'bsh-ico-export';

export interface ToolsExtensionOptions {
  controller: ToolGroupController;
}

const registeredManagers = new WeakSet<ExtensionManager>();

export function swatchIconClass(id: string): string {
  return `bsh-ico-${id}`;
}

function isToolsOptions(value: unknown): value is ToolsExtensionOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'controller' in value &&
    typeof (value as { controller: unknown }).controller === 'object'
  );
}

function createToolsExtension(viewing: AutodeskViewing): ViewerExtensionClass {
  class ToolsExtension extends viewing.Extension {
    private group: ControlGroup | null = null;
    private stop: (() => void) | null = null;

    load(): boolean {
      if (!isToolsOptions(this.options)) return false;
      const toolbar = this.viewer.toolbar;
      if (!toolbar) return false;
      const { controller } = this.options;
      const { spec } = controller;
      const { UI } = getViewing();
      const enabled = UI.Button.State.INACTIVE;
      const disabled = UI.Button.State.DISABLED;

      const group = new UI.ControlGroup(spec.id);
      const combo: ComboButton = new UI.ComboButton(spec.paint.id);
      combo.setToolTip(spec.paint.tooltip);
      combo.setIcon(PAINT_ICON_CLASS);

      const swatches = spec.paint.swatches.map((swatch) => {
        const button: ControlButton = new UI.Button(swatch.id);
        button.setIcon(swatchIconClass(swatch.id));
        button.onClick = () => controller.paint(swatch.color);
        combo.addControl(button);
        return { swatch, button };
      });

      const reset: ControlButton = new UI.Button(spec.paint.reset.id);
      reset.setIcon(RESET_ICON_CLASS);
      reset.onClick = () => controller.reset();
      combo.addControl(reset);

      const exportButton: ControlButton = new UI.Button(spec.export.id);
      exportButton.setIcon(EXPORT_ICON_CLASS);
      exportButton.setToolTip(spec.export.tooltip);
      exportButton.onClick = () => controller.export();

      const apply = (state: ToolGroupState) => {
        for (const { swatch, button } of swatches) {
          button.setState(state.hasSelection ? enabled : disabled);
          button.setToolTip(
            state.hasSelection ? swatch.label : spec.paint.selectHint,
          );
        }
        reset.setState(state.painted ? enabled : disabled);
        reset.setToolTip(
          state.painted ? spec.paint.reset.label : spec.paint.resetHint,
        );
      };

      group.addControl(combo);
      group.addControl(exportButton);
      toolbar.addControl(group);
      apply(controller.state);
      this.stop = controller.subscribe(apply);
      this.group = group;
      return true;
    }

    unload(): boolean {
      this.stop?.();
      this.stop = null;
      if (this.group) {
        this.viewer.toolbar?.removeControl(this.group);
        this.group = null;
      }
      return true;
    }
  }
  return ToolsExtension;
}

export function ensureToolsExtension(): void {
  const viewing = getViewing();
  const manager = viewing.theExtensionManager;
  if (registeredManagers.has(manager)) return;
  manager.registerExtension(TOOLS_EXTENSION_ID, createToolsExtension(viewing));
  registeredManagers.add(manager);
}
