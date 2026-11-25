import type { ReactNode } from 'react';
import { isRecord } from '../../../shared/guards.js';
import type { Command } from '../../commands/types.js';
import type { FormDefinition } from '../../components/SettingsForm.js';
import type { ModalDefinition } from '../../modal/types.js';
import type { PersistedRecord } from '../../storage.js';
import type {
  ExportToolSpec,
  PaintToolSpec,
  ViewerAdapter,
} from '../../viewer/ViewerAdapter.js';
import { ToolForm } from './ToolForm.js';

export interface ToolSettings {
  enabled: boolean;
}

export interface ToolContribution {
  paint?: PaintToolSpec;
  exports?: ExportToolSpec[];
}

export interface ToolContext {
  adapter: ViewerAdapter;
  id: (base: string) => string;
  fileName: () => string;
  current: <S extends ToolSettings>(tool: ViewerTool<S>) => S;
  openModal?: (id: string) => void;
  focusDocuments?: () => void;
}

export function readEnabled(raw: unknown): boolean {
  return !isRecord(raw) || typeof raw.enabled !== 'boolean' || raw.enabled;
}

export abstract class ViewerTool<S extends ToolSettings = ToolSettings> {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly description: string;
  abstract readonly settings: PersistedRecord<S>;
  readonly exportTitle?: string;
  readonly form?: FormDefinition<S>;

  abstract contribute(ctx: ToolContext, settings: S): ToolContribution;

  commands(ctx: ToolContext | null, settings: S): Command[] {
    const commands: Command[] = this.hasSettings
      ? [
          {
            id: `${this.id}.settings`,
            title: `${this.title} settings`,
            group: 'Settings',
            icon: 'settings',
            run: (host) => host.openModal(this.modalId),
          },
        ]
      : [];
    if (!this.exportTitle) return commands;
    const exports =
      ctx && settings.enabled
        ? (this.contribute(ctx, settings).exports ?? [])
        : [];
    if (exports.length === 0) {
      commands.push({
        id: `${this.id}.export`,
        title: this.exportTitle,
        group: 'Export',
        disabled: settings.enabled
          ? 'Open a model first'
          : 'Turned off in Settings',
        run: () => undefined,
      });
    }
    exports.forEach((spec, index) => {
      commands.push({
        id: `${this.id}.export${index ? `.${index}` : ''}`,
        title: spec.tooltip,
        group: 'Export',
        run: () => spec.onExport(),
      });
    });
    return commands;
  }

  toolbarSignature(settings: S): unknown {
    return settings.enabled;
  }

  onDisabled(_adapter: ViewerAdapter): void {}

  onModelsReady(_adapter: ViewerAdapter, _settings: S): void {}

  onSettingsChanged(
    _adapter: ViewerAdapter,
    _previous: S | undefined,
    _next: S,
  ): void {}

  scrub(settings: S): S {
    return settings;
  }

  protected renderFields(): ReactNode {
    return this.form ? <ToolForm tool={this} form={this.form} /> : null;
  }

  get hasSettings(): boolean {
    return this.renderFields() !== null;
  }

  renderSettings(): ReactNode {
    return this.renderFields();
  }

  get modalId(): string {
    return `tool-${this.id}-settings`;
  }

  settingsModal(): ModalDefinition {
    const render = () => this.renderSettings();
    return {
      id: this.modalId,
      title: `${this.title} settings`,
      size: 'lg',
      Body: () => <>{render()}</>,
    };
  }
}
