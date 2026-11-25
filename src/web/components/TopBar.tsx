import type { ReactNode, Ref } from 'react';
import { useSession, useSignIn } from '../api/hooks.js';
import { useT } from '../i18n/i18n.js';
import { useModal } from '../modal/index.js';
import { TaskCenter } from '../tasks/TaskCenter.js';
import { ThemeToggle } from '../theme/ThemeToggle.js';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import { HelpMenu } from './HelpMenu.js';
import { Icon } from './icons.js';
import type { MenuEntry } from './Menu.js';
import { UserMenu } from './UserMenu.js';

export interface TopBarProps {
  treeOpen?: boolean;
  onToggleTree?: () => void;
  toggleRef?: Ref<HTMLButtonElement>;
  actions?: ReactNode;
  context?: ReactNode;
  helpExtra?: () => MenuEntry[];
}

export function TopBar({
  treeOpen = false,
  onToggleTree,
  toggleRef,
  actions,
  context,
  helpExtra,
}: TopBarProps) {
  const session = useSession();
  const signIn = useSignIn();
  const user = session.data ?? null;
  const modal = useModal();
  const t = useT();

  return (
    <header className="topbar">
      <div className="topbar__inner">
        {user && onToggleTree ? (
          <IconButton
            ref={toggleRef}
            tooltip
            label={treeOpen ? t('topbar.collapseTree') : t('topbar.expandTree')}
            aria-expanded={treeOpen}
            aria-controls="document-panel"
            onClick={onToggleTree}
          >
            <Icon name="panel" size={18} />
          </IconButton>
        ) : null}
        <a className="brand" href="/">
          <span className="brand__mark">
            <Icon name="model" size={16} />
          </span>
          <span className="brand__name">
            BIM Showcase<span className="brand__suffix"> Hub</span>
          </span>
        </a>
        {context}
        <div className="topbar__spacer" />
        {session.isError ? (
          <span className="topbar__status" role="alert">
            {t('topbar.sessionUnavailable')}
          </span>
        ) : null}
        {user ? actions : null}
        {user ? <TaskCenter /> : null}
        {user ? <HelpMenu extra={helpExtra} /> : null}
        {user ? (
          <IconButton
            label={t('topbar.settings')}
            title={t('topbar.settings')}
            onClick={() => modal.open('settings')}
          >
            <Icon name="settings" size={18} />
          </IconButton>
        ) : null}
        <ThemeToggle />
        {user ? (
          <UserMenu user={user} />
        ) : session.isPending ? null : (
          <Button
            variant="primary"
            onClick={() => signIn.mutate()}
            disabled={signIn.isPending}
          >
            {t('topbar.signIn')}
          </Button>
        )}
      </div>
    </header>
  );
}
