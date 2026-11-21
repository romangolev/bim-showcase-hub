import { describe, expect, it } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { entryOf } from './colorBy.js';
import { COLOR_RULE_PRESETS, duplicateRulePreset } from './colorRulePresets.js';
import {
  type ColorRule,
  colorByRules,
  matchRule,
  ruleProperties,
  sanitizeRuleSet,
} from './colorRules.js';

const rule = (over: Partial<ColorRule>): ColorRule => ({
  id: 'r',
  property: 'Category',
  op: 'equals',
  value: '',
  min: null,
  max: null,
  color: '#ff0000',
  label: 'Rule',
  ...over,
});

const row = (dbId: number, props: PropertyRow['properties']): PropertyRow => ({
  dbId,
  name: `e${dbId}`,
  properties: props,
  modelId: 'm',
});

describe('matchRule', () => {
  it('matches equals case-insensitively and contains as a substring', () => {
    expect(matchRule(rule({ value: 'walls' }), 'Walls')).toBe(true);
    expect(matchRule(rule({ op: 'contains', value: 'all' }), 'Walls')).toBe(
      true,
    );
  });

  it('matches a range on the shared measure parser, inclusive', () => {
    const r = rule({ op: 'range', min: 2, max: 5 });
    expect(matchRule(r, '2 m')).toBe(true);
    expect(matchRule(r, '5000 mm')).toBe(true);
    expect(matchRule(r, '6')).toBe(false);
    expect(matchRule(r, 'n/a')).toBe(false);
  });

  it('matches empty for null, blank and missing', () => {
    const r = rule({ op: 'empty' });
    expect(matchRule(r, null)).toBe(true);
    expect(matchRule(r, '  ')).toBe(true);
    expect(matchRule(r, 'x')).toBe(false);
  });
});

describe('colorByRules', () => {
  const rows = [
    row(1, { Category: 'Walls' }),
    row(2, { Category: 'Doors' }),
    row(3, { Category: 'Roofs' }),
  ];

  it('gives each element the first matching rule', () => {
    const coloring = colorByRules(rows, {
      rules: [
        rule({ id: 'a', value: 'Walls', label: 'W' }),
        rule({ id: 'b', op: 'contains', value: 's', label: 'S' }),
      ],
      fallback: null,
      ghostRest: false,
    });
    expect(entryOf(coloring, 'm', 1)?.label).toBe('W');
    expect(entryOf(coloring, 'm', 2)?.label).toBe('S');
    expect(coloring.legend.map((e) => e.count)).toEqual([1, 2]);
  });

  it('adds a fallback entry for the rest when a fallback colour is set', () => {
    const coloring = colorByRules(rows, {
      rules: [rule({ value: 'Walls' })],
      fallback: '#999999',
      ghostRest: false,
    });
    expect(coloring.legend.at(-1)).toMatchObject({
      label: 'Everything else',
      count: 2,
    });
  });
});

describe('sanitizeRuleSet', () => {
  it('drops bad rules, caps the list and keeps the flags', () => {
    const clean = sanitizeRuleSet({
      rules: [
        { property: 'A', op: 'equals', value: 'x', color: '#00ff00' },
        { property: '', op: 'equals', color: '#00ff00' },
        { property: 'B', op: 'nope', color: '#00ff00' },
      ],
      fallback: 'red',
      ghostRest: true,
    });
    expect(clean?.rules).toHaveLength(1);
    expect(clean?.fallback).toBeNull();
    expect(clean?.ghostRest).toBe(true);
  });

  it('gives duplicate ids a unique suffix', () => {
    const clean = sanitizeRuleSet({
      rules: [
        { id: 'same', property: 'A', op: 'equals', color: '#00ff00' },
        { id: 'same', property: 'B', op: 'equals', color: '#00ff00' },
      ],
      fallback: null,
      ghostRest: false,
    });
    expect(new Set(clean?.rules.map((item) => item.id)).size).toBe(2);
  });

  it('lists the properties the rules read, once each', () => {
    expect(
      ruleProperties({
        rules: [rule({}), rule({ property: 'Level' }), rule({})],
        fallback: null,
        ghostRest: false,
      }),
    ).toEqual(['Category', 'Level']);
  });
});

describe('color rule presets', () => {
  it('duplicates a preset under a copy name', () => {
    setStorageAdapter(memoryAdapter());
    const saved = COLOR_RULE_PRESETS.save('Fire', {
      rules: [rule({})],
      fallback: null,
      ghostRest: true,
    });
    expect(duplicateRulePreset(saved?.id ?? '')).toBe(true);
    expect(COLOR_RULE_PRESETS.list().map((item) => item.name)).toEqual([
      'Fire',
      'Fire copy',
    ]);
  });
});
