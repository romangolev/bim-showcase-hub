export type PanelId = string;

export const PANEL_SEPARATOR = ':';

export function instancePanelId(kind: string, instance: string): PanelId {
  return `${kind}${PANEL_SEPARATOR}${instance}`;
}
