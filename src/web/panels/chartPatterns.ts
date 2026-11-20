export const PATTERN_SHAPES = [
  'solid',
  'diagonal',
  'dots',
  'cross',
  'horizontal',
  'vertical',
] as const;

export type ChartPatternShape = (typeof PATTERN_SHAPES)[number];

const TILE_SIZE = 10;
const INK = 'rgba(255,255,255,0.55)';

export function patternFor(index: number): ChartPatternShape {
  const length = PATTERN_SHAPES.length;
  const slot = ((Math.trunc(index) % length) + length) % length;
  return PATTERN_SHAPES[slot] ?? 'solid';
}

type TileContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function drawTile(ctx: TileContext, shape: ChartPatternShape): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (shape === 'diagonal') {
    ctx.moveTo(-1, TILE_SIZE + 1);
    ctx.lineTo(TILE_SIZE + 1, -1);
    ctx.moveTo(-1, 1);
    ctx.lineTo(1, -1);
    ctx.moveTo(TILE_SIZE - 1, TILE_SIZE + 1);
    ctx.lineTo(TILE_SIZE + 1, TILE_SIZE - 1);
    ctx.stroke();
    return;
  }
  if (shape === 'dots') {
    ctx.fillStyle = INK;
    ctx.arc(TILE_SIZE / 2, TILE_SIZE / 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (shape === 'cross') {
    ctx.moveTo(0, TILE_SIZE / 2);
    ctx.lineTo(TILE_SIZE, TILE_SIZE / 2);
    ctx.moveTo(TILE_SIZE / 2, 0);
    ctx.lineTo(TILE_SIZE / 2, TILE_SIZE);
    ctx.stroke();
    return;
  }
  if (shape === 'horizontal') {
    for (const y of [2.5, 7.5]) {
      ctx.moveTo(0, y);
      ctx.lineTo(TILE_SIZE, y);
    }
    ctx.stroke();
    return;
  }
  for (const x of [2.5, 7.5]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TILE_SIZE);
  }
  ctx.stroke();
}

function createTile(
  color: string,
  shape: ChartPatternShape,
): OffscreenCanvas | HTMLCanvasElement | null {
  let tile: OffscreenCanvas | HTMLCanvasElement;
  if (typeof OffscreenCanvas === 'function') {
    tile = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    tile = canvas;
  }
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  drawTile(ctx, shape);
  return tile;
}

export function patternFill(
  ctx: CanvasRenderingContext2D,
  color: string,
  index: number,
): CanvasPattern | string {
  const shape = patternFor(index);
  if (shape === 'solid') return color;
  const tile = createTile(color, shape);
  if (!tile) return color;
  return ctx.createPattern(tile, 'repeat') ?? color;
}
