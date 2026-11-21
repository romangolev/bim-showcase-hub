import { useId } from 'react';
import { SwitchRow } from '../components/SwitchRow.js';
import type { ChartPaletteId } from '../extensions/dashboardData.js';
import {
  CHART_PALETTE_IDS,
  CHART_PALETTE_LABELS,
  useChartSettings,
} from '../panels/chartSettings.js';

export function ChartSettingsSection() {
  const [settings, update] = useChartSettings();
  const paletteId = useId();
  return (
    <section className="settings__section" aria-labelledby="settings-charts">
      <h3 id="settings-charts" className="settings__heading">
        Charts
      </h3>
      <div className="settings__field">
        <label htmlFor={paletteId}>Chart palette</label>
        <select
          id={paletteId}
          value={settings.palette}
          onChange={(event) =>
            update((prev) => ({
              ...prev,
              palette: event.target.value as ChartPaletteId,
            }))
          }
        >
          {CHART_PALETTE_IDS.map((id) => (
            <option key={id} value={id}>
              {CHART_PALETTE_LABELS[id]}
            </option>
          ))}
        </select>
        <span className="settings__hint">
          Colours every bar, slice, legend swatch and table swatch.
        </span>
      </div>
      <SwitchRow
        label="Pattern fills"
        description="Textures each series so neighbouring colours stay apart in print."
        checked={settings.patterns}
        onChange={() =>
          update((prev) => ({ ...prev, patterns: !prev.patterns }))
        }
      />
      <SwitchRow
        label="Always show the data table"
        description="Keeps the table under every chart open instead of collapsed."
        checked={settings.dataTable}
        onChange={() =>
          update((prev) => ({ ...prev, dataTable: !prev.dataTable }))
        }
      />
    </section>
  );
}
