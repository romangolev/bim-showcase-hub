export interface ParsedMeasure {
  value: number;
  unit: string | null;
  family: string;
  factor: number;
}

interface UnitSpec {
  family: string;
  factor: number;
}

const UNIT_SPECS: Record<string, UnitSpec> = {
  mm: { family: 'length', factor: 0.001 },
  cm: { family: 'length', factor: 0.01 },
  m: { family: 'length', factor: 1 },
  km: { family: 'length', factor: 1000 },
  in: { family: 'length', factor: 0.0254 },
  inch: { family: 'length', factor: 0.0254 },
  '"': { family: 'length', factor: 0.0254 },
  ft: { family: 'length', factor: 0.3048 },
  foot: { family: 'length', factor: 0.3048 },
  feet: { family: 'length', factor: 0.3048 },
  "'": { family: 'length', factor: 0.3048 },
  yd: { family: 'length', factor: 0.9144 },
  mi: { family: 'length', factor: 1609.344 },
  mm2: { family: 'area', factor: 0.000001 },
  cm2: { family: 'area', factor: 0.0001 },
  m2: { family: 'area', factor: 1 },
  km2: { family: 'area', factor: 1000000 },
  in2: { family: 'area', factor: 0.00064516 },
  ft2: { family: 'area', factor: 0.09290304 },
  yd2: { family: 'area', factor: 0.83612736 },
  mm3: { family: 'volume', factor: 0.000000001 },
  cm3: { family: 'volume', factor: 0.000001 },
  m3: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 0.001 },
  liter: { family: 'volume', factor: 0.001 },
  litre: { family: 'volume', factor: 0.001 },
  ml: { family: 'volume', factor: 0.000001 },
  in3: { family: 'volume', factor: 0.000016387064 },
  ft3: { family: 'volume', factor: 0.028316846592 },
  gal: { family: 'volume', factor: 0.003785411784 },
  mg: { family: 'mass', factor: 0.000001 },
  g: { family: 'mass', factor: 0.001 },
  kg: { family: 'mass', factor: 1 },
  t: { family: 'mass', factor: 1000 },
  lb: { family: 'mass', factor: 0.45359237 },
  lbs: { family: 'mass', factor: 0.45359237 },
  oz: { family: 'mass', factor: 0.028349523125 },
  s: { family: 'time', factor: 1 },
  sec: { family: 'time', factor: 1 },
  min: { family: 'time', factor: 60 },
  h: { family: 'time', factor: 3600 },
  hr: { family: 'time', factor: 3600 },
  d: { family: 'time', factor: 86400 },
  day: { family: 'time', factor: 86400 },
  deg: { family: 'angle', factor: 1 },
  '°': { family: 'angle', factor: 1 },
  rad: { family: 'angle', factor: 57.29577951308232 },
  '%': { family: 'percent', factor: 1 },
  pct: { family: 'percent', factor: 1 },
  $: { family: 'currency', factor: 1 },
  usd: { family: 'currency', factor: 1 },
  '€': { family: 'currency', factor: 1 },
  eur: { family: 'currency', factor: 1 },
  '£': { family: 'currency', factor: 1 },
  gbp: { family: 'currency', factor: 1 },
  '₽': { family: 'currency', factor: 1 },
  rub: { family: 'currency', factor: 1 },
};

const NUMBER_PREFIX = /^[+-]?[\d.,\u00A0\u202F_ ]+/;
const GROUPED_COMMA = 3;
const AMBIGUOUS_GROUP = /^[+-]?[1-9]\d{0,2}(?:\.\d{3})+$/;
const UNIT_TOKEN = /^[\p{L}°%€£₽$/]{1,12}[²³23]?$/u;

function numericValue(text: string): number | null {
  let body = text.replace(/[\s\u00A0\u202F_]/g, '');
  let sign = '';
  if (body.startsWith('-') || body.startsWith('+')) {
    sign = body[0] ?? '';
    body = body.slice(1);
  }
  if (!body || !/\d/.test(body)) return null;
  if (AMBIGUOUS_GROUP.test(body)) return null;
  const lastDot = body.lastIndexOf('.');
  const lastComma = body.lastIndexOf(',');
  const last = Math.max(lastDot, lastComma);
  if (lastDot >= 0 && lastComma >= 0) {
    body = `${body.slice(0, last).replace(/[.,]/g, '')}.${body.slice(last + 1)}`;
  }
  const dots = (body.match(/\./g) ?? []).length;
  if (!body.includes(',') && dots > 1) {
    const only = body.lastIndexOf('.');
    body = `${body.slice(0, only).replace(/\./g, '')}.${body.slice(only + 1)}`;
  }
  let whole = body;
  let fraction = '';
  const dot = body.indexOf('.');
  if (dot >= 0) {
    whole = body.slice(0, dot).replace(/,/g, '');
    fraction = body.slice(dot + 1).replace(/,/g, '');
  } else if (body.includes(',')) {
    const parts = body.split(',');
    const first = parts[0] ?? '';
    const tail = parts[1] ?? '';
    if (parts.length === 2 && tail.length > GROUPED_COMMA && first !== '0') {
      return null;
    }
    const decimal =
      parts.length === 2 && (first === '0' || tail.length !== GROUPED_COMMA);
    if (decimal) {
      whole = first;
      fraction = tail;
    } else {
      whole = parts.join('');
    }
  }
  const value = Number(
    `${sign}${whole || '0'}${fraction ? `.${fraction}` : ''}`,
  );
  return Number.isFinite(value) ? value : null;
}

function normalizeUnit(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+/g, '');
}

export function parseMeasure(raw: unknown): ParsedMeasure | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw)
      ? { value: raw, unit: null, family: 'unitless', factor: 1 }
      : null;
  }
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  const match = NUMBER_PREFIX.exec(text);
  if (!match) return null;
  const value = numericValue(match[0]);
  if (value === null) return null;
  const unitText = text.slice(match[0].length).trim();
  if (!unitText) return { value, unit: null, family: 'unitless', factor: 1 };
  const key = normalizeUnit(unitText);
  const spec = UNIT_SPECS[key];
  if (spec) {
    return { value, unit: unitText, family: spec.family, factor: spec.factor };
  }
  if (!UNIT_TOKEN.test(key)) return null;
  return { value, unit: unitText, family: `unit:${key}`, factor: 1 };
}
