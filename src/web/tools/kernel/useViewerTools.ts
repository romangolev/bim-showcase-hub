import { useEffect, useRef } from 'react';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { usePersistedSetting } from './persistedSetting.js';
import type { ToolRegistry, ToolSnapshot } from './ToolRegistry.js';
import type { ToolBadge, ToolContext, ToolSettings } from './ViewerTool.js';

export interface ViewerToolsOptions {
  adapter: ViewerAdapter | null;
  active: boolean;
  suffix?: string;
  fileName: () => string;
  report: (badge: ToolBadge, busy: boolean) => void;
}

function withSuffix(base: string, suffix?: string): string {
  return suffix ? `${base}-${suffix}` : base;
}

function useStableBy<T>(value: T, signature: string): T {
  const held = useRef({ signature, value });
  if (held.current.signature !== signature) {
    held.current = { signature, value };
  }
  return held.current.value;
}

export function useViewerTools(
  registry: ToolRegistry,
  options: ViewerToolsOptions,
): void {
  const { adapter, active, suffix } = options;
  const tools = registry.all();
  const live: Record<string, ToolSettings> = {};
  const signatures: unknown[] = [];
  for (const tool of tools) {
    const [value] = usePersistedSetting(tool.settings);
    live[tool.id] = value;
    signatures.push([tool.id, tool.toolbarSignature(value)]);
  }
  const liveRef = useRef<ToolSnapshot>(live);
  liveRef.current = live;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const snapshot = useStableBy(live, JSON.stringify(signatures));

  useEffect(() => {
    if (!adapter || !active) return;
    const ctx: ToolContext = {
      adapter,
      id: (base) => withSuffix(base, suffix),
      fileName: () => optionsRef.current.fileName(),
      current: (tool) =>
        (liveRef.current[tool.id] ??
          tool.settings.initial) as typeof tool.settings.initial,
      report: (badge, busy) => optionsRef.current.report(badge, busy),
    };
    const group = registry.buildGroup(ctx, snapshot);
    return group ? adapter.registerToolGroup(group) : undefined;
  }, [adapter, active, suffix, registry, snapshot]);

  const wasEnabled = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const before = wasEnabled.current;
    wasEnabled.current = Object.fromEntries(
      Object.entries(snapshot).map(([id, value]) => [id, value.enabled]),
    );
    if (!adapter || !active) return;
    for (const tool of registry.all()) {
      if (before[tool.id] && !snapshot[tool.id]?.enabled) {
        tool.onDisabled(adapter);
      }
    }
  }, [adapter, active, registry, snapshot]);
}
