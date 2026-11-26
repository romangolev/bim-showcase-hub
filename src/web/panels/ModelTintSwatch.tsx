import { useRef, useState } from 'react';
import { Button } from '../ui/Button.js';
import {
  Popover,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from '../ui/Popover.js';
import { Slider } from '../ui/Slider.js';
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
  const popupRef = useRef<HTMLDivElement>(null);
  const value = tint?.strength ?? strength;
  return (
    <span className="bsh-models__tint">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="bsh-models__swatch"
          style={tint ? { backgroundColor: tint.color } : undefined}
          aria-label={`Tint ${modelName}`}
          title={
            tint
              ? `${tintName(tint.color)}, ${Math.round(tint.strength * 100)}%`
              : 'Add a colour'
          }
        />
        <PopoverPopup
          ref={popupRef}
          className="bsh-tint"
          align="end"
          initialFocus={popupRef}
        >
          <PopoverTitle
            className="bsh-tint__title"
            render={<p />}
            title={modelName}
          >
            {modelName}
          </PopoverTitle>
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
          <div className="bsh-tint__strength">
            <span>Tint strength</span>
            <Slider
              min={MIN_TINT_STRENGTH}
              max={MAX_TINT_STRENGTH}
              step={TINT_STRENGTH_STEP}
              value={value}
              aria-label={`Tint strength for ${modelName}`}
              onValueChange={(next) => onStrength(clampTintStrength(next))}
            />
            <span>{Math.round(value * 100)}%</span>
          </div>
          <div className="bsh-tint__actions">
            <Button
              disabled={!tint}
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Clear colour
            </Button>
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
            <Button onClick={onResetPalette}>Use default palette</Button>
          </details>
        </PopoverPopup>
      </Popover>
    </span>
  );
}
