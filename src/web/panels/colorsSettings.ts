import { isRecord } from '../../shared/guards.js';
import {
  type ColorBySpec,
  DEFAULT_COLOR_BY,
  sanitizeColorBy,
} from '../extensions/colorBy.js';
import {
  DEFAULT_RULE_SET,
  type RuleSet,
  sanitizeRuleSet,
} from '../extensions/colorRules.js';
import { defineRecord } from '../storage.js';

export interface ColorsSettings {
  source: 'property' | 'rules';
  spec: ColorBySpec;
  rules: RuleSet;
}

export const COLORS_SETTINGS_KEY = 'bsh.pane.colors.v1';

export { toHexColor as hexColor } from '../extensions/colorBy.js';

export function readColorsSettings(raw: unknown): ColorsSettings {
  const source = isRecord(raw) ? raw : {};
  return {
    source: source.source === 'rules' ? 'rules' : 'property',
    spec: sanitizeColorBy(source.spec),
    rules: sanitizeRuleSet(source.rules) ?? DEFAULT_RULE_SET,
  };
}

export const COLORS_SETTINGS = defineRecord<ColorsSettings>({
  key: COLORS_SETTINGS_KEY,
  initial: {
    source: 'property',
    spec: DEFAULT_COLOR_BY,
    rules: DEFAULT_RULE_SET,
  },
  sanitize: readColorsSettings,
});
