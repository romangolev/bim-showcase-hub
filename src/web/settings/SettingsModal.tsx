import { useId } from 'react';
import type { ModalDefinition } from '../modal/types.js';
import { useTheme } from '../theme/ThemeContext.js';
import { IfcSettingsSection } from './IfcSettingsSection.js';
import { useSettings } from './SettingsContext.js';

interface ExperimentalFeature {
  key: 'paintBrushes' | 'excelExport' | 'glbExport' | 'ifcExport';
  label: string;
  description: string;
}

export const EXPERIMENTAL_FEATURES: readonly ExperimentalFeature[] = [
  {
    key: 'paintBrushes',
    label: 'Paint brushes',
    description: 'Colour the selected elements from the viewer toolbar.',
  },
  {
    key: 'excelExport',
    label: 'Excel export',
    description:
      'Export element properties to an .xlsx file from the viewer toolbar.',
  },
  {
    key: 'glbExport',
    label: 'Geometry export',
    description:
      'Export the model geometry to a .glb file from the viewer toolbar.',
  },
  {
    key: 'ifcExport',
    label: 'IFC export',
    description:
      'Export the model to an .ifc file from the viewer toolbar, using the IFC export settings below.',
  },
];

interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}

function SwitchRow({ label, description, checked, onChange }: SwitchRowProps) {
  const hintId = useId();
  return (
    <label className="switch-row">
      <span className="switch-row__text">
        <span className="switch-row__label">{label}</span>
        {description ? (
          <span id={hintId} className="switch-row__hint">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        aria-label={label}
        aria-describedby={description ? hintId : undefined}
        onChange={onChange}
      />
    </label>
  );
}

export function SettingsBody() {
  const { theme, toggleTheme } = useTheme();
  const { settings, setSetting } = useSettings();
  return (
    <div className="settings">
      <section
        className="settings__section"
        aria-labelledby="settings-appearance"
      >
        <h3 id="settings-appearance" className="settings__heading">
          Appearance
        </h3>
        <SwitchRow
          label="Dark theme"
          checked={theme === 'dark'}
          onChange={toggleTheme}
        />
      </section>
      <section
        className="settings__section"
        aria-labelledby="settings-experimental"
      >
        <h3 id="settings-experimental" className="settings__heading">
          Experimental features
        </h3>
        {EXPERIMENTAL_FEATURES.map((feature) => (
          <SwitchRow
            key={feature.key}
            label={feature.label}
            description={feature.description}
            checked={settings[feature.key]}
            onChange={() => setSetting(feature.key, !settings[feature.key])}
          />
        ))}
      </section>
      <IfcSettingsSection />
    </div>
  );
}

export const SETTINGS_MODAL: ModalDefinition = {
  id: 'settings',
  title: 'Settings',
  size: 'lg',
  Body: SettingsBody,
};
