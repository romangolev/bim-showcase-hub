import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord } from '../storage.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export type SnapshotResolution = '1x' | '2x' | 'custom';

export interface SnapshotSettings {
  resolution: SnapshotResolution;
  customWidth: number;
  overlay: boolean;
  advanceSeconds: number;
}

export const SNAPSHOT_DEFAULTS: SnapshotSettings = {
  resolution: '1x',
  customWidth: 1920,
  overlay: false,
  advanceSeconds: 0,
};

export const MIN_CUSTOM_WIDTH = 320;
export const MAX_SIDE = 8192;
export const MAX_PIXELS = 30_000_000;
export const MAX_ADVANCE_SECONDS = 120;

function whole(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

export function sanitizeSnapshot(raw: unknown): SnapshotSettings {
  const source = isRecord(raw) ? raw : {};
  const { resolution } = source;
  return {
    resolution:
      resolution === '2x' || resolution === 'custom' ? resolution : '1x',
    customWidth: whole(
      source.customWidth,
      MIN_CUSTOM_WIDTH,
      MAX_SIDE,
      SNAPSHOT_DEFAULTS.customWidth,
    ),
    overlay: source.overlay === true,
    advanceSeconds: whole(
      source.advanceSeconds,
      0,
      MAX_ADVANCE_SECONDS,
      SNAPSHOT_DEFAULTS.advanceSeconds,
    ),
  };
}

export const SNAPSHOT = defineRecord<SnapshotSettings>({
  key: BSH_KEYS.preference.snapshot,
  initial: SNAPSHOT_DEFAULTS,
  sanitize: sanitizeSnapshot,
});

export class SnapshotError extends Error {}

export interface Size {
  width: number;
  height: number;
}

export function snapshotSize(
  frame: Size,
  settings: SnapshotSettings,
): Size | null {
  if (settings.resolution === '1x') return null;
  const width = Math.round(
    settings.resolution === '2x' ? frame.width * 2 : settings.customWidth,
  );
  const height = Math.round((width * frame.height) / frame.width);
  if (Math.max(width, height) > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new SnapshotError(
      `Snapshot too large: ${width} by ${height} pixels. The limit is ${MAX_SIDE} on a side and ${MAX_PIXELS / 1_000_000} megapixels. Lower the resolution in Settings.`,
    );
  }
  return { width, height };
}

export interface Caption {
  name: string;
  version?: string;
}

export function captionText(caption: Caption, date: Date): string {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return [caption.name, caption.version, day].filter(Boolean).join('  |  ');
}

export async function drawCaption(blob: Blob, text: string): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new SnapshotError('The snapshot could not be drawn');
    context.drawImage(bitmap, 0, 0);
    const font = Math.max(12, Math.round(canvas.height * 0.022));
    const bar = Math.round(font * 2);
    context.fillStyle = 'rgba(0, 0, 0, 0.6)';
    context.fillRect(0, canvas.height - bar, canvas.width, bar);
    context.fillStyle = '#ffffff';
    context.font = `${font}px system-ui, sans-serif`;
    context.textBaseline = 'middle';
    context.fillText(
      text,
      font,
      canvas.height - bar / 2,
      canvas.width - font * 2,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (out) =>
          out ? resolve(out) : reject(new SnapshotError('The snapshot failed')),
        'image/png',
      ),
    );
  } finally {
    bitmap.close();
  }
}

export interface SnapshotRequest {
  adapter: ViewerAdapter;
  frame: Size | null;
  settings: SnapshotSettings;
  caption: Caption;
  now?: Date;
}

export async function takeSnapshot({
  adapter,
  frame,
  settings,
  caption,
  now = new Date(),
}: SnapshotRequest): Promise<Blob> {
  const usable = frame && frame.width > 0 && frame.height > 0 ? frame : null;
  const size = usable ? snapshotSize(usable, settings) : null;
  const image = size
    ? await adapter.getScreenshot(size.width, size.height)
    : await adapter.getScreenshot();
  return settings.overlay
    ? drawCaption(image, captionText(caption, now))
    : image;
}
