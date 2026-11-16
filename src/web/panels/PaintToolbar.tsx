import { useEffect, useState } from 'react';
import { Icon } from '../components/icons.js';
import {
  PAINT_PRESETS,
  paintSelection,
  RESET_PAINT_LABEL,
  resetPaint,
} from '../extensions/paintBrushes.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { PaintSwatch } from './PaintChip.js';
import { useResolvedAdapter } from './usePropertyRows.js';
import './panels.css';

const PAINT_HINT = 'Select elements to paint';
const RESET_HINT = 'Nothing painted yet';

export interface PaintToolbarProps {
  adapter?: ViewerAdapter | null;
  className?: string;
}

export function PaintToolbar({ adapter, className }: PaintToolbarProps) {
  const resolved = useResolvedAdapter(adapter);
  const disabled = !resolved;
  const [selectionCount, setSelectionCount] = useState(0);
  const [painted, setPainted] = useState(false);
  const noSelection = selectionCount === 0;

  useEffect(() => {
    setPainted(false);
    if (!resolved) {
      setSelectionCount(0);
      return;
    }
    setSelectionCount(resolved.getSelection().length);
    return resolved.onSelectionChange((ids) => setSelectionCount(ids.length));
  }, [resolved]);
  return (
    <fieldset
      className={`bsh-paint ${className ?? ''}`.trim()}
      aria-label="Paint tools"
    >
      <span className="bsh-paint__label">Paint selection</span>
      {PAINT_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="bsh-icon-button bsh-paint__chip"
          aria-label={preset.label}
          title={noSelection ? PAINT_HINT : preset.label}
          disabled={disabled}
          aria-disabled={!disabled && noSelection ? true : undefined}
          onClick={() => {
            if (
              resolved &&
              !noSelection &&
              paintSelection(resolved, preset.color)
            ) {
              setPainted(true);
            }
          }}
        >
          <PaintSwatch preset={preset} />
        </button>
      ))}
      <button
        type="button"
        className="bsh-icon-button bsh-paint__reset"
        aria-label={RESET_PAINT_LABEL}
        title={painted ? RESET_PAINT_LABEL : RESET_HINT}
        disabled={disabled}
        aria-disabled={!disabled && !painted ? true : undefined}
        onClick={() => {
          if (resolved && painted) {
            resetPaint(resolved);
            setPainted(false);
          }
        }}
      >
        <Icon name="refresh" size={16} />
      </button>
    </fieldset>
  );
}
