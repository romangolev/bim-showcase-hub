import { useContext, useEffect, useRef } from 'react';
import { COMMANDS } from '../../commands/registry.js';
import { viewerCommands } from '../../commands/viewerCommands.js';
import { type LayoutApi, LayoutContext } from '../../layout/layoutContext.js';
import { type ModalApi, useModalApi } from '../../modal/modalApi.js';
import { usePersisted } from '../../storage.js';
import type { ModelInfo } from '../../viewer/modelSet.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { useActiveViewer } from '../../viewer/ViewerContext.js';
import type { ToolRegistry, ToolSnapshot } from './ToolRegistry.js';
import type { ToolContext, ToolSettings } from './ViewerTool.js';

export interface ViewerToolsOptions {
  adapter: ViewerAdapter | null;
  active: boolean;
  suffix?: string;
  fileName: () => string;
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
    const [value] = usePersisted(tool.settings);
    live[tool.id] = value;
    signatures.push([tool.id, tool.toolbarSignature(value)]);
  }
  const modalRef = useRef<ModalApi | null>(null);
  modalRef.current = useModalApi();
  const layoutRef = useRef<LayoutApi | null>(null);
  layoutRef.current = useContext(LayoutContext);
  const liveRef = useRef<ToolSnapshot>(live);
  liveRef.current = live;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const snapshot = useStableBy(live, JSON.stringify(signatures));

  const makeCtx = (target: ViewerAdapter): ToolContext => ({
    adapter: target,
    id: (base) => withSuffix(base, suffix),
    fileName: () => optionsRef.current.fileName(),
    openModal: modalRef.current
      ? (id) => modalRef.current?.open(id)
      : undefined,
    focusDocuments: layoutRef.current
      ? () => layoutRef.current?.focusPane('tree')
      : undefined,
    current: (tool) =>
      tool.settings.sanitize(
        liveRef.current[tool.id] ?? tool.settings.initial,
      ) as typeof tool.settings.initial,
  });
  const makeCtxRef = useRef(makeCtx);
  makeCtxRef.current = makeCtx;
  const activeViewer = useActiveViewer();
  const isActiveViewer = adapter !== null && activeViewer === adapter;

  useEffect(() => {
    if (!adapter || !active || !isActiveViewer) return;
    return COMMANDS.register(
      `viewer:${suffix ?? ''}`,
      () => [
        ...viewerCommands(adapter),
        ...registry.commands(makeCtxRef.current(adapter), liveRef.current),
      ],
      10,
    );
  }, [adapter, active, isActiveViewer, suffix, registry]);

  useEffect(() => {
    if (!adapter || !active) return;
    const ctx = makeCtxRef.current(adapter);
    const group = registry.buildGroup(ctx, snapshot);
    return group ? adapter.registerToolGroup(group) : undefined;
  }, [adapter, active, suffix, registry, snapshot]);

  useEffect(() => {
    if (!adapter || !active) return;
    if (
      typeof adapter.getModels !== 'function' ||
      typeof adapter.onModelsChange !== 'function'
    ) {
      return;
    }
    const readyKey = (models: readonly ModelInfo[]) =>
      models
        .filter((model) => model.status === 'ready')
        .map((model) => `${model.id}@${model.version ?? ''}`)
        .join('|');
    let signature = '';
    const notifyTools = (models: readonly ModelInfo[]) => {
      const next = readyKey(models);
      if (next === signature) return;
      signature = next;
      if (!next) return;
      for (const tool of registry.all()) {
        tool.onModelsReady(
          adapter,
          liveRef.current[tool.id] ?? tool.settings.initial,
        );
      }
    };
    notifyTools(adapter.getModels());
    return adapter.onModelsChange(notifyTools);
  }, [adapter, active, registry]);

  const wasEnabled = useRef<Record<string, boolean>>({});
  const seen = useRef<
    { adapter: ViewerAdapter; snapshot: ToolSnapshot } | undefined
  >(undefined);
  useEffect(() => {
    if (!adapter || !active) return;
    const before = wasEnabled.current;
    wasEnabled.current = Object.fromEntries(
      Object.entries(snapshot).map(([id, value]) => [id, value.enabled]),
    );
    for (const tool of registry.all()) {
      if (before[tool.id] && !snapshot[tool.id]?.enabled) {
        tool.onDisabled(adapter);
      }
    }
    const previous =
      seen.current?.adapter === adapter ? seen.current.snapshot : {};
    seen.current = { adapter, snapshot };
    for (const tool of registry.all()) {
      const next = snapshot[tool.id];
      if (next && next !== previous[tool.id]) {
        tool.onSettingsChanged(adapter, previous[tool.id], next);
      }
    }
  }, [adapter, active, registry, snapshot]);
}
