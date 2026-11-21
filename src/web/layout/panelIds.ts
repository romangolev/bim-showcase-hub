export type PanelId = string;

export const PANEL_SEPARATOR = ':';

export function instancePanelId(kind: string, instance: string): PanelId {
  return `${kind}${PANEL_SEPARATOR}${instance}`;
}

export const MODEL_KIND = 'viewer';

export function modelPanelId(urn: string): PanelId {
  return instancePanelId(MODEL_KIND, urn);
}
