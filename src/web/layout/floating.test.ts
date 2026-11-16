import { describe, expect, it } from 'vitest';
import { floatingBox } from './DockLayout.js';

describe('floatingBox', () => {
  it('keeps the size of the group it came from when it fits', () => {
    expect(
      floatingBox({ width: 1400, height: 800 }, { width: 400, height: 300 }),
    ).toEqual({
      width: 400,
      height: 300,
      position: { left: 500, top: 167 },
    });
  });

  it('caps a large group at 60 percent of the dock', () => {
    const box = floatingBox(
      { width: 1000, height: 800 },
      { width: 900, height: 700 },
    );
    expect(box.width).toBe(600);
    expect(box.height).toBe(480);
  });

  it('never floats smaller than a usable minimum', () => {
    const box = floatingBox(
      { width: 1400, height: 900 },
      { width: 33, height: 33 },
    );
    expect(box.width).toBe(360);
    expect(box.height).toBe(280);
    expect(box.position.left).toBeGreaterThanOrEqual(0);
  });
});
