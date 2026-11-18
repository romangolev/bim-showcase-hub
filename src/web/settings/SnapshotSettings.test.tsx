import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { fireEvent, render, screen } from '../test/render.js';
import { SNAPSHOT } from '../viewer/snapshot.js';
import { SnapshotSettings } from './SnapshotSettings.js';

let restore: ReturnType<typeof setStorageAdapter>;
beforeEach(() => {
  restore = setStorageAdapter(memoryAdapter());
});
afterEach(() => {
  setStorageAdapter(restore);
});

describe('SnapshotSettings', () => {
  it('persists resolution, caption and the custom width', () => {
    render(<SnapshotSettings />);
    fireEvent.change(screen.getByLabelText('Snapshot resolution'), {
      target: { value: 'custom' },
    });
    fireEvent.click(
      screen.getByRole('switch', { name: /Caption on snapshots/ }),
    );
    const width = screen.getByLabelText('Custom width (pixels)');
    fireEvent.change(width, { target: { value: '2400' } });
    fireEvent.blur(width);
    expect(SNAPSHOT.read()).toMatchObject({
      resolution: 'custom',
      overlay: true,
      customWidth: 2400,
    });
  });
});
