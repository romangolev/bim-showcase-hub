import { describe, expect, it } from 'vitest';
import { buildIfc } from './buildIfc.js';
import { ALLOWED_CLASSES } from './classTable.js';
import type { IfcExportModel } from './types.js';

const ELEMENT_ATTRIBUTES: Record<string, number> = {
  IFCBEAM: 9,
  IFCBUILDINGELEMENTPROXY: 9,
  IFCCOLUMN: 9,
  IFCCOVERING: 9,
  IFCDOOR: 13,
  IFCDUCTSEGMENT: 9,
  IFCFOOTING: 9,
  IFCFURNITURE: 9,
  IFCMEMBER: 9,
  IFCPIPESEGMENT: 9,
  IFCPLATE: 9,
  IFCRAILING: 9,
  IFCRAMP: 9,
  IFCROOF: 9,
  IFCSANITARYTERMINAL: 9,
  IFCSLAB: 9,
  IFCSTAIR: 9,
  IFCWALL: 9,
  IFCWINDOW: 13,
};

const TYPE_ATTRIBUTES: Record<string, number> = {
  IFCBEAMTYPE: 10,
  IFCBUILDINGELEMENTPROXYTYPE: 10,
  IFCCOLUMNTYPE: 10,
  IFCCOVERINGTYPE: 10,
  IFCDOORTYPE: 13,
  IFCDUCTSEGMENTTYPE: 10,
  IFCFOOTINGTYPE: 10,
  IFCFURNITURETYPE: 11,
  IFCMEMBERTYPE: 10,
  IFCPIPESEGMENTTYPE: 10,
  IFCPLATETYPE: 10,
  IFCRAILINGTYPE: 10,
  IFCRAMPTYPE: 10,
  IFCROOFTYPE: 10,
  IFCSANITARYTERMINALTYPE: 10,
  IFCSLABTYPE: 10,
  IFCSTAIRTYPE: 10,
  IFCWALLTYPE: 10,
  IFCWINDOWTYPE: 13,
};

const FIXED_ATTRIBUTES: Record<string, number> = {
  IFCPROJECT: 9,
  IFCSITE: 14,
  IFCBUILDING: 12,
  IFCBUILDINGSTOREY: 10,
  IFCTRIANGULATEDFACESET: 5,
  IFCSURFACESTYLERENDERING: 9,
  IFCSURFACESTYLE: 3,
  IFCCOLOURRGB: 4,
  IFCSTYLEDITEM: 3,
  IFCPROPERTYSET: 5,
  IFCPROPERTYSINGLEVALUE: 4,
  IFCRELAGGREGATES: 6,
  IFCRELCONTAINEDINSPATIALSTRUCTURE: 6,
  IFCRELDEFINESBYPROPERTIES: 6,
  IFCRELDEFINESBYTYPE: 6,
  IFCLOCALPLACEMENT: 2,
  IFCAXIS2PLACEMENT3D: 3,
  IFCGEOMETRICREPRESENTATIONCONTEXT: 6,
  IFCGEOMETRICREPRESENTATIONSUBCONTEXT: 10,
  IFCCARTESIANPOINT: 1,
  IFCCARTESIANPOINTLIST3D: 1,
  IFCSHAPEREPRESENTATION: 4,
  IFCPRODUCTDEFINITIONSHAPE: 3,
  IFCSIUNIT: 4,
  IFCUNITASSIGNMENT: 1,
};

const EXPECTED = {
  ...ELEMENT_ATTRIBUTES,
  ...TYPE_ATTRIBUTES,
  ...FIXED_ATTRIBUTES,
};

function argumentCount(text: string): number {
  let depth = 0;
  let quoted = false;
  let count = text.length > 0 ? 1 : 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === "'") {
        if (text[i + 1] === "'") i += 1;
        else quoted = false;
      }
    } else if (ch === "'") quoted = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) count += 1;
  }
  return count;
}

function entities(text: string): { name: string; args: number }[] {
  const out: { name: string; args: number }[] = [];
  for (const line of text.split('\n')) {
    const match = /^#\d+=([A-Z0-9_]+)\((.*)\);$/.exec(line);
    if (match) {
      out.push({
        name: match[1] as string,
        args: argumentCount(match[2] as string),
      });
    }
  }
  return out;
}

function modelWith(classes: readonly string[]): IfcExportModel {
  return {
    projectName: 'Attr',
    siteName: 'Site',
    author: 'A',
    organisation: 'O',
    unit: 'm',
    timestamp: '2026-11-17T10:00:00',
    buildings: [
      {
        guid: 'B000000000000000000001',
        name: "B, (odd) 'name'",
        storeys: [
          {
            name: 'L1',
            elements: classes.map((ifcClass, index) => ({
              guid: `E${String(index).padStart(21, '0')}`,
              name: `El, ${index}`,
              ifcClass,
              typeName: `Type ${ifcClass}`,
              psets: [{ name: 'P', props: [{ name: 'k', value: 'v, (x)' }] }],
              meshes: [
                {
                  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                  indices: new Uint16Array([0, 1, 2]),
                  color: [1, 0, 0, 1],
                },
              ],
            })),
          },
        ],
      },
    ],
  };
}

describe('IFC4 attribute counts', () => {
  it('writes every entity with the number of attributes the schema defines', () => {
    const text = [...buildIfc(modelWith(ALLOWED_CLASSES))].join('');
    const found = entities(text);
    const seen = new Set(found.map((e) => e.name));
    for (const cls of ALLOWED_CLASSES) {
      expect(seen.has(cls.toUpperCase())).toBe(true);
      expect(seen.has(`${cls.toUpperCase()}TYPE`)).toBe(true);
    }
    const wrong = found.filter((e) => EXPECTED[e.name] !== e.args);
    expect(wrong).toEqual([]);
  });
});
