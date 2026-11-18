import { useId } from 'react';
import {
  DEFAULT_PAINT_INTENSITY,
  DEFAULT_PAINT_PALETTE,
  MAX_PAINT_SWATCHES,
  NEW_SWATCH_COLOR,
} from '../../extensions/paintBrushes.js';
import { usePersistedSetting } from '../kernel/persistedSetting.js';
import { PAINT_SETTINGS } from './paintSettings.js';

export function PaintFields() {
  const [{ palette, intensity }, setSettings] =
    usePersistedSetting(PAINT_SETTINGS);
  const intensityId = useId();
  const setPalette = (next: string[]) =>
    setSettings((current) => ({ ...current, palette: next }));
  const setIntensity = (next: number) =>
    setSettings((current) => ({ ...current, intensity: next }));
  return (
    <section className="settings__section" aria-labelledby="settings-paint">
      <h3 id="settings-paint" className="settings__heading">
        Paint palette
      </h3>
      <p className="settings__hint">
        The swatches in the viewer toolbar paint menu follow this palette.
      </p>
      <ul className="settings__palette">
        {palette.map((color, index) => (
          <li key={index} className="settings__palette-item">
            <input
              type="color"
              value={color}
              aria-label={`Swatch ${index + 1}`}
              onChange={(event) =>
                setPalette(
                  palette.map((item, at) =>
                    at === index ? event.target.value.toLowerCase() : item,
                  ),
                )
              }
            />
            <button
              type="button"
              className="btn"
              aria-label={`Remove swatch ${index + 1}`}
              disabled={palette.length <= 1}
              onClick={() =>
                setPalette(palette.filter((_, at) => at !== index))
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="settings__actions">
        <button
          type="button"
          className="btn"
          disabled={palette.length >= MAX_PAINT_SWATCHES}
          onClick={() => setPalette([...palette, NEW_SWATCH_COLOR])}
        >
          Add swatch
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            setSettings((current) => ({
              ...current,
              palette: [...DEFAULT_PAINT_PALETTE],
              intensity: DEFAULT_PAINT_INTENSITY,
            }))
          }
        >
          Reset palette
        </button>
      </div>
      <div className="settings__field">
        <label htmlFor={intensityId}>
          Intensity {Math.round(intensity * 100)}%
        </label>
        <input
          id={intensityId}
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={intensity}
          onChange={(event) => setIntensity(Number(event.target.value))}
        />
        <span className="settings__hint">
          How strongly the colour replaces the model's own colour. This is
          theming intensity, not transparency.
        </span>
      </div>
    </section>
  );
}
