import { SwitchRow } from '../components/SwitchRow.js';
import { useT } from '../i18n/i18n.js';
import { useModal } from '../modal/ModalContext.js';
import { usePersisted } from '../storage.js';
import { TOOLS } from '../tools/index.js';
import type { AnyViewerTool } from '../tools/kernel/ToolRegistry.js';
import { Button } from '../ui/Button.js';
import { FieldContent, FieldHint, FieldTitle } from '../ui/Field.js';
import {
  PANE_SETTINGS_ORDER,
  PANE_SETTINGS_SCHEMA,
  type PaneSettingsSchema,
} from './paneSettingsSchema.js';
import { openSettingsSection, settingsSelection } from './settingsSections.js';

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
  const t = useT();
  const openWithBack = (id: string) => {
    const { selected } = settingsSelection();
    modal.open(id, {
      label: t('settings.backToSettings'),
      go: () => {
        if (selected) openSettingsSection(selected);
        modal.open('settings');
      },
    });
  };
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
        <FieldContent className="settings__entry-text">
          <FieldTitle>{title}</FieldTitle>
          <FieldHint>{description}</FieldHint>
        </FieldContent>
      )}
      {modalId ? (
        <Button aria-label={windowTitle} onClick={() => openWithBack(modalId)}>
          Settings
        </Button>
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
    </>
  );
}
