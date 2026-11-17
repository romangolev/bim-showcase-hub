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
export const EXPORT_ICON_CLASS = 'bsh-ico-export';
export const GLB_ICON_CLASS = 'bsh-ico-glb';
export const IFC_ICON_CLASS = 'bsh-ico-ifc';

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

      if (spec.export) {
        const exportButton: ControlButton = new UI.Button(spec.export.id);
        exportButton.setIcon(EXPORT_ICON_CLASS);
        exportButton.setToolTip(spec.export.tooltip);
        exportButton.onClick = () => controller.export();
        group.addControl(exportButton);
      }

      if (spec.geometry) {
        const geometryButton: ControlButton = new UI.Button(spec.geometry.id);
        geometryButton.setIcon(GLB_ICON_CLASS);
        geometryButton.setToolTip(spec.geometry.tooltip);
        geometryButton.onClick = () => controller.exportGeometry();
        group.addControl(geometryButton);
      }

      if (spec.ifc) {
        const ifcButton: ControlButton = new UI.Button(spec.ifc.id);
        ifcButton.setIcon(IFC_ICON_CLASS);
        ifcButton.setToolTip(spec.ifc.tooltip);
        ifcButton.onClick = () => controller.exportIfc();
        group.addControl(ifcButton);
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
