import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CLASSES,
  CLASS_SPECS,
  normalizeCategory,
  PROXY_CLASS,
  resolveClass,
} from './classTable.js';

describe('normalizeCategory', () => {
  it('drops the Revit prefix, trims and lower-cases', () => {
    expect(normalizeCategory('Revit Walls')).toBe('walls');
    expect(normalizeCategory('  Structural Columns ')).toBe(
      'structural columns',
    );
  });
});

describe('resolveClass', () => {
  it('maps known Revit categories', () => {
    expect(resolveClass('Revit Walls', {})).toBe('IfcWall');
    expect(resolveClass('Floors', {})).toBe('IfcSlab');
    expect(resolveClass('Revit Doors', {})).toBe('IfcDoor');
  });

  it('falls back to the proxy for unknown or missing categories', () => {
    expect(resolveClass('Revit Mystery', {})).toBe(PROXY_CLASS);
    expect(resolveClass(undefined, {})).toBe(PROXY_CLASS);
  });

  it('prefers overrides and ignores classes outside the allow-list', () => {
    expect(resolveClass('Revit Walls', { walls: 'IfcCovering' })).toBe(
      'IfcCovering',
    );
    expect(resolveClass('Revit Walls', { Walls: 'IfcNonsense' })).toBe(
      'IfcWall',
    );
  });
});

describe('CLASS_SPECS', () => {
  it('has a spec for every allowed class and the proxy', () => {
    for (const name of ALLOWED_CLASSES) expect(CLASS_SPECS[name]).toBeDefined();
    expect(ALLOWED_CLASSES).toContain(PROXY_CLASS);
  });
});
