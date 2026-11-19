import { createTarget } from './settingsTarget.js';

const target = createTarget();

export const setDashboardSettingsTarget = target.set;
export const dropDashboardSettingsTarget = target.drop;
export const useDashboardSettingsTarget = target.use;
