import { SwitchRow } from '../components/SwitchRow.js';
import { useT } from '../i18n/i18n.js';
import { useModal } from '../modal/ModalContext.js';
import { usePersisted } from '../storage.js';
import { NotificationSettingsSection } from '../tasks/NotificationSettingsSection.js';
import { TOOLS } from '../tools/index.js';
import type { AnyViewerTool } from '../tools/kernel/ToolRegistry.js';
import { ChartSettingsSection } from './ChartSettingsSection.js';
import {
  PANE_SETTINGS_ORDER,
  PANE_SETTINGS_SCHEMA,
  type PaneSettingsSchema,
} from './paneSettingsSchema.js';
import { SavedItemsSettings } from './SavedItemsSettings.js';
import { SnapshotSettings } from './SnapshotSettings.js';

interface EntryRowProps {
  title: string;
  description: string;
  toggle?: { checked: boolean; onChange: () => void };
  modalId?: string;
  windowTitle: string;
}

function EntryRow({
  title,
  description,
  toggle,
  modalId,
  windowTitle,
}: EntryRowProps) {
  const modal = useModal();
  return (
    <div className="settings__entry">
      {toggle ? (
        <SwitchRow
          label={title}
          description={description}
          checked={toggle.checked}
          onChange={toggle.onChange}
        />
      ) : (
        <span className="settings__entry-text">
          <span className="switch-row__label">{title}</span>
          <span className="switch-row__hint">{description}</span>
        </span>
      )}
      {modalId ? (
        <button
          type="button"
          className="btn"
          aria-label={windowTitle}
          onClick={() => modal.open(modalId)}
        >
          Settings
        </button>
      ) : null}
    </div>
  );
}

function ToolEntry({ tool }: { tool: AnyViewerTool }) {
  const [settings, setSettings] = usePersisted(tool.settings);
  return (
    <EntryRow
      title={tool.title}
      description={tool.description}
      toggle={{
        checked: settings.enabled,
        onChange: () =>
          setSettings((current) => ({ ...current, enabled: !current.enabled })),
      }}
      modalId={tool.hasSettings ? tool.modalId : undefined}
      windowTitle={`${tool.title} settings`}
    />
  );
}

function PaneEntry({ schema }: { schema: PaneSettingsSchema }) {
  if (!schema.modalId) return null;
  return (
    <EntryRow
      title={schema.label}
      description={schema.description}
      modalId={schema.modalId}
      windowTitle={schema.windowTitle}
    />
  );
}

const PANE_ENTRIES = PANE_SETTINGS_ORDER.flatMap((id) => {
  const schema = PANE_SETTINGS_SCHEMA[id];
  return schema ? [{ id, schema }] : [];
});

const PANE_FORMS = PANE_ENTRIES.flatMap(({ id, schema }) =>
  schema.Body ? [{ id, Body: schema.Body }] : [],
);

export function SettingsEntries() {
  const t = useT();
  return (
    <>
      <section className="settings__section" aria-labelledby="settings-tools">
        <h3 id="settings-tools" className="settings__heading">
          {t('settings.tools')}
        </h3>
        {TOOLS.all().map((tool) => (
          <ToolEntry key={tool.id} tool={tool} />
        ))}
      </section>
      <section className="settings__section" aria-labelledby="settings-panes">
        <h3 id="settings-panes" className="settings__heading">
          {t('settings.panes')}
        </h3>
        {PANE_ENTRIES.map(({ id, schema }) => (
          <PaneEntry key={id} schema={schema} />
        ))}
      </section>
      {PANE_FORMS.map(({ id, Body }) => (
        <Body key={id} />
      ))}
      <NotificationSettingsSection />
      <ChartSettingsSection />
      <SnapshotSettings />
      <SavedItemsSettings />
    </>
  );
}
