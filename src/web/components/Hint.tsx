import type { ReactNode } from 'react';
import { type HintId, useHint } from '../onboarding/hints.js';
import { Alert, AlertDescription } from '../ui/Alert.js';
import { IconButton } from '../ui/IconButton.js';
import { Icon } from './icons.js';

export function Hint({ id, children }: { id: HintId; children: ReactNode }) {
  const hint = useHint(id);
  if (!hint.show) return null;
  return (
    <Alert role="note">
      <AlertDescription>{children}</AlertDescription>
      <IconButton label="Dismiss hint" onClick={hint.dismiss}>
        <Icon name="close" size={14} />
      </IconButton>
    </Alert>
  );
}
