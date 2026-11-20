import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { onEscape, usePopover } from '../components/usePopover.js';
import {
  clampTintStrength,
  MAX_TINT_STRENGTH,
  MIN_TINT_STRENGTH,
  type ModelTint,
  TINT_STRENGTH_STEP,
  tintName,
} from './modelTint.js';

export interface ModelTintSwatchProps {
  modelName: string;
  palette: readonly string[];
  tint: ModelTint | null;
  strength: number;
  onPick: (hex: string) => void;
  onStrength: (strength: number) => void;
  onClear: () => void;
  onPaletteColor: (index: number, hex: string) => void;
  onResetPalette: () => void;
}

export function ModelTintSwatch({
  modelName,
  palette,
  tint,
  strength,
  onPick,
  onStrength,
  onClear,
  onPaletteColor,
  onResetPalette,
}: ModelTintSwatchProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const position = usePopover({
    open,
    triggerRef,
    popoverRef,
    onDismiss: () => setOpen(false),
  });
  useEffect(() => {
    if (!open) return;
    popoverRef.current?.focus();
  }, [open]);
  const value = tint?.strength ?? strength;
  return (
    <span className="bsh-models__tint">
      <button
        ref={triggerRef}
        type="button"
        className="bsh-models__swatch"
        style={tint ? { backgroundColor: tint.color } : undefined}
        aria-label={`Tint ${modelName}`}
        title={
          tint
            ? `${tintName(tint.color)}, ${Math.round(tint.strength * 100)}%`
            : 'Add a colour'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      />
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="bsh-tint"
              role="dialog"
              aria-labelledby={labelId}
              tabIndex={-1}
              style={
                position
                  ? { top: position.top, left: position.left }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
              onKeyDown={(event) =>
                onEscape(event, () => {
                  setOpen(false);
                  triggerRef.current?.focus();
                })
              }
            >
              <p id={labelId} className="bsh-tint__title">
                {modelName}
              </p>
              <div className="bsh-tint__swatches">
                {palette.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className="bsh-tint__swatch"
                    style={{ backgroundColor: hex }}
                    aria-label={`Tint ${modelName} in ${tintName(hex)}`}
                    aria-pressed={tint?.color === hex}
                    onClick={() => {
                      onPick(hex);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
              <label className="bsh-tint__strength">
                <span>Tint strength</span>
                <input
                  type="range"
                  min={MIN_TINT_STRENGTH}
                  max={MAX_TINT_STRENGTH}
                  step={TINT_STRENGTH_STEP}
                  value={value}
                  aria-label={`Tint strength for ${modelName}`}
                  onChange={(event) =>
                    onStrength(clampTintStrength(Number(event.target.value)))
                  }
                />
                <span>{Math.round(value * 100)}%</span>
              </label>
              <div className="bsh-tint__actions">
                <button
                  type="button"
                  className="bsh-button"
                  disabled={!tint}
                  onClick={() => {
                    onClear();
                    setOpen(false);
                  }}
                >
                  Clear colour
                </button>
              </div>
              <details className="bsh-tint__palette">
                <summary>Edit palette</summary>
                <div className="bsh-tint__inputs">
                  {palette.map((hex, index) => (
                    <input
                      key={index}
                      type="color"
                      value={hex}
                      aria-label={`Palette colour ${index + 1}`}
                      onChange={(event) =>
                        onPaletteColor(index, event.target.value.toLowerCase())
                      }
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="bsh-button"
                  onClick={onResetPalette}
                >
                  Use default palette
                </button>
              </details>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
