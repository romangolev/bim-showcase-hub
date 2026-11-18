import type { ReactNode } from 'react';
import { isRecord } from '../../../shared/guards.js';
import type { ModalDefinition } from '../../modal/types.js';
import type {
  ExportToolSpec,
  PaintToolSpec,
  ViewerAdapter,
} from '../../viewer/ViewerAdapter.js';
import type { PersistedSetting } from './persistedSetting.js';
import { ToolSettingsFrame } from './ToolSettingsFrame.js';

export interface ToolSettings {
  enabled: boolean;
}

export interface ToolBadge {
  text: string;
  detail: string;
  error: boolean;
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
  report: (badge: ToolBadge, busy: boolean) => void;
}

export interface LegacySettings {
  fields: readonly string[];
  read: (blob: Record<string, unknown>) => unknown;
}

export function readEnabled(raw: unknown): boolean {
  return !isRecord(raw) || typeof raw.enabled !== 'boolean' || raw.enabled;
}

export abstract class ViewerTool<S extends ToolSettings = ToolSettings> {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly description: string;
  abstract readonly settings: PersistedSetting<S>;
  readonly legacy?: LegacySettings;

  abstract contribute(ctx: ToolContext, settings: S): ToolContribution;

  toolbarSignature(settings: S): unknown {
    return settings.enabled;
  }

  onDisabled(_adapter: ViewerAdapter): void {}

  scrub(settings: S): S {
    return settings;
  }

  protected renderFields(): ReactNode {
    return null;
  }

  renderSettings(): ReactNode {
    return (
      <ToolSettingsFrame tool={this as ViewerTool<ToolSettings>}>
        {this.renderFields()}
      </ToolSettingsFrame>
    );
  }

  settingsModal(): ModalDefinition {
    const render = () => this.renderSettings();
    return {
      id: `tool-${this.id}-settings`,
      title: `${this.title} settings`,
      size: 'lg',
      Body: () => <>{render()}</>,
    };
  }
}
