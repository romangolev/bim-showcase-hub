import type {
  ExportToolSpec,
  ViewerAdapter,
} from '../../viewer/ViewerAdapter.js';
import type { ToolContext } from './ViewerTool.js';

const running = new WeakMap<ViewerAdapter, Set<string>>();

export function runOnce(
  adapter: ViewerAdapter,
  kind: string,
  start: () => Promise<unknown>,
): void {
  let kinds = running.get(adapter);
  if (!kinds) {
    kinds = new Set();
    running.set(adapter, kinds);
  }
  if (kinds.has(kind)) return;
  const active = kinds;
  active.add(kind);
  try {
    void start()
      .finally(() => {
        active.delete(kind);
      })
      .catch(() => undefined);
  } catch (error) {
    active.delete(kind);
    throw error;
  }
}

export function isBusy(status: { phase: string }): boolean {
  return status.phase === 'reading' || status.phase === 'building';
}

export function exportFileName(
  fileName: string | undefined,
  fallback: string,
  suffix: string,
  extension: string,
): string {
  const model = (fileName ?? '')
    .trim()
    .replace(/\.(xlsx|glb|gltf|ifc)$/i, '')
    .replace(/-properties$/i, '');
  return model ? `${model}${suffix}.${extension}` : fallback;
}

export const DEFAULT_CONFIRM_ABOVE = 20000;

export function confirmLargeExport(
  rowCount: number,
  limit = DEFAULT_CONFIRM_ABOVE,
): boolean {
  return (
    rowCount <= limit ||
    window.confirm(
      `Export ${rowCount.toLocaleString('en-US')} elements? This can take a while.`,
    )
  );
}

export interface ExportEntry {
  id: string;
  icon: string;
  tooltip: string;
}

export function exportEntry(
  ctx: ToolContext,
  toolId: string,
  entry: ExportEntry,
  start: () => Promise<unknown>,
): ExportToolSpec {
  return {
    id: ctx.id(entry.id),
    icon: entry.icon,
    tooltip: entry.tooltip,
    onExport: () => runOnce(ctx.adapter, toolId, start),
  };
}
