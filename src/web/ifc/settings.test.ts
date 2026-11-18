import { describe, expect, it } from 'vitest';
import { DEFAULT_IFC_SETTINGS, readIfcSettings } from './settings.js';

describe('readIfcSettings', () => {
  it('returns the defaults for anything that is not a record', () => {
    expect(readIfcSettings(undefined)).toEqual(DEFAULT_IFC_SETTINGS);
    expect(readIfcSettings('x')).toEqual(DEFAULT_IFC_SETTINGS);
  });

  it('validates the settings field by field', () => {
    const ifc = readIfcSettings({
      classOverrides: {
        Walls: 'IfcCovering',
        Bad: 'IfcNonsense',
        ' ': 'IfcWall',
      },
      psetExclude: [' Dimensions ', '', 7],
      psetInclude: 'nope',
      levelProperty: '',
      fallbackStorey: 'Ground',
      projectName: 'P',
      lengthUnit: 'km',
    });
    expect(ifc.classOverrides).toEqual({ Walls: 'IfcCovering' });
    expect(ifc.psetExclude).toEqual(['Dimensions']);
    expect(ifc.psetInclude).toEqual([]);
    expect(ifc.levelProperty).toBe('Level');
    expect(ifc.fallbackStorey).toBe('Ground');
    expect(ifc.projectName).toBe('P');
    expect(ifc.lengthUnit).toBe('m');
  });

  it('keeps millimetres', () => {
    expect(readIfcSettings({ lengthUnit: 'mm' }).lengthUnit).toBe('mm');
  });
});
