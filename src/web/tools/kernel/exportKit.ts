import { startTask, type TaskHandle } from '../../tasks/taskStore.js';
import type {
  ExportToolSpec,
  ViewerAdapter,
} from '../../viewer/ViewerAdapter.js';
import type { ToolContext } from './ViewerTool.js';

const running = new WeakMap<ViewerAdapter, Set<string>>();

export interface ExportJob {
  task: TaskHandle;
  signal: AbortSignal;
}

export function runOnce(
  adapter: ViewerAdapter,
  kind: string,
  label: string,
  start: (job: ExportJob) => Promise<unknown>,
  cancellable = false,
): void {
  let kinds = running.get(adapter);
  if (!kinds) {
    kinds = new Set();
    running.set(adapter, kinds);
  }
  if (kinds.has(kind)) return;
  const active = kinds;
  active.add(kind);
  const controller = new AbortController();
  const task = startTask({
    label,
    ...(cancellable ? { cancel: () => controller.abort() } : {}),
    retry: () => runOnce(adapter, kind, label, start, cancellable),
  });
  try {
    void start({ task, signal: controller.signal })
      .catch((error: unknown) => task.fail(error))
      .finally(() => {
        active.delete(kind);
      })
      .catch(() => undefined);
  } catch (error) {
    active.delete(kind);
    task.fail(error);
    throw error;
  }
}

export function statusReporter<S extends { phase: string }>(
  task: TaskHandle,
  describe: (status: S) => string,
): (status: S) => void {
  return (status) => {
    const detail = describe(status);
    switch (status.phase) {
      case 'done':
      case 'empty':
        task.finish(detail);
        break;
      case 'error':
        task.fail(detail);
        break;
      case 'cancelled':
        task.cancel();
        break;
      default:
        task.progress(null, detail);
    }
  };
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
  label: string;
  cancellable?: boolean;
}

export function exportEntry(
  ctx: ToolContext,
  toolId: string,
  entry: ExportEntry,
  start: (job: ExportJob) => Promise<unknown>,
): ExportToolSpec {
  return {
    id: ctx.id(entry.id),
    icon: entry.icon,
    tooltip: entry.tooltip,
    onExport: () =>
      runOnce(ctx.adapter, toolId, entry.label, start, entry.cancellable),
  };
}
