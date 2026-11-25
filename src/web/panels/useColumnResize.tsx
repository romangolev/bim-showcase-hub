import type {
  ComponentProps,
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  TouchEvent,
} from 'react';
import type { TableResizeHandle } from '../ui/Table.js';

export const COLUMN_LIMITS = { minSize: 48, maxSize: 1600 };
const RESIZE_STEP = 16;

type ResizeHandleProps = ComponentProps<typeof TableResizeHandle>;
type ResizeEvent = MouseEvent<HTMLHRElement> | TouchEvent<HTMLHRElement>;
type ColumnSizing = Record<string, number>;

interface ResizeColumn {
  id: string;
  getIsResizing(): boolean;
}

interface ResizeHeader {
  column: ResizeColumn;
  getSize(): number;
  getResizeHandler(): (event: unknown) => void;
}

interface ResizeTable {
  state: { columnSizing: ColumnSizing };
  getAllLeafColumns(): readonly { id: string }[];
  setColumnSizing(
    updater: ColumnSizing | ((old: ColumnSizing) => ColumnSizing),
  ): void;
  resetColumnSizing(defaultState?: boolean): void;
  getTotalSize(): number;
}

interface ResizeOptions {
  [key: string]: unknown;
  columnResizeDirection?: 'ltr' | 'rtl';
}

function readDirection(element: Element): 'ltr' | 'rtl' {
  const scope = element.closest('[dir]');
  const value =
    scope?.getAttribute('dir') ?? getComputedStyle(element).direction;
  return value === 'rtl' ? 'rtl' : 'ltr';
}

function nudge(event: KeyboardEvent, direction: 'ltr' | 'rtl'): number {
  const grow =
    direction === 'rtl'
      ? event.key === 'ArrowLeft'
      : event.key === 'ArrowRight';
  const shrink =
    direction === 'rtl'
      ? event.key === 'ArrowRight'
      : event.key === 'ArrowLeft';
  return grow ? RESIZE_STEP : shrink ? -RESIZE_STEP : 0;
}

export function useColumnResize(table: ResizeTable) {
  const sized = Object.keys(table.state.columnSizing).length > 0;
  const freeze = (handle: Element) => {
    if (sized) return;
    const cells = handle.closest('tr')?.children;
    const widths: ColumnSizing = {};
    table.getAllLeafColumns().forEach((column, index) => {
      widths[column.id] = cells?.[index]?.getBoundingClientRect().width ?? 0;
    });
    table.setColumnSizing(widths);
  };
  const begin = (header: ResizeHeader, event: ResizeEvent) => {
    freeze(event.currentTarget);
    const direction = readDirection(event.currentTarget);
    (
      table as unknown as {
        setOptions(updater: (old: ResizeOptions) => ResizeOptions): void;
      }
    ).setOptions((old) => ({ ...old, columnResizeDirection: direction }));
    header.getResizeHandler()(event);
  };
  const resizeProps = (
    header: ResizeHeader,
    label: string,
  ): ResizeHandleProps => ({
    label,
    value: sized ? Math.round(header.getSize()) : undefined,
    active: header.column.getIsResizing(),
    onMouseDown: (event) => {
      event.preventDefault();
      begin(header, event);
    },
    onTouchStart: (event) => begin(header, event),
    onDoubleClick: () => table.resetColumnSizing(true),
    onKeyDown: (event) => {
      if (event.key === 'Enter') {
        table.resetColumnSizing(true);
        return;
      }
      const step = nudge(event, readDirection(event.currentTarget));
      if (!step) return;
      event.preventDefault();
      freeze(event.currentTarget);
      table.setColumnSizing((old) => ({
        ...old,
        [header.column.id]: Math.min(
          COLUMN_LIMITS.maxSize,
          Math.max(COLUMN_LIMITS.minSize, (old[header.column.id] ?? 0) + step),
        ),
      }));
    },
  });
  return {
    sized,
    tableStyle: sized
      ? ({ width: table.getTotalSize() } as CSSProperties)
      : undefined,
    headStyle: (header: ResizeHeader): CSSProperties | undefined =>
      sized ? { width: header.getSize() } : undefined,
    resizeProps,
  };
}
