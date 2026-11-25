import { PANE_SETTINGS } from '../settings/paneSettings.js';

export function withSummaryProperties(names: readonly string[]): object {
  PANE_SETTINGS.summary.properties.write(names);
  return {};
}
