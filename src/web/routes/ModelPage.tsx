import { describeModel, type ModelContext } from '../api/modelContext.js';
import { composeTitle } from '../components/useDocumentTitle.js';
import type { PaneTitle } from '../layout/layoutContext.js';

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

export function modelTabTitle(urn: string, context: ModelContext): PaneTitle {
  return viewerTabTitle(urn, context.file, context.v, context.crumbs);
}

export function modelDocumentTitle(
  urn: string,
  file?: string,
  version?: string,
): string {
  const identity = describeModel(urn, file, version);
  return identity.hasFile
    ? composeTitle(identity.title, identity.version)
    : composeTitle('Model', identity.version);
}
