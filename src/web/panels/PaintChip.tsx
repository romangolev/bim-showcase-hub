import type { PaintPreset } from '../extensions/paintBrushes.js';
import './panels.css';

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
      className="bsh-icon-button bsh-paint__chip"
      role="img"
      aria-label={`${preset.colorName} paint`}
      title={`${preset.colorName} paint`}
    >
      <PaintSwatch preset={preset} />
    </span>
  );
}
