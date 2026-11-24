import { createZip, type ZipBuilder } from '../../shared/zip.js';
import type { IfcSettings } from '../ifc/types.js';
import { exportStem } from '../tools/kernel/exportKit.js';
import { createViewerAdapter } from '../viewer/createViewerAdapter.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { STILL_LOADING_MESSAGE } from '../viewer/viewerGeometry.js';
import { saveBlob } from './download.js';
import { safeName } from './exportFormats.js';
import { exportToIfc } from './ifcExport.js';

export interface BatchItem {
  urn: string;
  file: string;
  version: string;
}

export interface BatchFailure {
  name: string;
  reason: string;
}

export interface BatchResult {
  done: string[];
  failed: BatchFailure[];
  cancelled: boolean;
  bytes: number;
}

export interface BatchProgress {
  index: number;
  total: number;
  name: string;
  phase: string;
  step: number;
}

export interface BatchOptions {
  settings: IfcSettings;
  project?: string;
  signal?: AbortSignal;
  onProgress?: (progress: BatchProgress) => void;
  factory?: (host: HTMLElement) => Promise<ViewerAdapter>;
  zip?: () => ZipBuilder;
  save?: (blob: Blob, fileName: string) => void;
  wait?: (ms: number) => Promise<void>;
  now?: Date;
}

export const RETRY_INTERVAL_MS = 500;
export const RETRY_LIMIT_MS = 10 * 60_000;

export function batchEntryNames(items: readonly BatchItem[]): string[] {
  const used = new Set<string>();
  return items.map((item) => {
    const stem = exportStem(item.file, item.version) || 'model';
    let name = `${stem}.ifc`;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      name = `${stem}-${n}.ifc`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

export function zipFileName(project: string | undefined, now: Date): string {
  const stem = safeName(project ?? '') || now.toISOString().slice(0, 10);
  return `${stem}-ifc-batch.zip`;
}

function offscreenHost(): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:320px;height:240px';
  host.setAttribute('inert', '');
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  return host;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function raceAbort(
  work: Promise<unknown>,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!signal) {
    await work;
    return false;
  }
  if (signal.aborted) {
    work.catch(() => undefined);
    return true;
  }
  let onAbort: () => void = () => undefined;
  const abort = new Promise<true>((resolve) => {
    onAbort = () => resolve(true);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  work.catch(() => undefined);
  try {
    return (await Promise.race([work.then(() => false), abort])) === true;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function exportOne(
  item: BatchItem,
  name: string,
  options: BatchOptions,
  report: (phase: string, step: number) => void,
): Promise<Blob | null> {
  const factory = options.factory ?? createViewerAdapter;
  const wait = options.wait ?? sleep;
  const host = offscreenHost();
  let adapter: ViewerAdapter | undefined;
  try {
    report('Loading model', 0);
    adapter = await factory(host);
    const loading = adapter.load(
      item.urn,
      `${item.file} ${item.version}`.trim(),
    );
    const aborted = await raceAbort(loading, options.signal);
    if (aborted || options.signal?.aborted) return null;
    let blob: Blob | undefined;
    let waited = 0;
    for (;;) {
      if (options.signal?.aborted) return null;
      const status = await exportToIfc(adapter, {
        fileName: name,
        settings: () => options.settings,
        save: (captured) => {
          blob = captured;
        },
        onStatus: (s) => {
          if (s.phase === 'reading') report('Reading model', 1);
          if (s.phase === 'building') report('Building IFC', 2);
        },
      });
      if (status.phase === 'done' && blob) return blob;
      if (status.phase === 'empty') throw new Error('No elements to export');
      const message = status.phase === 'error' ? status.message : '';
      if (
        !message.includes(STILL_LOADING_MESSAGE) ||
        waited >= RETRY_LIMIT_MS
      ) {
        throw new Error(message.replace(/^Export failed: /, '') || 'Failed');
      }
      if (options.signal?.aborted) return null;
      await wait(RETRY_INTERVAL_MS);
      waited += RETRY_INTERVAL_MS;
      if (options.signal?.aborted) return null;
    }
  } finally {
    adapter?.destroy();
    host.remove();
  }
}

export async function runIfcBatch(
  items: readonly BatchItem[],
  options: BatchOptions,
): Promise<BatchResult> {
  const names = batchEntryNames(items);
  const zip = (options.zip ?? createZip)();
  const save = options.save ?? saveBlob;
  const result: BatchResult = {
    done: [],
    failed: [],
    cancelled: false,
    bytes: 0,
  };
  for (const [index, item] of items.entries()) {
    if (options.signal?.aborted) {
      result.cancelled = true;
      break;
    }
    const name = names[index] as string;
    try {
      const blob = await exportOne(item, name, options, (phase, step) =>
        options.onProgress?.({
          index,
          total: items.length,
          name,
          phase,
          step,
        }),
      );
      if (!blob) {
        result.cancelled = true;
        break;
      }
      await zip.add(name, blob);
      result.done.push(name);
      result.bytes += blob.size;
    } catch (error) {
      result.failed.push({
        name,
        reason:
          error instanceof Error && error.message ? error.message : 'Failed',
      });
    }
  }
  if (options.signal?.aborted) result.cancelled = true;
  if (result.done.length > 0) {
    save(zip.finish(), zipFileName(options.project, options.now ?? new Date()));
  }
  return result;
}
