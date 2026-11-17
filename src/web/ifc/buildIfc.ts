import { CLASS_SPECS, PROXY_CLASS } from './classTable.js';
import { hashGlobalId } from './globalId.js';
import { stepReal, stepString } from './stepWriter.js';
import type {
  IfcElement,
  IfcExportModel,
  IfcMesh,
  PropertyValue,
} from './types.js';

const CHUNK_LINES = 4000;
const GENERATOR = 'BIM Showcase Hub';

class Out {
  private lines: string[] = [];
  private next = 1;

  get nextId(): number {
    return this.next;
  }

  get pending(): number {
    return this.lines.length;
  }

  add(body: string): number {
    const id = this.next;
    this.next += 1;
    this.lines.push(`#${id}=${body};`);
    return id;
  }

  take(): string {
    const text = `${this.lines.join('\n')}\n`;
    this.lines = [];
    return text;
  }
}

function header(model: IfcExportModel): string {
  const list = (value: string) => `(${stepString(value)})`;
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${stepString(`${model.projectName}.ifc`)},${stepString(model.timestamp)},${list(model.author)},${list(model.organisation)},${stepString(GENERATOR)},${stepString(GENERATOR)},'');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    '',
  ].join('\n');
}

function nominal(value: PropertyValue): string {
  if (typeof value === 'boolean') {
    return `IFCBOOLEAN(${value ? '.T.' : '.F.'})`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) && Math.abs(value) <= 2147483647
      ? `IFCINTEGER(${value})`
      : `IFCREAL(${stepReal(value)})`;
  }
  return `IFCLABEL(${stepString(String(value).slice(0, 255))})`;
}

function pointList(mesh: IfcMesh, scale: number): string {
  const points: string[] = [];
  for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
    points.push(
      `(${stepReal((mesh.positions[i] as number) * scale)},${stepReal((mesh.positions[i + 1] as number) * scale)},${stepReal((mesh.positions[i + 2] as number) * scale)})`,
    );
  }
  return points.join(',');
}

function faceList(mesh: IfcMesh): string {
  const faces: string[] = [];
  for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
    faces.push(
      `(${(mesh.indices[i] as number) + 1},${(mesh.indices[i + 1] as number) + 1},${(mesh.indices[i + 2] as number) + 1})`,
    );
  }
  return faces.join(',');
}

export function* buildIfc(model: IfcExportModel): Generator<string> {
  const out = new Out();
  const scale = model.unit === 'mm' ? 1000 : 1;
  const guid = (seed: string) => hashGlobalId(`${model.projectName}|${seed}`);
  const styles = new Map<string, number>();

  yield header(model);

  const origin = out.add('IFCCARTESIANPOINT((0.,0.,0.))');
  const axis = out.add(`IFCAXIS2PLACEMENT3D(#${origin},$,$)`);
  const context = out.add(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${axis},$)`,
  );
  const body = out.add(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${context},$,.MODEL_VIEW.,$)`,
  );
  const lengthUnit = out.add(
    model.unit === 'mm'
      ? 'IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)'
      : 'IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)',
  );
  const angleUnit = out.add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
  const units = out.add(`IFCUNITASSIGNMENT((#${lengthUnit},#${angleUnit}))`);
  const project = out.add(
    `IFCPROJECT('${guid('project')}',$,${stepString(model.projectName)},$,$,$,$,(#${context}),#${units})`,
  );
  const sitePlacement = out.add(`IFCLOCALPLACEMENT($,#${axis})`);
  const site = out.add(
    `IFCSITE('${guid('site')}',$,${stepString(model.siteName)},$,$,#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  out.add(
    `IFCRELAGGREGATES('${guid('project-site')}',$,$,$,#${project},(#${site}))`,
  );

  const style = (color: readonly number[]): number => {
    const key = color.map((value) => Math.round(value * 1000)).join(',');
    const known = styles.get(key);
    if (known !== undefined) return known;
    const [r = 0, g = 0, b = 0, a = 1] = color;
    const rgb = out.add(
      `IFCCOLOURRGB($,${stepReal(r)},${stepReal(g)},${stepReal(b)})`,
    );
    const rendering = out.add(
      `IFCSURFACESTYLERENDERING(#${rgb},${stepReal(1 - a)},$,$,$,$,$,$,.NOTDEFINED.)`,
    );
    const id = out.add(`IFCSURFACESTYLE($,.BOTH.,(#${rendering}))`);
    styles.set(key, id);
    return id;
  };

  const writeGeometry = (element: IfcElement): string => {
    const faceSets: number[] = [];
    for (const mesh of element.meshes) {
      if (mesh.positions.length < 9 || mesh.indices.length < 3) continue;
      const points = out.add(
        `IFCCARTESIANPOINTLIST3D((${pointList(mesh, scale)}))`,
      );
      const faceSet = out.add(
        `IFCTRIANGULATEDFACESET(#${points},$,$,(${faceList(mesh)}),$)`,
      );
      if (mesh.color) {
        out.add(`IFCSTYLEDITEM(#${faceSet},(#${style(mesh.color)}),$)`);
      }
      faceSets.push(faceSet);
    }
    if (faceSets.length === 0) return '$';
    const shape = out.add(
      `IFCSHAPEREPRESENTATION(#${body},'Body','Tessellation',(${faceSets.map((id) => `#${id}`).join(',')}))`,
    );
    return `#${out.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}))`)}`;
  };

  const writePsets = (element: IfcElement, elementId: number): void => {
    for (const pset of element.psets) {
      if (pset.props.length === 0) continue;
      const props = pset.props.map(
        ({ name, value }) =>
          `#${out.add(`IFCPROPERTYSINGLEVALUE(${stepString(name)},$,${nominal(value)},$)`)}`,
      );
      const setId = out.add(
        `IFCPROPERTYSET('${guid(`pset:${out.nextId}`)}',$,${stepString(pset.name)},$,(${props.join(',')}))`,
      );
      out.add(
        `IFCRELDEFINESBYPROPERTIES('${guid(`rel:${out.nextId}`)}',$,$,$,(#${elementId}),#${setId})`,
      );
    }
  };

  const buildingIds: number[] = [];
  for (const building of model.buildings) {
    const placement = out.add(`IFCLOCALPLACEMENT(#${sitePlacement},#${axis})`);
    const buildingId = out.add(
      `IFCBUILDING('${building.guid}',$,${stepString(building.name)},$,$,#${placement},$,$,.ELEMENT.,$,$,$)`,
    );
    buildingIds.push(buildingId);
    const storeyIds: number[] = [];
    const typed = new Map<
      string,
      { cls: string; name: string; ids: number[] }
    >();

    for (const storey of building.storeys) {
      const storeyPlacement = out.add(
        `IFCLOCALPLACEMENT(#${placement},#${axis})`,
      );
      const storeyId = out.add(
        `IFCBUILDINGSTOREY('${guid(`storey:${building.guid}:${storey.name}:${out.nextId}`)}',$,${stepString(storey.name)},$,$,#${storeyPlacement},$,$,.ELEMENT.,$)`,
      );
      storeyIds.push(storeyId);
      const contained: number[] = [];
      for (const element of storey.elements) {
        const cls = CLASS_SPECS[element.ifcClass]
          ? element.ifcClass
          : PROXY_CLASS;
        const spec = CLASS_SPECS[cls] ?? CLASS_SPECS[PROXY_CLASS];
        const shape = writeGeometry(element);
        const elementPlacement = out.add(
          `IFCLOCALPLACEMENT(#${storeyPlacement},#${axis})`,
        );
        const elementId = out.add(
          `${cls.toUpperCase()}('${element.guid}',$,${stepString(element.name)},$,${element.objectType ? stepString(element.objectType) : '$'},#${elementPlacement},${shape},$,${spec?.elementTail ?? '$'})`,
        );
        writePsets(element, elementId);
        contained.push(elementId);
        if (element.typeName) {
          const key = `${cls}|${element.typeName}`;
          const group = typed.get(key) ?? {
            cls,
            name: element.typeName,
            ids: [],
          };
          group.ids.push(elementId);
          typed.set(key, group);
        }
        if (out.pending >= CHUNK_LINES) yield out.take();
      }
      if (contained.length > 0) {
        out.add(
          `IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(`contain:${out.nextId}`)}',$,$,$,(${contained.map((id) => `#${id}`).join(',')}),#${storeyId})`,
        );
      }
    }

    if (storeyIds.length > 0) {
      out.add(
        `IFCRELAGGREGATES('${guid(`building-storeys:${building.guid}`)}',$,$,$,#${buildingId},(${storeyIds.map((id) => `#${id}`).join(',')}))`,
      );
    }

    for (const group of typed.values()) {
      const spec = CLASS_SPECS[group.cls] ?? CLASS_SPECS[PROXY_CLASS];
      const typeId = out.add(
        `${group.cls.toUpperCase()}TYPE('${guid(`type:${building.guid}:${group.cls}:${group.name}`)}',$,${stepString(group.name)},$,$,$,$,$,$,${spec?.typeTail ?? '.NOTDEFINED.'})`,
      );
      out.add(
        `IFCRELDEFINESBYTYPE('${guid(`bytype:${out.nextId}`)}',$,$,$,(${group.ids.map((id) => `#${id}`).join(',')}),#${typeId})`,
      );
    }
    yield out.take();
  }

  if (buildingIds.length > 0) {
    out.add(
      `IFCRELAGGREGATES('${guid('site-buildings')}',$,$,$,#${site},(${buildingIds.map((id) => `#${id}`).join(',')}))`,
    );
  }
  yield `${out.take()}ENDSEC;\nEND-ISO-10303-21;\n`;
}
