import { resolveClass } from './classTable.js';
import { globalIdFor, hashGlobalId } from './globalId.js';
import type {
  IfcBuildingModel,
  IfcElement,
  IfcExportModel,
  IfcMesh,
  IfcPset,
  IfcSettings,
  IfcSourceRead,
  IfcStorey,
  PropertyGroups,
  SourceElement,
} from './types.js';

export const LEVEL_FALLBACKS: readonly string[] = [
  'Level',
  'Base Level',
  'Reference Level',
  'Schedule Level',
];

export interface MapOptions {
  defaultName: string;
  now?: Date;
}

function findProperty(
  groups: PropertyGroups,
  name: string,
): string | undefined {
  const ordered =
    name === 'Category' && groups.Other
      ? [
          groups.Other,
          ...Object.entries(groups)
            .filter(([key]) => key !== 'Other')
            .map(([, props]) => props),
        ]
      : Object.values(groups);
  for (const props of ordered) {
    const value = props[name];
    if (value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return undefined;
}

function validMesh(mesh: IfcMesh): boolean {
  const vertices = mesh.positions.length / 3;
  if (!Number.isInteger(vertices) || vertices === 0) return false;
  if (mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) return false;
  for (const index of mesh.indices) if (index >= vertices) return false;
  return true;
}

function psetsOf(groups: PropertyGroups, settings: IfcSettings): IfcPset[] {
  const out: IfcPset[] = [];
  for (const [name, props] of Object.entries(groups)) {
    if (settings.psetExclude.includes(name)) continue;
    if (
      settings.psetInclude.length > 0 &&
      !settings.psetInclude.includes(name)
    ) {
      continue;
    }
    const entries = Object.entries(props).map(([key, value]) => ({
      name: key,
      value,
    }));
    if (entries.length > 0) out.push({ name, props: entries });
  }
  return out;
}

export function mapToIfc(
  source: IfcSourceRead,
  settings: IfcSettings,
  options: MapOptions,
): IfcExportModel {
  const single = source.models.length === 1;
  const levelNames = [
    ...new Set([settings.levelProperty, ...LEVEL_FALLBACKS].filter(Boolean)),
  ];
  const seen = new Set<string>();
  const buildings: IfcBuildingModel[] = source.models.map((model) => {
    const storeys = new Map<string, IfcStorey>();
    const place = (element: SourceElement): void => {
      const meshes = element.parts.filter(validMesh);
      if (meshes.length === 0) return;
      const category = findProperty(element.properties, 'Category');
      const ifcClass = resolveClass(category, settings.classOverrides);
      let guid = globalIdFor({
        externalId: element.externalId,
        urn: model.urn,
        dbId: element.dbId,
      });
      if (seen.has(guid)) {
        guid = hashGlobalId(`${model.urn}|dup|${element.dbId}`);
      }
      seen.add(guid);
      const typeName = findProperty(element.properties, 'Type Name');
      const mapped: IfcElement = {
        guid,
        name: element.name.trim() || `${ifcClass} ${element.dbId}`,
        ifcClass,
        ...(category ? { objectType: category } : {}),
        ...(typeName ? { typeName } : {}),
        psets: psetsOf(element.properties, settings),
        meshes,
      };
      let storeyName: string | undefined;
      for (const name of levelNames) {
        storeyName = findProperty(element.properties, name);
        if (storeyName) break;
      }
      storeyName ??= settings.fallbackStorey || 'Unassigned';
      let storey = storeys.get(storeyName);
      if (!storey) {
        storey = { name: storeyName, elements: [] };
        storeys.set(storeyName, storey);
      }
      storey.elements.push(mapped);
    };
    for (const element of model.elements) place(element);
    return {
      guid: hashGlobalId(`building|${model.urn}`),
      name:
        single && settings.buildingName ? settings.buildingName : model.name,
      storeys: [...storeys.values()],
    };
  });
  return {
    projectName: settings.projectName || options.defaultName,
    siteName: settings.siteName || 'Site',
    author: settings.author,
    organisation: settings.organisation,
    unit: settings.lengthUnit,
    timestamp: (options.now ?? new Date()).toISOString().slice(0, 19),
    buildings,
  };
}
