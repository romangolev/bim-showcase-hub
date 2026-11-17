export type Rgba = readonly [number, number, number, number];

export interface IfcMesh {
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
  color?: Rgba;
}

export type PropertyValue = string | number | boolean;

export type PropertyGroups = Record<string, Record<string, PropertyValue>>;

export interface SourceElement {
  dbId: number;
  externalId?: string;
  name: string;
  properties: PropertyGroups;
  parts: IfcMesh[];
}

export interface SourceModel {
  id: string;
  name: string;
  urn: string;
  elements: SourceElement[];
}

export interface IfcSourceRead {
  models: SourceModel[];
  skipped: number;
  levelsUnavailable?: number;
  generatedIds?: number;
}

export interface IfcSettings {
  classOverrides: Record<string, string>;
  psetExclude: string[];
  psetInclude: string[];
  levelProperty: string;
  fallbackStorey: string;
  projectName: string;
  siteName: string;
  buildingName: string;
  author: string;
  organisation: string;
  lengthUnit: 'm' | 'mm';
}

export interface IfcPset {
  name: string;
  props: { name: string; value: PropertyValue }[];
}

export interface IfcElement {
  guid: string;
  name: string;
  ifcClass: string;
  objectType?: string;
  typeName?: string;
  psets: IfcPset[];
  meshes: IfcMesh[];
}

export interface IfcStorey {
  name: string;
  elements: IfcElement[];
}

export interface IfcBuildingModel {
  guid: string;
  name: string;
  storeys: IfcStorey[];
}

export interface IfcExportModel {
  projectName: string;
  siteName: string;
  author: string;
  organisation: string;
  unit: 'm' | 'mm';
  timestamp: string;
  buildings: IfcBuildingModel[];
}
