import { safeName } from '../../extensions/exportFormats.js';
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
      .then(
        () => task.fail('Export ended without a result'),
        (error: unknown) => task.fail(error),
      )
      .finally(() => {
        active.delete(kind);
      })
      .catch(() => undefined);
  } catch (error) {
    active.delete(kind);
    task.fail(error);
  }
}

function isIncomplete(status: object): boolean {
  const { missing, skipped, levelsUnavailable, generatedIds, scopeNote } =
    status as {
      missing?: readonly unknown[];
      scopeNote?: string;
      skipped?: number;
      levelsUnavailable?: number;
      generatedIds?: number;
    };
  return Boolean(
    missing?.length ||
      skipped ||
      levelsUnavailable ||
      generatedIds ||
      scopeNote,
  );
}

export function statusReporter<S extends { phase: string }>(
  task: TaskHandle,
  describe: (status: S) => string,
): (status: S) => void {
  return (status) => {
    const detail = describe(status);
    switch (status.phase) {
      case 'done':
        if (isIncomplete(status)) task.warn(detail);
        else task.finish(detail);
        break;
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

export function exportStem(file?: string, version?: string): string {
  const base = (file ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const parts = [base, version ?? ''].map(safeName).filter(Boolean);
  return base && parts.length > 0 ? parts.join('-').slice(0, 120) : '';
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
