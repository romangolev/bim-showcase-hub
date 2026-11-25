import type { ReactNode } from 'react';
import { type HintId, useHint } from '../onboarding/hints.js';
import { IconButton } from '../ui/IconButton.js';
import { Icon } from './icons.js';

export function Hint({ id, children }: { id: HintId; children: ReactNode }) {
  const hint = useHint(id);
  if (!hint.show) return null;
  return (
    <div className="hint" role="note">
      <p className="hint__text">{children}</p>
      <IconButton label="Dismiss hint" onClick={hint.dismiss}>
        <Icon name="close" size={14} />
      </IconButton>
    </div>
  );
}
