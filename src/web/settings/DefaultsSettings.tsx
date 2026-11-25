import { useState } from 'react';
import { COMMANDS } from '../commands/registry.js';
import type { Command } from '../commands/types.js';
import { useT } from '../i18n/i18n.js';
import { useModal } from '../modal/ModalContext.js';
import { resetHints } from '../onboarding/hints.js';
import { notify } from '../tasks/notifications.js';
import { Button } from '../ui/Button.js';
import { Field, FieldHint, FieldTitle } from '../ui/Field.js';
import { useSettings } from './SettingsContext.js';

export function DefaultsSettings() {
  const { resetSettings } = useSettings();
  const modal = useModal();
  const t = useT();
  const resetCommand: Command | undefined = COMMANDS.list().find(
    (command) => command.id === 'layout.reset',
  );
  const [notice, setNotice] = useState('');

  return (
    <section className="settings__section" aria-labelledby="settings-defaults">
      <h3 id="settings-defaults" className="settings__heading">
        {t('settings.defaults')}
      </h3>
      <Field layout="row">
        <FieldTitle>{t('settings.appSettings')}</FieldTitle>
        <Button
          onClick={() => {
            resetSettings();
            setNotice(t('settings.resetSettingsDone'));
          }}
        >
          {t('settings.resetSettings')}
        </Button>
        <FieldHint>{t('settings.resetSettingsHint')}</FieldHint>
      </Field>
      <Field layout="row">
        <FieldTitle>{t('settings.layout')}</FieldTitle>
        <Button
          disabled={!resetCommand || Boolean(resetCommand.disabled)}
          onClick={() => {
            resetCommand?.run({ openModal: modal.open });
            setNotice(t('settings.resetLayoutDone'));
          }}
        >
          {t('settings.resetLayout')}
        </Button>
        <FieldHint>
          {resetCommand
            ? (resetCommand.disabled ?? t('settings.layoutHint'))
            : t('settings.layoutUnavailable')}
        </FieldHint>
      </Field>
      <Field layout="row">
        <FieldTitle>{t('settings.hints')}</FieldTitle>
        <Button
          onClick={() => {
            resetHints();
            notify(t('help.hintsWillShow'));
          }}
        >
          {t('settings.showHintsAgain')}
        </Button>
        <FieldHint>{t('settings.hintsHint')}</FieldHint>
      </Field>
      <p role="status" className="settings__hint">
        {notice}
      </p>
    </section>
  );
}
