import { useState } from 'react';
import { COMMANDS } from '../commands/registry.js';
import type { Command } from '../commands/types.js';
import { useModal } from '../modal/ModalContext.js';
import { resetHints } from '../onboarding/hints.js';
import { notify } from '../tasks/notifications.js';
import { useSettings } from './SettingsContext.js';

export function DefaultsSettings() {
  const { resetSettings } = useSettings();
  const modal = useModal();
  const resetCommand: Command | undefined = COMMANDS.list().find(
    (command) => command.id === 'layout.reset',
  );
  const [notice, setNotice] = useState('');

  return (
    <section className="settings__section" aria-labelledby="settings-defaults">
      <h3 id="settings-defaults" className="settings__heading">
        Defaults
      </h3>
      <div className="settings__field">
        <span>App settings</span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            resetSettings();
            setNotice('App settings are back to their defaults.');
          }}
        >
          Reset settings
        </button>
        <span className="settings__hint">
          Theme, density, text size, motion, language and units.
        </span>
      </div>
      <div className="settings__field">
        <span>Layout</span>
        <button
          type="button"
          className="btn"
          disabled={!resetCommand || Boolean(resetCommand.disabled)}
          onClick={() => {
            resetCommand?.run({ openModal: modal.open });
            setNotice('Layout reset to the default arrangement.');
          }}
        >
          Reset layout
        </button>
        <span className="settings__hint">
          {resetCommand
            ? (resetCommand.disabled ?? 'Open models stay open.')
            : 'Layout is not available right now.'}
        </span>
      </div>
      <div className="settings__field">
        <span>Hints</span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            resetHints();
            notify('Hints will show again');
          }}
        >
          Show hints again
        </button>
        <span className="settings__hint">
          The move, Panes and Ctrl+K notes show once each and stay hidden until
          you ask for them here.
        </span>
      </div>
      <p role="status" className="settings__hint">
        {notice}
      </p>
    </section>
  );
}
