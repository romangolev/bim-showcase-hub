import { useModal } from '../modal/ModalContext.js';
import { DASHBOARD_SETTINGS_MODAL } from '../panels/DashboardSettings.js';
import { SUMMARY_SETTINGS_MODAL } from '../panels/SummarySettings.js';
import { TOOLS } from '../tools/index.js';
import { usePersistedSetting } from '../tools/kernel/persistedSetting.js';
import type { AnyViewerTool } from '../tools/kernel/ToolRegistry.js';
import { SavedItemsSettings } from './SavedItemsSettings.js';

interface EntryRowProps {
  title: string;
  description: string;
  state?: string;
  modalId: string;
  windowTitle: string;
}

function EntryRow({
  title,
  description,
  state,
  modalId,
  windowTitle,
}: EntryRowProps) {
  const modal = useModal();
  return (
    <div className="settings__entry">
      <span className="settings__entry-text">
        <span className="switch-row__label">{title}</span>
        <span className="switch-row__hint">{description}</span>
      </span>
      {state ? <span className="settings__entry-state">{state}</span> : null}
      <button
        type="button"
        className="btn"
        aria-label={windowTitle}
        onClick={() => modal.open(modalId)}
      >
        Settings
      </button>
    </div>
  );
}

function ToolEntry({ tool }: { tool: AnyViewerTool }) {
  const [settings] = usePersistedSetting(tool.settings);
  return (
    <EntryRow
      title={tool.title}
      description={tool.description}
      state={settings.enabled ? 'On' : 'Off'}
      modalId={tool.modalId}
      windowTitle={`${tool.title} settings`}
    />
  );
}

export function SettingsEntries() {
  return (
    <>
      <section className="settings__section" aria-labelledby="settings-tools">
        <h3 id="settings-tools" className="settings__heading">
          Tools
        </h3>
        {TOOLS.all().map((tool) => (
          <ToolEntry key={tool.id} tool={tool} />
        ))}
      </section>
      <section className="settings__section" aria-labelledby="settings-panes">
        <h3 id="settings-panes" className="settings__heading">
          Panes
        </h3>
        <EntryRow
          title="Model summary"
          description="Columns, sorting, density and the row click action."
          modalId={SUMMARY_SETTINGS_MODAL.id}
          windowTitle={SUMMARY_SETTINGS_MODAL.title}
        />
        <EntryRow
          title="Dashboard"
          description="Preset, chart type, categories and the chart click action."
          modalId={DASHBOARD_SETTINGS_MODAL.id}
          windowTitle={DASHBOARD_SETTINGS_MODAL.title}
        />
      </section>
      <SavedItemsSettings />
    </>
  );
}
