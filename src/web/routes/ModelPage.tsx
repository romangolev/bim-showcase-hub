import { useEffect } from 'react';
import { describeModel } from '../api/modelContext.js';
import {
  composeTitle,
  useDocumentTitle,
} from '../components/useDocumentTitle.js';
import { type PaneTitle, usePaneTitle } from '../layout/layoutContext.js';

export function viewerTabTitle(
  urn: string,
  file?: string,
  version?: string,
  crumbs: readonly string[] = [],
): PaneTitle {
  const identity = describeModel(urn, file, version);
  const label = identity.version
    ? `${identity.title} · ${identity.version}`
    : identity.title;
  const path = [...crumbs, label].join(' / ');
  return { label, tooltip: `${path}\n${urn}` };
}

export interface ModelPageProps {
  urn: string;
  file?: string;
  version?: string;
  crumbs?: readonly string[];
}

export function ModelPage({ urn, file, version, crumbs }: ModelPageProps) {
  const setPaneTitle = usePaneTitle();

  const identity = describeModel(urn, file, version);
  useDocumentTitle(
    identity.hasFile
      ? composeTitle(identity.title, identity.version)
      : composeTitle('Model', identity.version),
  );

  const crumbKey = crumbs?.join('\u0000') ?? '';
  useEffect(() => {
    const parts = crumbKey ? crumbKey.split('\u0000') : [];
    setPaneTitle('viewer', viewerTabTitle(urn, file, version, parts));
    return () => setPaneTitle('viewer', null);
  }, [setPaneTitle, urn, file, version, crumbKey]);

  return null;
}
