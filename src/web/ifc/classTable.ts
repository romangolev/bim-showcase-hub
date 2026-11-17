export const PROXY_CLASS = 'IfcBuildingElementProxy';

interface ClassSpec {
  elementTail: string;
  typeTail: string;
}

const PLAIN: ClassSpec = { elementTail: '$', typeTail: '.NOTDEFINED.' };
const OPENING: ClassSpec = {
  elementTail: '$,$,$,$,$',
  typeTail: '.NOTDEFINED.,.NOTDEFINED.,$,$',
};

export const CLASS_SPECS: Readonly<Record<string, ClassSpec>> = {
  IfcBeam: PLAIN,
  IfcBuildingElementProxy: PLAIN,
  IfcColumn: PLAIN,
  IfcCovering: PLAIN,
  IfcDoor: OPENING,
  IfcDuctSegment: PLAIN,
  IfcFooting: PLAIN,
  IfcFurniture: PLAIN,
  IfcMember: PLAIN,
  IfcPipeSegment: PLAIN,
  IfcPlate: PLAIN,
  IfcRailing: PLAIN,
  IfcRamp: PLAIN,
  IfcRoof: PLAIN,
  IfcSanitaryTerminal: PLAIN,
  IfcSlab: PLAIN,
  IfcStair: PLAIN,
  IfcWall: PLAIN,
  IfcWindow: OPENING,
};

export const ALLOWED_CLASSES: readonly string[] = Object.keys(CLASS_SPECS);

export const DEFAULT_CLASS_TABLE: Readonly<Record<string, string>> = {
  walls: 'IfcWall',
  floors: 'IfcSlab',
  roofs: 'IfcRoof',
  ceilings: 'IfcCovering',
  columns: 'IfcColumn',
  'structural columns': 'IfcColumn',
  'structural framing': 'IfcBeam',
  'structural foundations': 'IfcFooting',
  doors: 'IfcDoor',
  windows: 'IfcWindow',
  stairs: 'IfcStair',
  railings: 'IfcRailing',
  ramps: 'IfcRamp',
  'curtain wall panels': 'IfcPlate',
  'curtain wall mullions': 'IfcMember',
  furniture: 'IfcFurniture',
  'plumbing fixtures': 'IfcSanitaryTerminal',
  pipes: 'IfcPipeSegment',
  ducts: 'IfcDuctSegment',
  'generic models': PROXY_CLASS,
};

export function normalizeCategory(value: string): string {
  return value
    .trim()
    .replace(/^revit\s+/i, '')
    .toLowerCase();
}

export function resolveClass(
  category: string | undefined,
  overrides: Readonly<Record<string, string>>,
): string {
  if (!category) return PROXY_CLASS;
  const key = normalizeCategory(category);
  for (const [name, target] of Object.entries(overrides)) {
    if (normalizeCategory(name) === key && ALLOWED_CLASSES.includes(target)) {
      return target;
    }
  }
  return DEFAULT_CLASS_TABLE[key] ?? PROXY_CLASS;
}
