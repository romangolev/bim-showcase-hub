import { DOCS_URL } from '../components/HelpMenu.js';
import { ShortcutList } from './ShortcutList.js';

export function HelpPane() {
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
          Documentation
        </a>
      </p>
    </div>
  );
}
