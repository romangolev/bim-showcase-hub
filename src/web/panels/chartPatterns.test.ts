import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATTERN_SHAPES, patternFill, patternFor } from './chartPatterns.js';

const tileCtx = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
};

function installOffscreen(getContext: () => unknown) {
  class FakeOffscreenCanvas {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
    getContext = getContext;
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('patternFor', () => {
  it('starts solid and cycles through the shapes', () => {
    expect(patternFor(0)).toBe('solid');
    expect(PATTERN_SHAPES.map((_, index) => patternFor(index))).toEqual(
      PATTERN_SHAPES,
    );
  });

  it('cycles pattern shapes so neighbours differ', () => {
    expect(patternFor(1)).not.toBe(patternFor(2));
    expect(patternFor(PATTERN_SHAPES.length)).toBe('solid');
    expect(patternFor(-1)).toBe(PATTERN_SHAPES.at(-1));
  });
});

describe('patternFill', () => {
  it('returns the plain colour for the solid shape', () => {
    const ctx = {
      createPattern: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    expect(patternFill(ctx, '#ff0000', 0)).toBe('#ff0000');
    expect(ctx.createPattern).not.toHaveBeenCalled();
  });

  it('falls back to the plain colour without a canvas pattern', () => {
    installOffscreen(() => null);
    const ctx = {
      createPattern: vi.fn(() => null),
    } as unknown as CanvasRenderingContext2D;
    expect(patternFill(ctx, '#ff0000', 1)).toBe('#ff0000');
  });

  it('tiles the colour and strokes the shape', () => {
    installOffscreen(() => tileCtx);
    const pattern = { pattern: true } as unknown as CanvasPattern;
    const ctx = {
      createPattern: vi.fn(() => pattern),
    } as unknown as CanvasRenderingContext2D;
    expect(patternFill(ctx, '#00ff00', 1)).toBe(pattern);
    expect(ctx.createPattern).toHaveBeenCalledWith(expect.anything(), 'repeat');
    expect(tileCtx.fillRect).toHaveBeenCalledWith(0, 0, 10, 10);
    expect(tileCtx.stroke).toHaveBeenCalled();
    expect(tileCtx.strokeStyle).toBe('rgba(255,255,255,0.55)');
  });
});
