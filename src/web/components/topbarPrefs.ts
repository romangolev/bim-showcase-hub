import { BSH_KEYS, defineRecord } from '../storage.js';
import type { BreadcrumbMode } from './breadcrumb.js';

const MODES: readonly BreadcrumbMode[] = ['full', 'file', 'off'];

export interface TopbarPrefs {
  breadcrumb: BreadcrumbMode;
}

export const TOPBAR_PREFS = defineRecord<TopbarPrefs>({
  key: BSH_KEYS.preference.topbar,
  initial: { breadcrumb: 'full' },
  sanitize: (raw) => {
    const value = (raw as Partial<TopbarPrefs> | null)?.breadcrumb;
    return {
      breadcrumb: MODES.includes(value as BreadcrumbMode)
        ? (value as BreadcrumbMode)
        : 'full',
    };
  },
});
