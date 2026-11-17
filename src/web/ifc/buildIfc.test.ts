import { describe, expect, it } from 'vitest';
import { buildIfc } from './buildIfc.js';
import type { IfcElement, IfcExportModel, IfcMesh } from './types.js';

function mesh(overrides: Partial<IfcMesh> = {}): IfcMesh {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 2]),
    color: [1, 0, 0, 1],
    ...overrides,
  };
}

function element(overrides: Partial<IfcElement> = {}): IfcElement {
  return {
    guid: '0123456789012345678901',
    name: 'Wall 1',
    ifcClass: 'IfcWall',
    objectType: 'Revit Walls',
    typeName: 'Basic Wall',
    psets: [
      {
        name: 'Identity Data',
        props: [
          { name: 'Mark', value: 'A1' },
          { name: 'Count', value: 3 },
          { name: 'Height', value: 2.5 },
          { name: 'Fire rated', value: true },
        ],
      },
    ],
    meshes: [mesh()],
    ...overrides,
  };
}

function model(overrides: Partial<IfcExportModel> = {}): IfcExportModel {
  return {
    projectName: 'Tower',
    siteName: 'Site',
    author: 'Ann',
    organisation: 'Org',
    unit: 'm',
    timestamp: '2026-11-17T10:00:00',
    buildings: [
      {
        guid: 'B000000000000000000001',
        name: 'Tower.rvt',
        storeys: [
          { name: 'Level 1', elements: [element()] },
          {
            name: 'Level 2',
            elements: [
              element({
                guid: '0123456789012345678902',
                name: 'Door 1',
                ifcClass: 'IfcDoor',
                typeName: 'Single',
                psets: [],
              }),
              element({
                guid: '0123456789012345678903',
                name: 'Thing',
                ifcClass: 'IfcBuildingElementProxy',
                typeName: undefined,
                psets: [],
                meshes: [],
              }),
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function render(m: IfcExportModel): string {
  return [...buildIfc(m)].join('');
}

function entities(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of text.split('\n')) {
    const match = /^#(\d+)=(.*);$/.exec(line);
    if (match) map.set(Number(match[1]), match[2] as string);
  }
  return map;
}

describe('buildIfc', () => {
  it('writes an IFC4 header with author and organisation', () => {
    const text = render(model());
    expect(text.startsWith('ISO-10303-21;\nHEADER;')).toBe(true);
    expect(text).toContain("FILE_SCHEMA(('IFC4'))");
    expect(text).toContain("('Ann'),('Org')");
    expect(text).toContain('ViewDefinition [ReferenceView_V1.2]');
    expect(text.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
  });

  it('resolves every entity reference', () => {
    const text = render(model());
    const defined = entities(text);
    expect(defined.size).toBeGreaterThan(20);
    for (const [, body] of defined) {
      for (const ref of body.matchAll(/#(\d+)/g)) {
        expect(defined.has(Number(ref[1]))).toBe(true);
      }
    }
  });

  it('writes the spatial structure with one building per model', () => {
    const two = model({
      buildings: [
        ...model().buildings,
        {
          guid: 'B000000000000000000002',
          name: 'Annex.rvt',
          storeys: [{ name: 'Level 1', elements: [element()] }],
        },
      ],
    });
    const text = render(two);
    expect(text.match(/=IFCBUILDING\(/g)).toHaveLength(2);
    expect(text.match(/=IFCBUILDINGSTOREY\(/g)).toHaveLength(3);
    expect(text.match(/=IFCSITE\(/g)).toHaveLength(1);
    expect(text.match(/=IFCPROJECT\(/g)).toHaveLength(1);
  });

  it('writes elements with their class, type, properties and styles', () => {
    const text = render(model());
    expect(text).toContain(
      "IFCWALL('0123456789012345678901',$,'Wall 1',$,'Revit Walls',",
    );
    expect(text).toContain("IFCDOOR('0123456789012345678902',$,'Door 1',$,");
    expect(text).toContain(',$,$,$,$,$);');
    expect(text).toContain("IFCBUILDINGELEMENTPROXY('0123456789012345678903'");
    expect(text).toContain("=IFCWALLTYPE('");
    expect(text).toContain("'Basic Wall',$,$,$,$,$,$,.NOTDEFINED.);");
    expect(text).toContain("=IFCDOORTYPE('");
    expect(text).toContain(',.NOTDEFINED.,.NOTDEFINED.,$,$);');
    expect(text.match(/=IFCRELDEFINESBYTYPE\(/g)).toHaveLength(2);
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Mark',$,IFCLABEL('A1'),$)");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Count',$,IFCINTEGER(3),$)");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Height',$,IFCREAL(2.5),$)");
    expect(text).toContain(
      "IFCPROPERTYSINGLEVALUE('Fire rated',$,IFCBOOLEAN(.T.),$)",
    );
    expect(text).toContain("IFCPROPERTYSET('");
    expect(text).toContain('IFCSURFACESTYLERENDERING(');
    expect(text.match(/=IFCSURFACESTYLE\(/g)).toHaveLength(1);
  });

  it('writes tessellated geometry with one-based indices in range', () => {
    const text = render(model());
    expect(text).toContain(
      'IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(0.,1.,0.)))',
    );
    expect(text).toContain('IFCTRIANGULATEDFACESET(#');
    expect(text).toContain(',$,$,((1,2,3)),$)');
  });

  it('gives an element without meshes no representation', () => {
    const text = render(model());
    const proxy = [...entities(text).values()].find((body) =>
      body.startsWith("IFCBUILDINGELEMENTPROXY('0123456789012345678903'"),
    );
    expect(proxy?.endsWith(',$,$,$)')).toBe(true);
  });

  it('scales coordinates and declares millimetres', () => {
    const text = render(model({ unit: 'mm' }));
    expect(text).toContain('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)');
    expect(text).toContain('((0.,0.,0.),(1000.,0.,0.),(0.,1000.,0.))');
  });

  it('is deterministic and splits large models into several chunks', () => {
    const many = model({
      buildings: [
        {
          guid: 'B000000000000000000001',
          name: 'Big',
          storeys: [
            {
              name: 'L',
              elements: Array.from({ length: 800 }, (_, i) =>
                element({ guid: `E${String(i).padStart(21, '0')}` }),
              ),
            },
          ],
        },
      ],
    });
    const first = [...buildIfc(many)];
    expect(first.length).toBeGreaterThan(2);
    expect(first.join('')).toBe([...buildIfc(many)].join(''));
  });

  it('writes integers outside the 32-bit range as reals', () => {
    const text = render(
      model({
        buildings: [
          {
            guid: 'B000000000000000000001',
            name: 'Tower.rvt',
            storeys: [
              {
                name: 'Level 1',
                elements: [
                  element({
                    psets: [
                      {
                        name: 'Numbers',
                        props: [
                          { name: 'Big', value: 5000000000 },
                          { name: 'Huge', value: 1e21 },
                          { name: 'Small', value: 42 },
                        ],
                      },
                    ],
                  }),
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(text).toContain(
      "IFCPROPERTYSINGLEVALUE('Big',$,IFCREAL(5000000000.),$)",
    );
    expect(text).toMatch(/IFCPROPERTYSINGLEVALUE\('Huge',\$,IFCREAL\(/);
    expect(text).toContain(
      "IFCPROPERTYSINGLEVALUE('Small',$,IFCINTEGER(42),$)",
    );
  });
});

function guidsOf(text: string, names: string[]): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const match = /^#\d+=([A-Z0-9]+)\('([0-9A-Za-z_$]{22})'/.exec(line);
    if (match && names.includes(match[1] as string)) {
      out.push(match[2] as string);
    }
  }
  return out;
}

const DERIVED = [
  'IFCPROPERTYSET',
  'IFCRELDEFINESBYPROPERTIES',
  'IFCRELDEFINESBYTYPE',
  'IFCRELCONTAINEDINSPATIALSTRUCTURE',
  'IFCBUILDINGSTOREY',
  'IFCRELAGGREGATES',
  'IFCWALLTYPE',
  'IFCDOORTYPE',
];

describe('stable GlobalIds', () => {
  const text = (m: IfcExportModel) => [...buildIfc(m)].join('');

  it('writes identical output for the same model', () => {
    expect(text(model())).toBe(text(model()));
  });

  it('keeps existing derived ids when an element is added', () => {
    const base = model();
    const extended = model();
    const first = extended.buildings[0]?.storeys[0];
    first?.elements.push(
      element({
        guid: '0123456789012345678999',
        name: 'Wall 9',
        typeName: 'Other',
      }),
    );
    const before = guidsOf(text(base), DERIVED);
    const after = new Set(guidsOf(text(extended), DERIVED));
    expect(before.filter((id) => !after.has(id))).toEqual([]);
  });

  it('shares no derived id between different models and project names', () => {
    const a = model();
    const b = model({ projectName: 'Other' });
    const other = b.buildings[0];
    if (other) {
      other.guid = 'B000000000000000000002';
      other.storeys.forEach((storey, row) => {
        storey.elements.forEach((item, col) => {
          item.guid = `X${row}${col}`.padEnd(22, '0');
        });
      });
    }
    const first = new Set(guidsOf(text(a), DERIVED));
    const second = guidsOf(text(b), DERIVED);
    expect(second.filter((id) => first.has(id))).toEqual([]);
  });

  it('does not depend on the project name', () => {
    const a = guidsOf(text(model()), DERIVED);
    const b = guidsOf(text(model({ projectName: 'Renamed' })), DERIVED);
    expect(b).toEqual(a);
  });
});
