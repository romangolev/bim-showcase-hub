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
import type { PaintSwatchSpec } from './ViewerAdapter.js';

export const TOOLS_EXTENSION_ID = 'BimShowcaseHub.Tools';
export const PAINT_ICON_CLASS = 'bsh-ico-paint';
export const RESET_ICON_CLASS = 'bsh-ico-reset';

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
      const swatches: { swatch: PaintSwatchSpec; button: ControlButton }[] = [];
      let reset: ControlButton | null = null;

      if (spec.paint) {
        const paintSpec = spec.paint;
        const combo: ComboButton = new UI.ComboButton(paintSpec.id);
        combo.setToolTip(paintSpec.tooltip);
        combo.setIcon(PAINT_ICON_CLASS);

        for (const swatch of paintSpec.swatches) {
          const button: ControlButton = new UI.Button(swatch.id);
          button.setIcon(swatchIconClass(swatch.icon));
          if (button.icon) button.icon.style.backgroundColor = swatch.swatch;
          button.onClick = () => controller.paint(swatch.color);
          combo.addControl(button);
          swatches.push({ swatch, button });
        }

        const resetButton: ControlButton = new UI.Button(paintSpec.reset.id);
        resetButton.setIcon(RESET_ICON_CLASS);
        resetButton.onClick = () => controller.reset();
        combo.addControl(resetButton);
        reset = resetButton;
        group.addControl(combo);
      }

      for (const entry of spec.exports) {
        if (entry.menu) {
          const combo: ComboButton = new UI.ComboButton(entry.id);
          combo.setToolTip(entry.tooltip);
          combo.setIcon(entry.icon);
          for (const item of entry.menu) {
            const button: ControlButton = new UI.Button(item.id);
            button.setIcon(item.icon);
            button.setToolTip(item.tooltip);
            button.onClick = item.run;
            combo.addControl(button);
          }
          group.addControl(combo);
          continue;
        }
        const button: ControlButton = new UI.Button(entry.id);
        button.setIcon(entry.icon);
        button.setToolTip(entry.tooltip);
        button.onClick = () => controller.export(entry.id);
        group.addControl(button);
      }

      const apply = (state: ToolGroupState) => {
        const paintSpec = spec.paint;
        if (!paintSpec) return;
        for (const { swatch, button } of swatches) {
          button.setState(state.hasSelection ? enabled : disabled);
          button.setToolTip(
            state.hasSelection ? swatch.label : paintSpec.selectHint,
          );
        }
        reset?.setState(state.painted ? enabled : disabled);
        reset?.setToolTip(
          state.painted ? paintSpec.reset.label : paintSpec.resetHint,
        );
      };

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
