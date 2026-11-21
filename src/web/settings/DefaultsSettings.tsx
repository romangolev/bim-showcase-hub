import { useState } from 'react';
import { COMMANDS } from '../commands/registry.js';
import type { Command } from '../commands/types.js';
import { useT } from '../i18n/i18n.js';
import { useModal } from '../modal/ModalContext.js';
import { resetHints } from '../onboarding/hints.js';
import { notify } from '../tasks/notifications.js';
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
      <div className="settings__field">
        <span>{t('settings.appSettings')}</span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            resetSettings();
            setNotice(t('settings.resetSettingsDone'));
          }}
        >
          {t('settings.resetSettings')}
        </button>
        <span className="settings__hint">
          {t('settings.resetSettingsHint')}
        </span>
      </div>
      <div className="settings__field">
        <span>{t('settings.layout')}</span>
        <button
          type="button"
          className="btn"
          disabled={!resetCommand || Boolean(resetCommand.disabled)}
          onClick={() => {
            resetCommand?.run({ openModal: modal.open });
            setNotice(t('settings.resetLayoutDone'));
          }}
        >
          {t('settings.resetLayout')}
        </button>
        <span className="settings__hint">
          {resetCommand
            ? (resetCommand.disabled ?? t('settings.layoutHint'))
            : t('settings.layoutUnavailable')}
        </span>
      </div>
      <div className="settings__field">
        <span>{t('settings.hints')}</span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            resetHints();
            notify(t('help.hintsWillShow'));
          }}
        >
          {t('settings.showHintsAgain')}
        </button>
        <span className="settings__hint">{t('settings.hintsHint')}</span>
      </div>
      <p role="status" className="settings__hint">
        {notice}
      </p>
    </section>
  );
}
