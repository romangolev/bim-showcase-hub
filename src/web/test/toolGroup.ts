import { TOOLS } from '../tools/index.js';
import type { ToolSettings } from '../tools/kernel/ViewerTool.js';
import type { ToolGroupSpec, ViewerAdapter } from '../viewer/ViewerAdapter.js';

export interface ToolGroupOptions {
  only?: readonly string[];
  suffix?: string;
  fileName?: () => string;
  report?: (
    badge: { text: string; detail: string; error: boolean },
    busy: boolean,
  ) => void;
  settings?: Record<string, Partial<ToolSettings> & Record<string, unknown>>;
}

export function buildToolGroup(
  adapter: ViewerAdapter,
  options: ToolGroupOptions = {},
): ToolGroupSpec {
  const snapshot: Record<string, ToolSettings> = {};
  for (const tool of TOOLS.all()) {
    snapshot[tool.id] = {
      ...tool.settings.initial,
      ...options.settings?.[tool.id],
      ...(options.only ? { enabled: options.only.includes(tool.id) } : {}),
    };
  }
  const ctx = {
    adapter,
    id: (base: string) => (options.suffix ? `${base}-${options.suffix}` : base),
    fileName: options.fileName ?? (() => ''),
    current: ((tool: { id: string }) => snapshot[tool.id]) as never,
    report: options.report ?? (() => undefined),
  };
  const spec = TOOLS.buildGroup(ctx, snapshot);
  if (!spec) throw new Error('no tool is enabled');
  return spec;
}
