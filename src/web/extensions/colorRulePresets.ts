import { defineSavedKind } from '../store/savedKinds.js';
import { type RuleSet, sanitizeRuleSet } from './colorRules.js';

export const COLOR_RULE_PRESETS_KIND = 'color-rules';

export type ColorRulePresetData = { [K in keyof RuleSet]: RuleSet[K] };

export const COLOR_RULE_PRESETS = defineSavedKind<ColorRulePresetData>({
  kind: COLOR_RULE_PRESETS_KIND,
  version: 1,
  label: 'Colour rules',
  sanitize: sanitizeRuleSet,
});

export function duplicateRulePreset(id: string): boolean {
  const item = COLOR_RULE_PRESETS.get(id);
  if (!item) return false;
  return COLOR_RULE_PRESETS.save(`${item.name} copy`, item.data) !== null;
}
