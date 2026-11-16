import {
  PAINT_PRESETS,
  paintSelection,
  RESET_PAINT_LABEL,
  resetPaint,
} from '../extensions/paintBrushes.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { useResolvedAdapter } from './usePropertyRows.js';
import './panels.css';

export interface PaintToolbarProps {
  adapter?: ViewerAdapter | null;
  className?: string;
}

export function PaintToolbar({ adapter, className }: PaintToolbarProps) {
  const resolved = useResolvedAdapter(adapter);
  const disabled = !resolved;
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
          className="bsh-icon-button"
          aria-label={preset.label}
          title={preset.label}
          disabled={disabled}
          onClick={() => resolved && paintSelection(resolved, preset.color)}
        >
          <span
            className="bsh-paint__swatch"
            style={{ background: preset.swatch }}
          />
        </button>
      ))}
      <button
        type="button"
        className="bsh-button"
        disabled={disabled}
        onClick={() => resolved && resetPaint(resolved)}
      >
        {RESET_PAINT_LABEL}
      </button>
    </fieldset>
  );
}
