import { useEffect, useState } from 'react';
import { useSession, useSessionExpiry, useSignIn } from '../api/hooks.js';
import { useSettings } from '../settings/SettingsContext.js';

const TICK_MS = 15_000;

export function minutesLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 60_000));
}

export function SessionBanner() {
  const session = useSession();
  const ended = useSessionExpiry();
  const signIn = useSignIn();
  const { settings } = useSettings();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  const expiresAt = session.data?.expiresAt;
  const expired = ended || (expiresAt !== undefined && expiresAt <= now);
  const warn = settings.sessionWarnMinutes;
  const soon =
    !expired &&
    warn > 0 &&
    expiresAt !== undefined &&
    expiresAt - now <= warn * 60_000;
  if (!expired && !soon) return null;
  return (
    <div
      className="session-banner"
      data-state={expired ? 'ended' : 'soon'}
      role={expired ? 'alert' : 'status'}
    >
      <span>
        {expired
          ? 'Your session has ended. Your open models stay as they are.'
          : `Your session ends in ${minutesLeft(expiresAt as number, now)} min.`}
      </span>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => signIn.mutate()}
        disabled={signIn.isPending}
      >
        Sign in again
      </button>
    </div>
  );
}
