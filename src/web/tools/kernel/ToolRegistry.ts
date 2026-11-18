import type { ModalDefinition } from '../../modal/types.js';
import { readJson, writeJson } from '../../storage.js';
import type {
  ExportToolSpec,
  PaintToolSpec,
  ToolGroupSpec,
} from '../../viewer/ViewerAdapter.js';
import type { ToolContext, ToolSettings, ViewerTool } from './ViewerTool.js';

export type AnyViewerTool = ViewerTool<ToolSettings>;
export type ToolSnapshot = Readonly<Record<string, ToolSettings>>;

export const TOOL_GROUP_ID = 'bim-showcase-hub-tools';
export const TOOL_GROUP_TITLE = 'BIM Showcase Hub tools';

export class ToolRegistry {
  private readonly tools: AnyViewerTool[] = [];

  register(tool: AnyViewerTool): this {
    for (const known of this.tools) {
      if (known.id === tool.id) {
        throw new Error(`Tool id already registered: ${tool.id}`);
      }
      if (known.settings.key === tool.settings.key) {
        throw new Error(`Tool settings key already used: ${tool.settings.key}`);
      }
    }
    this.tools.push(tool);
    return this;
  }

  all(): readonly AnyViewerTool[] {
    return this.tools;
  }

  get(id: string): AnyViewerTool | undefined {
    return this.tools.find((tool) => tool.id === id);
  }

  modals(): ModalDefinition[] {
    return this.tools.map((tool) => tool.settingsModal());
  }

  snapshot(): Record<string, ToolSettings> {
    const out: Record<string, ToolSettings> = {};
    for (const tool of this.tools) {
      const raw = readJson<unknown>(tool.settings.key, undefined);
      out[tool.id] =
        raw === undefined ? tool.settings.initial : tool.settings.sanitize(raw);
    }
    return out;
  }

  buildGroup(
    ctx: ToolContext,
    snapshot: ToolSnapshot,
    group: { id: string; title: string } = {
      id: TOOL_GROUP_ID,
      title: TOOL_GROUP_TITLE,
    },
  ): ToolGroupSpec | null {
    let paint: PaintToolSpec | undefined;
    const exports: ExportToolSpec[] = [];
    for (const tool of this.tools) {
      const settings = snapshot[tool.id] ?? tool.settings.initial;
      if (!settings.enabled) continue;
      const contribution = tool.contribute(ctx, settings);
      paint ??= contribution.paint;
      exports.push(...(contribution.exports ?? []));
    }
    if (!paint && exports.length === 0) return null;
    return {
      id: ctx.id(group.id),
      title: group.title,
      ...(paint ? { paint } : {}),
      exports,
    };
  }

  scrubPersonal(): void {
    for (const tool of this.tools) {
      const raw = readJson<unknown>(tool.settings.key, undefined);
      if (raw === undefined) continue;
      writeJson(tool.settings.key, tool.scrub(tool.settings.sanitize(raw)));
    }
  }
}
