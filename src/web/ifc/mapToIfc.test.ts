import { describe, expect, it } from 'vitest';
import { readIfcSettings } from '../settings/settings.js';
import { mapToIfc } from './mapToIfc.js';
import type { IfcSettings, IfcSourceRead, SourceElement } from './types.js';

const SETTINGS: IfcSettings = {
  classOverrides: {},
  psetExclude: [],
  psetInclude: [],
  levelProperty: 'Level',
  fallbackStorey: 'Unassigned',
  projectName: '',
  siteName: 'Site',
  buildingName: '',
  author: 'Ann',
  organisation: 'Org',
  lengthUnit: 'm',
};

const NOW = new Date('2026-11-17T10:20:30.000Z');

function part() {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 2]),
  };
}

function el(overrides: Partial<SourceElement> = {}): SourceElement {
  return {
    dbId: 1,
    name: 'Basic Wall [1]',
    properties: {
      Identity: { Category: 'Revit Walls', 'Type Name': 'Basic Wall' },
      Constraints: { Level: 'Level 1' },
      Dimensions: { Height: 2.5 },
    },
    parts: [part()],
    ...overrides,
  };
}

function source(
  elements: SourceElement[],
  extra: Partial<IfcSourceRead['models'][number]>[] = [],
): IfcSourceRead {
  return {
    skipped: 0,
    models: [
      { id: 'a', name: 'Tower.rvt', urn: 'urn-a', elements },
      ...extra.map((model, index) => ({
        id: `x${index}`,
        name: `X${index}`,
        urn: `urn-x${index}`,
        elements: [],
        ...model,
      })),
    ],
  };
}

function map(src: IfcSourceRead, settings: Partial<IfcSettings> = {}) {
  return mapToIfc(
    src,
    { ...SETTINGS, ...settings },
    {
      defaultName: 'Tower',
      now: NOW,
    },
  );
}

describe('mapToIfc', () => {
  it('maps the project, building, class, level, type and psets', () => {
    const model = map(source([el()]));
    expect(model.projectName).toBe('Tower');
    expect(model.siteName).toBe('Site');
    expect(model.unit).toBe('m');
    expect(model.timestamp).toBe('2026-11-17T10:20:30');
    expect(model.buildings).toHaveLength(1);
    const building = model.buildings[0];
    expect(building?.name).toBe('Tower.rvt');
    expect(building?.storeys.map((s) => s.name)).toEqual(['Level 1']);
    const element = building?.storeys[0]?.elements[0];
    expect(element?.ifcClass).toBe('IfcWall');
    expect(element?.objectType).toBe('Revit Walls');
    expect(element?.typeName).toBe('Basic Wall');
    expect(element?.name).toBe('Basic Wall [1]');
    expect(element?.psets.map((p) => p.name)).toEqual([
      'Identity',
      'Constraints',
      'Dimensions',
    ]);
    expect(element?.guid).toMatch(/^[0-9A-Za-z_$]{22}$/);
  });

  it('falls back to the default names when the settings are empty', () => {
    const model = map(source([el()]), {
      siteName: '',
      levelProperty: '',
      fallbackStorey: '',
    });
    expect(model.siteName).toBe('Site');
    expect(model.buildings[0]?.storeys.map((s) => s.name)).toEqual(['Level 1']);
    const bare = map(source([el({ properties: {} })]), {
      levelProperty: '',
      fallbackStorey: '',
    });
    expect(bare.buildings[0]?.storeys.map((s) => s.name)).toEqual([
      'Unassigned',
    ]);
  });

  it('uses settings names where given', () => {
    const model = map(source([el()]), {
      projectName: 'My project',
      buildingName: 'Main',
      lengthUnit: 'mm',
    });
    expect(model.projectName).toBe('My project');
    expect(model.buildings[0]?.name).toBe('Main');
    expect(model.unit).toBe('mm');
    expect(model.author).toBe('Ann');
    expect(model.organisation).toBe('Org');
  });

  it('keeps model names when several models are exported', () => {
    const model = map(source([el()], [{ elements: [el({ dbId: 2 })] }]), {
      buildingName: 'Main',
    });
    expect(model.buildings.map((b) => b.name)).toEqual(['Tower.rvt', 'X0']);
  });

  it('applies class overrides and falls back to the proxy', () => {
    const wall = el();
    const odd = el({
      dbId: 2,
      properties: { Identity: { Category: 'Revit Mystery' } },
    });
    const model = map(source([wall, odd]), {
      classOverrides: { Walls: 'IfcCovering' },
    });
    const elements = model.buildings[0]?.storeys.flatMap((s) => s.elements);
    expect(elements?.map((e) => e.ifcClass)).toEqual([
      'IfcCovering',
      'IfcBuildingElementProxy',
    ]);
  });

  it('puts elements without a level in the fallback storey and keeps order', () => {
    const lvl2 = el({
      dbId: 2,
      properties: { C: { Category: 'Revit Walls', Level: 'Level 2' } },
    });
    const none = el({
      dbId: 3,
      properties: { C: { Category: 'Revit Walls' } },
    });
    const model = map(source([el(), lvl2, none]), { fallbackStorey: 'Ground' });
    expect(model.buildings[0]?.storeys.map((s) => s.name)).toEqual([
      'Level 1',
      'Level 2',
      'Ground',
    ]);
  });

  it('matches a level property that was saved with trailing spaces', () => {
    const settings = readIfcSettings({
      ...SETTINGS,
      levelProperty: 'Category ',
    });
    const model = mapToIfc(source([el()]), settings, {
      defaultName: 'T',
      now: NOW,
    });
    expect(model.buildings[0]?.storeys[0]?.name).toBe('Revit Walls');
  });

  it('prefers the Other group for Category over a family parameter', () => {
    const model = map(
      source([
        el({
          properties: {
            Identity: { Category: 'Family param' },
            Other: { Category: 'Revit Doors' },
          },
        }),
      ]),
    );
    expect(model.buildings[0]?.storeys[0]?.elements[0]?.ifcClass).toBe(
      'IfcDoor',
    );
  });

  it('reads the level from the configured property', () => {
    const model = map(source([el()]), { levelProperty: 'Category' });
    expect(model.buildings[0]?.storeys[0]?.name).toBe('Revit Walls');
  });

  it.each(['Base Level', 'Reference Level', 'Schedule Level'])(
    'falls back to %s when there is no Level',
    (name) => {
      const model = map(
        source([
          el({
            properties: {
              Identity: { Category: 'Revit Walls' },
              Other: { [name]: 'Roof' },
            },
          }),
        ]),
      );
      expect(model.buildings[0]?.storeys[0]?.name).toBe('Roof');
    },
  );

  it('prefers the configured property over the fallbacks', () => {
    const model = map(
      source([
        el({
          properties: {
            Identity: { Category: 'Revit Walls' },
            Constraints: { Level: 'Level 1', 'Base Level': 'Roof', Zone: 'Z9' },
          },
        }),
      ]),
      { levelProperty: 'Zone' },
    );
    expect(model.buildings[0]?.storeys[0]?.name).toBe('Z9');
  });

  it('honours the property group include and exclude lists', () => {
    const excluded = map(source([el()]), { psetExclude: ['Dimensions'] });
    expect(
      excluded.buildings[0]?.storeys[0]?.elements[0]?.psets.map((p) => p.name),
    ).toEqual(['Identity', 'Constraints']);
    const included = map(source([el()]), { psetInclude: ['Dimensions'] });
    expect(
      included.buildings[0]?.storeys[0]?.elements[0]?.psets.map((p) => p.name),
    ).toEqual(['Dimensions']);
  });

  it('names unnamed elements after their class and id', () => {
    const model = map(source([el({ name: '' })]));
    expect(model.buildings[0]?.storeys[0]?.elements[0]?.name).toBe('IfcWall 1');
  });

  it('gives duplicate external ids distinct GlobalIds', () => {
    const guid = '11111111-2222-3333-4444-555555555555';
    const model = map(
      source([
        el({ dbId: 1, externalId: guid }),
        el({ dbId: 2, externalId: guid }),
      ]),
    );
    const [a, b] = model.buildings[0]?.storeys[0]?.elements ?? [];
    expect(a?.guid).not.toBe(b?.guid);
  });

  it('keeps GlobalIds unique across models that repeat the same external id', () => {
    const guid = '11111111-2222-3333-4444-555555555555';
    const model = map(
      source(
        [el({ dbId: 1, externalId: guid })],
        [{ elements: [el({ dbId: 1, externalId: guid })] }],
      ),
    );
    const ids = model.buildings.flatMap((b) =>
      b.storeys.flatMap((s) => s.elements.map((e) => e.guid)),
    );
    expect(new Set(ids).size).toBe(2);
  });

  it('drops meshes with broken indices and elements left without geometry', () => {
    const broken = el({
      dbId: 2,
      parts: [
        {
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          indices: new Uint16Array([0, 1, 5]),
        },
      ],
    });
    const mixed = el({
      dbId: 3,
      parts: [
        part(),
        {
          positions: new Float32Array([0, 0, 0]),
          indices: new Uint16Array([0, 0]),
        },
      ],
    });
    const model = map(source([el(), broken, mixed]));
    const elements = model.buildings[0]?.storeys.flatMap((s) => s.elements);
    expect(elements).toHaveLength(2);
    expect(elements?.[1]?.meshes).toHaveLength(1);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(map(source([el()])))).toBe(
      JSON.stringify(map(source([el()]))),
    );
  });
});
