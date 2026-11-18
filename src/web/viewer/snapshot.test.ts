import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import {
  captionText,
  drawCaption,
  MAX_SIDE,
  SNAPSHOT,
  SNAPSHOT_DEFAULTS,
  SnapshotError,
  sanitizeSnapshot,
  snapshotSize,
  takeSnapshot,
} from './snapshot.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

const FRAME = { width: 1000, height: 500 };

let restore: ReturnType<typeof setStorageAdapter>;
beforeEach(() => {
  restore = setStorageAdapter(memoryAdapter());
});
afterEach(() => {
  setStorageAdapter(restore);
});

describe('snapshot settings', () => {
  it('falls back to defaults and clamps values', () => {
    expect(sanitizeSnapshot(null)).toEqual(SNAPSHOT_DEFAULTS);
    expect(
      sanitizeSnapshot({
        resolution: 'huge',
        customWidth: 99999,
        overlay: 'yes',
        advanceSeconds: -4,
      }),
    ).toEqual({ ...SNAPSHOT_DEFAULTS, customWidth: MAX_SIDE });
  });

  it('persists through the record', () => {
    SNAPSHOT.write({ ...SNAPSHOT_DEFAULTS, resolution: '2x', overlay: true });
    expect(SNAPSHOT.read()).toMatchObject({ resolution: '2x', overlay: true });
  });
});

describe('snapshotSize', () => {
  it('leaves 1x to the viewer', () => {
    expect(snapshotSize(FRAME, SNAPSHOT_DEFAULTS)).toBeNull();
  });

  it('doubles the pane', () => {
    expect(
      snapshotSize(FRAME, { ...SNAPSHOT_DEFAULTS, resolution: '2x' }),
    ).toEqual({ width: 2000, height: 1000 });
  });

  it('keeps the aspect ratio for a custom width', () => {
    expect(
      snapshotSize(FRAME, {
        ...SNAPSHOT_DEFAULTS,
        resolution: 'custom',
        customWidth: 1600,
      }),
    ).toEqual({ width: 1600, height: 800 });
  });

  it('fails visibly above the pixel cap', () => {
    expect(() =>
      snapshotSize(
        { width: 5000, height: 4000 },
        { ...SNAPSHOT_DEFAULTS, resolution: '2x' },
      ),
    ).toThrow(SnapshotError);
    expect(() =>
      snapshotSize(
        { width: 1000, height: 1000 },
        { ...SNAPSHOT_DEFAULTS, resolution: 'custom', customWidth: 8000 },
      ),
    ).toThrow('Snapshot too large: 8000 by 8000 pixels');
  });
});

describe('takeSnapshot', () => {
  const blob = new Blob(['x'], { type: 'image/png' });
  const adapter = () =>
    ({ getScreenshot: vi.fn().mockResolvedValue(blob) }) as unknown as Pick<
      ViewerAdapter,
      'getScreenshot'
    > &
      ViewerAdapter;

  it('asks the adapter for the computed size', async () => {
    const viewer = adapter();
    const out = await takeSnapshot({
      adapter: viewer,
      frame: FRAME,
      settings: { ...SNAPSHOT_DEFAULTS, resolution: '2x' },
      caption: { name: 'Tower' },
    });
    expect(viewer.getScreenshot).toHaveBeenCalledWith(2000, 1000);
    expect(out).toBe(blob);
  });

  it('uses the pane size without arguments at 1x', async () => {
    const viewer = adapter();
    await takeSnapshot({
      adapter: viewer,
      frame: FRAME,
      settings: SNAPSHOT_DEFAULTS,
      caption: { name: 'Tower' },
    });
    expect(viewer.getScreenshot).toHaveBeenCalledWith();
  });

  it('builds the caption from name, version and date', () => {
    expect(
      captionText({ name: 'Tower', version: 'v3' }, new Date(2026, 10, 19, 10)),
    ).toBe('Tower  |  v3  |  2026-11-19');
  });

  it('uses the local calendar day, not the UTC day', () => {
    const lateEvening = new Date(2026, 10, 17, 23, 30);
    const earlyMorning = new Date(2026, 0, 5, 0, 15);
    expect(captionText({ name: 'T' }, lateEvening)).toBe('T  |  2026-11-17');
    expect(captionText({ name: 'T' }, earlyMorning)).toBe('T  |  2026-01-05');
  });
});

describe('drawCaption', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubCanvas(context: object | null) {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 10, height: 10, close })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as never,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) =>
      cb(new Blob(['x'])),
    );
    return close;
  }

  it('closes the bitmap after drawing', async () => {
    const close = stubCanvas({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
    });
    await drawCaption(new Blob(['a']), 'caption');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the bitmap when drawing fails', async () => {
    const close = stubCanvas(null);
    await expect(drawCaption(new Blob(['a']), 'caption')).rejects.toThrow(
      SnapshotError,
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});
