import { useModal } from '../modal/ModalContext.js';
import { usePersisted } from '../storage.js';
import { NotificationSettingsSection } from '../tasks/NotificationSettingsSection.js';
import { TOOLS } from '../tools/index.js';
import type { AnyViewerTool } from '../tools/kernel/ToolRegistry.js';
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
  const [settings] = usePersisted(tool.settings);
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
        {PANE_ENTRIES.map(({ id, schema }) => (
          <PaneEntry key={id} schema={schema} />
        ))}
      </section>
      {PANE_FORMS.map(({ id, Body }) => (
        <Body key={id} />
      ))}
      <NotificationSettingsSection />
      <SnapshotSettings />
      <SavedItemsSettings />
    </>
  );
}
