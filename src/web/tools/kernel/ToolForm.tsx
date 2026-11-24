import {
  type FormDefinition,
  SettingsForm,
} from '../../components/SettingsForm.js';
import { usePersisted } from '../../storage.js';
import type { ToolSettings, ViewerTool } from './ViewerTool.js';

interface ToolFormProps<S extends ToolSettings> {
  tool: ViewerTool<S>;
  form: FormDefinition<S>;
}

export function ToolForm<S extends ToolSettings>({
  tool,
  form,
}: ToolFormProps<S>) {
  const [settings, setSettings] = usePersisted(tool.settings);
  return (
    <SettingsForm
      form={form}
      value={settings}
      onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
    />
  );
}
