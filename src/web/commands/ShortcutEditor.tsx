import { type KeyboardEvent, useState } from 'react';
import { usePersisted } from '../storage.js';
import { Button } from '../ui/Button.js';
import { ToggleButton } from '../ui/ToggleButton.js';
import { formatShortcut, shortcutFromEvent } from './shortcuts.js';
import {
  checkViewerShortcut,
  resetViewerShortcut,
  resetViewerShortcuts,
  setViewerShortcut,
  VIEWER_SHORTCUT_KEYS,
  viewerShortcuts,
} from './viewerShortcutMap.js';

const REFUSALS = {
  unknown: 'This command cannot be rebound.',
  invalid: 'Not a valid shortcut. Use one key with optional modifiers.',
  reserved: 'Reserved for the app.',
  taken: 'Already used',
} as const;

export function ShortcutEditor() {
  const [overrides] = usePersisted(VIEWER_SHORTCUT_KEYS);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const capture = (command: string, event: KeyboardEvent) => {
    if (capturing !== command) return;
    if (event.key === 'Tab') {
      setCapturing(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setCapturing(null);
      setMessage('');
      return;
    }
    const keys = shortcutFromEvent(event);
    if (!keys) return;
    const check = checkViewerShortcut(command, keys, overrides);
    if (!check.ok) {
      setMessage(
        check.by ? `${REFUSALS.taken} by ${check.by}.` : REFUSALS[check.reason],
      );
      return;
    }
    setViewerShortcut(command, check.keys);
    setMessage(`Saved ${formatShortcut(check.keys)}.`);
    setCapturing(null);
  };
  return (
    <div className="settings__section">
      <table className="settings__shortcuts">
        <tbody>
          {viewerShortcuts(overrides).map((shortcut) => (
            <tr key={shortcut.command}>
              <th scope="row">{shortcut.label}</th>
              <td>
                <kbd>{formatShortcut(shortcut.keys)}</kbd>
              </td>
              <td>
                <ToggleButton
                  aria-label={`Change ${shortcut.label}`}
                  pressed={capturing === shortcut.command}
                  onClick={() => {
                    setMessage('');
                    setCapturing(shortcut.command);
                  }}
                  onKeyDown={(event) => capture(shortcut.command, event)}
                  onBlur={() => setCapturing(null)}
                >
                  {capturing === shortcut.command ? 'Press keys…' : 'Change'}
                </ToggleButton>
                <Button
                  aria-label={`Reset ${shortcut.label}`}
                  onClick={() => resetViewerShortcut(shortcut.command)}
                >
                  Reset
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="settings__hint" role="status">
        {message}
      </p>
      <div className="settings__actions">
        <Button onClick={resetViewerShortcuts}>Reset all shortcuts</Button>
      </div>
    </div>
  );
}
