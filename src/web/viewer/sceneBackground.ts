export type SceneBackground = readonly [
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
];

type Channels = readonly [number, number, number];

const FALLBACK_TOP: Channels = [19, 20, 22];
const FALLBACK_BOTTOM: Channels = [11, 12, 14];

function parseColor(value: string, fallback: Channels): Channels {
  const text = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text);
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return fallback;
}

export function readSceneBackground(
  root: Element = document.documentElement,
): SceneBackground {
  const style = getComputedStyle(root);
  const top = parseColor(
    style.getPropertyValue('--color-graphite'),
    FALLBACK_TOP,
  );
  const bottom = parseColor(
    style.getPropertyValue('--color-void'),
    FALLBACK_BOTTOM,
  );
  return [...top, ...bottom];
}
