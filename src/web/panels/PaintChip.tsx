import type { PaintPreset } from '../extensions/paintBrushes.js';
import './panels.css';
import { cn } from '../ui/cn.js';
import { iconButtonClasses } from '../ui/IconButton.js';

export function PaintSwatch({ preset }: { preset: PaintPreset }) {
  return (
    <span
      className="bsh-paint__swatch"
      style={{ background: preset.swatch }}
      aria-hidden="true"
    />
  );
}

export function StaticPaintChip({ preset }: { preset: PaintPreset }) {
  return (
    <span
      className={cn(iconButtonClasses, 'bsh-paint__chip')}
      role="img"
      aria-label={`${preset.colorName} paint`}
      title={`${preset.colorName} paint`}
    >
      <PaintSwatch preset={preset} />
    </span>
  );
}
