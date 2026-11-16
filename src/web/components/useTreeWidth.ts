import { useCallback, useState } from 'react';

export const TREE_WIDTH_KEY = 'bsh.tree.width';
export const TREE_WIDTH_DEFAULT = 320;
export const TREE_WIDTH_MIN = 260;
export const TREE_WIDTH_MAX = 480;

export function clampTreeWidth(value: number): number {
  if (!Number.isFinite(value)) {
    return TREE_WIDTH_DEFAULT;
  }
  return Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(value)));
}

function readWidth(): number {
  try {
    const stored = window.localStorage.getItem(TREE_WIDTH_KEY);
    if (stored !== null) {
      return clampTreeWidth(Number(stored));
    }
  } catch {
    return TREE_WIDTH_DEFAULT;
  }
  return TREE_WIDTH_DEFAULT;
}

function writeWidth(width: number) {
  try {
    window.localStorage.setItem(TREE_WIDTH_KEY, String(width));
  } catch {
    return;
  }
}

export function useTreeWidth() {
  const [width, setWidth] = useState(readWidth);

  const preview = useCallback((next: number) => {
    setWidth(clampTreeWidth(next));
  }, []);

  const commit = useCallback((next: number) => {
    const clamped = clampTreeWidth(next);
    setWidth(clamped);
    writeWidth(clamped);
  }, []);

  return { width, preview, commit };
}
