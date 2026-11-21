import { isRecord } from '../../shared/guards.js';
import type { PropertyRow } from '../../shared/types.js';
import { buildColoring, type Coloring } from './colorBy.js';
import { parseMeasure } from './measureParse.js';

export type RuleOp = 'equals' | 'contains' | 'range' | 'empty';
const OPS: readonly RuleOp[] = ['equals', 'contains', 'range', 'empty'];

export interface ColorRule {
  id: string;
  property: string;
  op: RuleOp;
  value: string;
  min: number | null;
  max: number | null;
  color: string;
  label: string;
}

export interface RuleSet {
  rules: ColorRule[];
  fallback: string | null;
  ghostRest: boolean;
}

export const MAX_RULES = 32;
export const FALLBACK_LABEL = 'Everything else';
export const DEFAULT_RULE_SET: RuleSet = {
  rules: [],
  fallback: null,
  ghostRest: false,
};
const HEX = /^#[0-9a-f]{6}$/i;

const text = (cell: unknown): string =>
  cell === null || cell === undefined ? '' : String(cell).trim();

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function matchRule(rule: ColorRule, cell: unknown): boolean {
  const value = text(cell);
  switch (rule.op) {
    case 'empty':
      return value === '';
    case 'equals':
      return value.toLowerCase() === rule.value.trim().toLowerCase();
    case 'contains':
      return (
        rule.value.trim() !== '' &&
        value.toLowerCase().includes(rule.value.trim().toLowerCase())
      );
    case 'range': {
      const measure = parseMeasure(cell);
      if (!measure) return false;
      const n = measure.value * measure.factor;
      return (
        (rule.min === null || n >= rule.min) &&
        (rule.max === null || n <= rule.max)
      );
    }
  }
}

function sanitizeRule(raw: unknown, index: number): ColorRule | null {
  if (!isRecord(raw)) return null;
  const property = text(raw.property);
  const op = OPS.find((item) => item === raw.op);
  const color =
    typeof raw.color === 'string' && HEX.test(raw.color)
      ? raw.color.toLowerCase()
      : null;
  if (!property || !op || !color) return null;
  return {
    id:
      typeof raw.id === 'string' && raw.id
        ? raw.id.slice(0, 40)
        : `rule-${index + 1}`,
    property,
    op,
    value: text(raw.value).slice(0, 200),
    min: finite(raw.min),
    max: finite(raw.max),
    color,
    label:
      text(raw.label).slice(0, 80) ||
      `${property} ${op} ${text(raw.value)}`.trim(),
  };
}

export function sanitizeRuleSet(raw: unknown): RuleSet | null {
  if (!isRecord(raw)) return null;
  const rules = (Array.isArray(raw.rules) ? raw.rules : [])
    .map(sanitizeRule)
    .filter((item): item is ColorRule => item !== null)
    .slice(0, MAX_RULES);
  const seen = new Set<string>();
  for (const rule of rules) {
    let id = rule.id;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${rule.id}-${suffix}`;
      suffix += 1;
    }
    rule.id = id;
    seen.add(id);
  }
  return {
    rules,
    fallback:
      typeof raw.fallback === 'string' && HEX.test(raw.fallback)
        ? raw.fallback.toLowerCase()
        : null,
    ghostRest: raw.ghostRest === true,
  };
}

export function ruleProperties(set: RuleSet): string[] {
  return [...new Set(set.rules.map((item) => item.property))];
}

export function colorByRules(
  rows: readonly PropertyRow[],
  set: RuleSet,
): Coloring {
  const labels = set.rules.map((item) => item.label);
  const keys = set.rules.map((item) => item.id);
  const fallback = set.fallback;
  const legendKeys = fallback ? [...keys, FALLBACK_LABEL] : keys;
  const coloring = buildColoring(
    'rules',
    'Rules',
    rows,
    (row) => {
      const hit = set.rules.find((item) =>
        matchRule(item, row.properties[item.property]),
      );
      return hit ? hit.id : fallback ? FALLBACK_LABEL : null;
    },
    legendKeys,
    fallback
      ? [...set.rules.map((item) => item.color), fallback]
      : set.rules.map((item) => item.color),
  );
  return {
    ...coloring,
    legend: coloring.legend.map((entry, i) => ({
      ...entry,
      label: labels[i] ?? FALLBACK_LABEL,
    })),
  };
}
