import { createTarget } from './settingsTarget.js';

const target = createTarget();

export const setSummarySettingsTarget = target.set;
export const dropSummarySettingsTarget = target.drop;
export const useSummarySettingsTarget = target.use;
