import type { ReactNode } from 'react';
import {
  type FormDefinition,
  SettingsForm,
} from '../../components/SettingsForm.js';
import { SwitchRow } from '../../components/SwitchRow.js';
import { usePersistedSetting } from './persistedSetting.js';
import type { ToolSettings, ViewerTool } from './ViewerTool.js';

interface ToolSettingsFrameProps {
  tool: ViewerTool<ToolSettings>;
  children?: ReactNode;
}

export function ToolSettingsFrame({ tool, children }: ToolSettingsFrameProps) {
  const [settings, setSettings] = usePersistedSetting(tool.settings);
  return (
    <div className="settings">
      <section className="settings__section">
        <SwitchRow
          label={tool.title}
          description={tool.description}
          checked={settings.enabled}
          onChange={() =>
            setSettings((current) => ({
              ...current,
              enabled: !current.enabled,
            }))
          }
        />
      </section>
      {children}
    </div>
  );
}

interface ToolFormProps<S extends ToolSettings> {
  tool: ViewerTool<S>;
  form: FormDefinition<S>;
}

export function ToolForm<S extends ToolSettings>({
  tool,
  form,
}: ToolFormProps<S>) {
  const [settings, setSettings] = usePersistedSetting(tool.settings);
  return (
    <SettingsForm
      form={form}
      value={settings}
      onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
    />
  );
}
