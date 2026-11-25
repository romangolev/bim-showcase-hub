import { DOCS_URL } from '../components/HelpMenu.js';
import { useT } from '../i18n/i18n.js';
import { resetHints } from '../onboarding/hints.js';
import { notify } from '../tasks/notifications.js';
import { Button } from '../ui/Button.js';
import { ShortcutList } from './ShortcutList.js';

export function HelpPane() {
  const t = useT();
  return (
    <div
      className="pane-help"
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        overflowY: 'auto',
      }}
    >
      <ShortcutList />
      <p style={{ margin: 0 }}>
        <a href={DOCS_URL} target="_blank" rel="noopener">
          {t('help.docs')}
        </a>
      </p>
      <p style={{ margin: 0 }}>
        <Button
          size="small"
          onClick={() => {
            resetHints();
            notify(t('help.hintsWillShow'));
          }}
        >
          {t('help.showHintsAgain')}
        </Button>
      </p>
    </div>
  );
}
