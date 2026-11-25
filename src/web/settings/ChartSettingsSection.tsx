import { SettingsField } from '../components/SettingsForm.js';
import { SwitchRow } from '../components/SwitchRow.js';
import type { ChartPaletteId } from '../extensions/dashboardData.js';
import { useT } from '../i18n/i18n.js';
import {
  CHART_PALETTE_IDS,
  CHART_PALETTE_LABELS,
  useChartSettings,
} from '../panels/chartSettings.js';
import { Select, SelectOption } from '../ui/Select.js';

export function ChartSettingsSection() {
  const t = useT();
  const [settings, update] = useChartSettings();
  return (
    <section className="settings__section" aria-labelledby="settings-charts">
      <h3 id="settings-charts" className="settings__heading">
        {t('settings.charts')}
      </h3>
      <SettingsField
        label="Chart palette"
        hint="Colours every bar, slice, legend swatch and table swatch."
      >
        {(id) => (
          <>
            <Select
              id={id}
              value={settings.palette}
              onValueChange={(next) =>
                update((prev) => ({
                  ...prev,
                  palette: next as ChartPaletteId,
                }))
              }
            >
              {CHART_PALETTE_IDS.map((id) => (
                <SelectOption key={id} value={id}>
                  {CHART_PALETTE_LABELS[id]}
                </SelectOption>
              ))}
            </Select>
          </>
        )}
      </SettingsField>
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
