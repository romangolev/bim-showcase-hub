import type { ReactNode } from 'react';
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
