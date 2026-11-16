import type { Ref } from 'react';
import { useSession, useSignIn } from '../api/hooks.js';
import { Icon } from './icons.js';
import { UserMenu } from './UserMenu.js';

export interface TopBarProps {
  treeOpen: boolean;
  onToggleTree: () => void;
  toggleRef?: Ref<HTMLButtonElement>;
}

export function TopBar({ treeOpen, onToggleTree, toggleRef }: TopBarProps) {
  const session = useSession();
  const signIn = useSignIn();
  const user = session.data ?? null;

  return (
    <header className="topbar">
      <div className="topbar__inner">
        {user ? (
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
          <span className="brand__name">BIM Showcase Hub</span>
        </a>
        <div className="topbar__spacer" />
        {session.isError ? (
          <span className="topbar__status" role="alert">
            Session unavailable
          </span>
        ) : null}
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
