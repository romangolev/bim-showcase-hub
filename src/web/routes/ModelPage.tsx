import {
  describeModel,
  type ModelContext,
  withUrns,
} from '../api/modelContext.js';
import { recallModel } from '../api/modelStore.js';
import { composeTitle } from '../components/useDocumentTitle.js';
import type { PaneTitle } from '../layout/layoutContext.js';
import { farApartMessage } from '../viewer/modelSet.js';

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

export function memberLabel(
  urn: string,
  context?: ModelContext | null,
): string {
  const identity = describeModel(urn, context?.file, context?.v);
  return identity.version
    ? `${identity.title} · ${identity.version}`
    : identity.title;
}

export function modelTabTitle(
  urn: string,
  context: ModelContext,
  recall: (urn: string) => ModelContext | null = recallModel,
  spread?: number,
): PaneTitle {
  const title = baseTabTitle(urn, context, recall);
  if (spread === undefined) return title;
  const warning = farApartMessage({ distanceMeters: spread });
  return { ...title, tooltip: `${title.tooltip}\n${warning}` };
}

function baseTabTitle(
  urn: string,
  context: ModelContext,
  recall: (urn: string) => ModelContext | null,
): PaneTitle {
  const extras = withUrns(context);
  if (extras.length === 0) {
    return viewerTabTitle(urn, context.file, context.v, context.crumbs);
  }
  const names = [
    memberLabel(urn, context),
    ...extras.map((extra) => memberLabel(extra, recall(extra))),
  ];
  return {
    label: `${names.length} models`,
    tooltip: names.join('\n'),
  };
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
