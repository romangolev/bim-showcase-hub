import type { ReactNode, Ref } from 'react';
import { useSession, useSignIn } from '../api/hooks.js';
import { useModal } from '../modal/index.js';
import { TaskCenter } from '../tasks/TaskCenter.js';
import { ThemeToggle } from '../theme/ThemeToggle.js';
import { Icon } from './icons.js';
import { UserMenu } from './UserMenu.js';

export interface TopBarProps {
  treeOpen?: boolean;
  onToggleTree?: () => void;
  toggleRef?: Ref<HTMLButtonElement>;
  actions?: ReactNode;
}

export function TopBar({
  treeOpen = false,
  onToggleTree,
  toggleRef,
  actions,
}: TopBarProps) {
  const session = useSession();
  const signIn = useSignIn();
  const user = session.data ?? null;
  const modal = useModal();

  return (
    <header className="topbar">
      <div className="topbar__inner">
        {user && onToggleTree ? (
          <button
            ref={toggleRef}
            type="button"
            className="icon-button"
            aria-label={
              treeOpen ? 'Collapse document tree' : 'Expand document tree'
            }
            aria-expanded={treeOpen}
            aria-controls="document-panel"
            onClick={onToggleTree}
          >
            <Icon name="panel" size={18} />
          </button>
        ) : null}
        <a className="brand" href="/">
          <span className="brand__mark">
            <Icon name="model" size={16} />
          </span>
          <span className="brand__name">
            BIM Showcase<span className="brand__suffix"> Hub</span>
          </span>
        </a>
        <div className="topbar__spacer" />
        {session.isError ? (
          <span className="topbar__status" role="alert">
            Session unavailable
          </span>
        ) : null}
        {user ? actions : null}
        {user ? <TaskCenter /> : null}
        {user ? (
          <button
            type="button"
            className="icon-button"
            aria-label="Settings"
            title="Settings"
            onClick={() => modal.open('settings')}
          >
            <Icon name="settings" size={18} />
          </button>
        ) : null}
        <ThemeToggle />
        {user ? (
          <UserMenu user={user} />
        ) : session.isPending ? null : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => signIn.mutate()}
            disabled={signIn.isPending}
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
