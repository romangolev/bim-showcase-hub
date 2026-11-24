import {
  Children,
  Fragment,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
} from 'react';
import type { DashboardOrientation } from '../extensions/dashboardPresets.js';

export const KEY_STEP = 0.05;
export const MIN_FRACTION = 0.1;

export function equalSizes(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

export function resizeSizes(
  sizes: readonly number[],
  index: number,
  delta: number,
  min: number = MIN_FRACTION,
): number[] {
  const before = sizes[index];
  const after = sizes[index + 1];
  if (before === undefined || after === undefined) return [...sizes];
  const total = before + after;
  const floor = Math.min(min, total / 2);
  const nextBefore = Math.min(Math.max(before + delta, floor), total - floor);
  const next = [...sizes];
  next[index] = nextBefore;
  next[index + 1] = total - nextBefore;
  return next;
}

interface ChartBoardProps {
  orientation: DashboardOrientation;
  sizes: readonly number[];
  onSizes: (sizes: number[]) => void;
  labels: readonly string[];
  children: ReactNode;
}

interface DragState {
  index: number;
  start: number;
  sizes: readonly number[];
  extent: number;
}

export function ChartBoard({
  orientation,
  sizes,
  onSizes,
  labels,
  children,
}: ChartBoardProps) {
  const tiles = Children.toArray(children);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const horizontal = orientation === 'horizontal';
  const current =
    sizes.length === tiles.length ? sizes : equalSizes(tiles.length);

  const onPointerDown = (index: number) => (event: PointerEvent) => {
    const box = boardRef.current?.getBoundingClientRect();
    if (!box) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      index,
      start: horizontal ? event.clientX : event.clientY,
      sizes: current,
      extent: (horizontal ? box.width : box.height) || 1,
    };
  };
  const onPointerMove = (event: PointerEvent) => {
    const active = drag.current;
    if (!active) return;
    const moved = (horizontal ? event.clientX : event.clientY) - active.start;
    onSizes(resizeSizes(active.sizes, active.index, moved / active.extent));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (index: number) => (event: KeyboardEvent) => {
    const back = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const forward = horizontal ? 'ArrowRight' : 'ArrowDown';
    const pair = (current[index] ?? 0) + (current[index + 1] ?? 0);
    const deltas: Record<string, number> = {
      [back]: -KEY_STEP,
      [forward]: KEY_STEP,
      Home: -pair,
      End: pair,
    };
    const delta = deltas[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    onSizes(resizeSizes(current, index, delta));
  };

  return (
    <div
      ref={boardRef}
      className="bsh-board"
      data-orientation={orientation}
      style={{ ['--tiles' as string]: tiles.length }}
    >
      {tiles.map((tile, index) => {
        const before = current[index - 1] ?? 0;
        const share = current[index] ?? 1 / tiles.length;
        const key = (tile as { key?: string | null }).key ?? index;
        return (
          <Fragment key={key}>
            {index > 0 ? (
              <hr
                tabIndex={0}
                className="bsh-board__handle"
                aria-orientation={horizontal ? 'vertical' : 'horizontal'}
                aria-label={`Resize ${labels[index - 1] ?? 'chart'} and ${labels[index] ?? 'chart'}`}
                aria-valuemin={Math.round(MIN_FRACTION * 100)}
                aria-valuemax={Math.round(
                  (before + share - MIN_FRACTION) * 100,
                )}
                aria-valuenow={Math.round(before * 100)}
                onPointerDown={onPointerDown(index - 1)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={onKeyDown(index - 1)}
              />
            ) : null}
            <div className="bsh-board__tile" style={{ flexGrow: share }}>
              {tile}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
