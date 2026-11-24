import type { PickedModel } from '../../components/tree/treeState.js';
import { runIfcBatch } from '../../extensions/ifcBatch.js';
import { startTask } from '../../tasks/taskStore.js';
import { IFC_SETTINGS } from './ifcSettings.js';

export const MAX_BATCH = 20;
export const CONFIRM_BATCH_ABOVE = 10;

let running = false;

function projectOf(models: readonly PickedModel[]): string | undefined {
  const names = new Set(models.map((model) => model.context.crumbs?.[1]));
  const [name] = names;
  return names.size === 1 ? name : undefined;
}

function summarize(done: number, total: number, failures: string): string {
  return `Exported ${done} of ${total}. Failed: ${failures}`;
}

export function exportPickedAsIfcBatch(
  models: readonly PickedModel[],
): boolean {
  if (models.length === 0) return false;
  if (running) {
    startTask({ label: 'Exporting IFC batch' }).warn(
      'A batch is already running. Wait for it to finish.',
    );
    return false;
  }
  if (models.length > MAX_BATCH) {
    startTask({ label: 'Exporting IFC batch' }).warn(
      `A batch holds up to ${MAX_BATCH} models. Select fewer versions.`,
    );
    return false;
  }
  if (
    models.length > CONFIRM_BATCH_ABOVE &&
    !window.confirm(
      `Export ${models.length} models to IFC? This can take a while.`,
    )
  ) {
    return false;
  }
  running = true;
  const controller = new AbortController();
  const total = models.length;
  const task = startTask({
    label: 'Exporting IFC batch',
    cancel: () => controller.abort(),
    retry: () => exportPickedAsIfcBatch(models),
  });
  runIfcBatch(
    models.map(({ urn, context }) => ({
      urn,
      file: context.file ?? '',
      version: context.v ?? '',
    })),
    {
      settings: IFC_SETTINGS.sanitize(IFC_SETTINGS.read()),
      project: projectOf(models),
      signal: controller.signal,
      onProgress: ({ index, name, phase, step }) =>
        task.progress(
          (index + step / 3) / total,
          `Exporting IFC ${index + 1} of ${total}: ${name}, ${phase}`,
        ),
    },
  )
    .then((result) => {
      running = false;
      const failures = result.failed
        .map((failure) => `${failure.name} (${failure.reason})`)
        .join('; ');
      if (result.cancelled) {
        task.cancel();
        startTask({ label: 'IFC batch cancelled' }).warn(
          result.done.length
            ? `Downloaded ${result.done.length} of ${total}`
            : 'Nothing was exported',
        );
      } else if (result.done.length === 0) {
        task.fail(`No file was exported. ${failures}`);
      } else if (result.failed.length > 0) {
        task.warn(summarize(result.done.length, total, failures));
      } else {
        const megabytes = (result.bytes / 1024 / 1024).toFixed(1);
        task.finish(`${result.done.length} files, ${megabytes} MB`);
      }
    })
    .catch((error: unknown) => {
      running = false;
      task.fail(error);
    });
  return true;
}
