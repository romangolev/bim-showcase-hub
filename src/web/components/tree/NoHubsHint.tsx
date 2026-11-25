import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { childrenQueryOptions, sessionQueryOptions } from '../../api/hooks.js';
import { ROOT_SCOPE } from '../../api/scope.js';
import { BSH_KEYS, defineRecord } from '../../storage.js';
import { Button } from '../../ui/Button.js';
import { EmptyDescription } from '../../ui/Empty.js';
import { Icon } from '../icons.js';
import { StateBlock } from '../StateBlock.js';

export const CUSTOM_INTEGRATION_HELP_URL =
  'https://help.autodesk.com/cloudhelp/ENU/Docs-Admin/files/hub-administration/Custom_Integrations.html';

type CopyStatus = 'idle' | 'copied' | 'failed';

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return legacyCopy(text);
    }
  }
  return legacyCopy(text);
}

function ClientIdField({ clientId }: { clientId: string }) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await writeClipboard(clientId);
    setStatus(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('idle'), 2500);
  };

  return (
    <div className="no-hubs__client">
      <span id="no-hubs-client-label" className="no-hubs__client-label">
        Client ID
      </span>
      <div className="no-hubs__client-row">
        <code className="no-hubs__client-id">{clientId}</code>
        <Button
          size="small"
          onClick={() => void copy()}
          aria-describedby="no-hubs-client-label"
        >
          <Icon name={status === 'copied' ? 'check' : 'item'} size={14} />
          Copy
        </Button>
        {status === 'copied' ? (
          <span className="no-hubs__copied" aria-hidden="true">
            Copied
          </span>
        ) : null}
      </div>
      <span className="visually-hidden" role="status" aria-live="polite">
        {status === 'copied'
          ? 'Copied'
          : status === 'failed'
            ? 'Could not copy. Select the Client ID and copy it by hand.'
            : ''}
      </span>
    </div>
  );
}

export interface NoHubsHintProps {
  onCheckAgain: () => void;
}

export function NoHubsHint({ onCheckAgain }: NoHubsHintProps) {
  const { data: session } = useQuery({
    ...sessionQueryOptions,
    enabled: false,
  });
  const clientId = session?.appClientId;

  return (
    <StateBlock
      variant="empty"
      className="no-hubs"
      icon="hub"
      title="No projects to show yet"
      titleAs="h3"
    >
      <EmptyDescription>
        Projects show up here once two things are true.
      </EmptyDescription>
      <ol className="no-hubs__steps">
        <li>
          A hub admin has added this app in Forma Hub Admin, under Settings,
          Custom Integrations, using the Client ID below.
        </li>
        <li>You are a member of a project in that hub with access to Files.</li>
      </ol>
      {clientId ? <ClientIdField clientId={clientId} /> : null}
      <div className="no-hubs__actions">
        <Button size="small" onClick={onCheckAgain}>
          Check again
        </Button>
        <a
          className="no-hubs__link"
          href={CUSTOM_INTEGRATION_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          How to add a custom integration
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </div>
    </StateBlock>
  );
}

export const HINT_DISMISSED_KEY = BSH_KEYS.personal.hubHint;

const DISMISSED = defineRecord<string[]>({
  key: HINT_DISMISSED_KEY,
  initial: [],
  sanitize: (parsed) =>
    Array.isArray(parsed)
      ? parsed.filter((owner): owner is string => typeof owner === 'string')
      : [],
});

export interface PersonalHubNoticeProps {
  onCheckAgain: () => void;
}

export function PersonalHubNotice({ onCheckAgain }: PersonalHubNoticeProps) {
  const { data: session } = useQuery({
    ...sessionQueryOptions,
    enabled: false,
  });
  const { data: hubs } = useQuery({
    ...childrenQueryOptions(ROOT_SCOPE),
    enabled: false,
  });
  const owner = session?.name ?? 'anonymous';
  const [dismissed, setDismissed] = useState<string[]>(() => DISMISSED.read());

  const personalOnly =
    hubs !== undefined &&
    hubs.length > 0 &&
    hubs.every((hub) => hub.hubType === 'personal');
  if (!personalOnly || dismissed.includes(owner)) {
    return null;
  }

  const dismiss = () => {
    const next = [...dismissed, owner];
    setDismissed(next);
    DISMISSED.write(next);
    document
      .querySelector<HTMLInputElement>('.doc-tree__search input')
      ?.focus();
  };

  const clientId = session?.appClientId;

  return (
    <section className="hub-notice" aria-labelledby="hub-notice-title">
      <div className="hub-notice__head">
        <h3 id="hub-notice-title" className="hub-notice__title">
          Looking for projects from ACC, BIM 360 or Forma?
        </h3>
        <Button size="small" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <ol className="no-hubs__steps">
        <li>
          A hub admin adds this app in Forma Hub Admin, under Settings, Custom
          Integrations, with the Client ID below.
        </li>
        <li>You are a member of a project in that hub with access to Files.</li>
      </ol>
      {clientId ? <ClientIdField clientId={clientId} /> : null}
      <div className="no-hubs__actions">
        <Button size="small" onClick={onCheckAgain}>
          Check again
        </Button>
        <a
          className="no-hubs__link"
          href={CUSTOM_INTEGRATION_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          How to add a custom integration
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </div>
    </section>
  );
}
