import type { PropertyRow } from '../../shared/types.js';

export type MockCategory = 'Walls' | 'Doors' | 'Windows' | 'Slabs' | 'Columns';

export type Point = readonly [number, number];

export interface MockElement {
  dbId: number;
  name: string;
  category: MockCategory;
  level: string;
  assemblyCode: string;
  classificationCode: string;
  points: Point[];
  depth: number;
}

const BAYS_X = 8;
const BAYS_Y = 6;
const BAY = 4;
const LEVELS = 3;
const STOREY = 3;
const SCALE = 15;
const COS30 = Math.cos(Math.PI / 6);

const CODES: Record<
  MockCategory,
  { assembly: string; classification: string }
> = {
  Walls: { assembly: 'B2010', classification: '21-02 10 00' },
  Doors: { assembly: 'B2030', classification: '23-30 10 00' },
  Windows: { assembly: 'B2020', classification: '23-30 20 00' },
  Slabs: { assembly: 'B1010', classification: '21-01 20 00' },
  Columns: { assembly: 'B1020', classification: '21-01 10 00' },
};

const NAMES: Record<MockCategory, string[]> = {
  Walls: ['Basic Wall: Concrete 200mm', 'Basic Wall: Partition 100mm'],
  Doors: ['Single-Flush: 0915 x 2134mm', 'Double-Flush: 1830 x 2134mm'],
  Windows: ['Fixed: 1220 x 1830mm', 'Casement: 0915 x 1220mm'],
  Slabs: ['Floor: Concrete 250mm', 'Floor: Screed 150mm'],
  Columns: ['Concrete Column: 400 x 400mm'],
};

export function levelName(index: number): string {
  return index === LEVELS ? 'Roof' : `Level ${index + 1}`;
}

export function project(x: number, y: number, z: number): Point {
  return [(x - y) * COS30 * SCALE, (x + y) * 0.5 * SCALE - z * SCALE];
}

function quad(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number],
): Point[] {
  return [project(...a), project(...b), project(...c), project(...d)];
}

function wallPanel(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  z0: number,
  z1: number,
  from = 0,
  to = 1,
): Point[] {
  const ax = x1 + (x2 - x1) * from;
  const ay = y1 + (y2 - y1) * from;
  const bx = x1 + (x2 - x1) * to;
  const by = y1 + (y2 - y1) * to;
  return quad([ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]);
}

interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  perimeter: boolean;
}

function wallSegments(): WallSegment[] {
  const width = BAYS_X * BAY;
  const depth = BAYS_Y * BAY;
  const segments: WallSegment[] = [];
  for (let i = 0; i < BAYS_X; i++) {
    segments.push({
      x1: i * BAY,
      y1: 0,
      x2: (i + 1) * BAY,
      y2: 0,
      perimeter: true,
    });
    segments.push({
      x1: i * BAY,
      y1: depth,
      x2: (i + 1) * BAY,
      y2: depth,
      perimeter: true,
    });
  }
  for (let j = 0; j < BAYS_Y; j++) {
    segments.push({
      x1: 0,
      y1: j * BAY,
      x2: 0,
      y2: (j + 1) * BAY,
      perimeter: true,
    });
    segments.push({
      x1: width,
      y1: j * BAY,
      x2: width,
      y2: (j + 1) * BAY,
      perimeter: true,
    });
  }
  for (let j = 0; j < BAYS_Y; j++) {
    segments.push({
      x1: width / 2,
      y1: j * BAY,
      x2: width / 2,
      y2: (j + 1) * BAY,
      perimeter: false,
    });
  }
  for (let i = 0; i < BAYS_X; i++) {
    if (i === BAYS_X / 2 - 1 || i === BAYS_X / 2) continue;
    segments.push({
      x1: i * BAY,
      y1: depth / 2,
      x2: (i + 1) * BAY,
      y2: depth / 2,
      perimeter: false,
    });
  }
  return segments;
}

export function buildMockElements(): MockElement[] {
  const elements: MockElement[] = [];
  const counters: Record<MockCategory, number> = {
    Walls: 0,
    Doors: 0,
    Windows: 0,
    Slabs: 0,
    Columns: 0,
  };
  let nextId = 100;

  const add = (
    category: MockCategory,
    level: number,
    points: Point[],
    depth: number,
  ) => {
    const names = NAMES[category];
    const name = names[counters[category] % names.length] ?? category;
    counters[category] += 1;
    const codes = CODES[category];
    elements.push({
      dbId: nextId++,
      name,
      category,
      level: levelName(level),
      assemblyCode: codes.assembly,
      classificationCode: codes.classification,
      points,
      depth,
    });
  };

  const width = BAYS_X * BAY;
  const depth = BAYS_Y * BAY;

  for (let level = 0; level <= LEVELS; level++) {
    const z = level * STOREY;
    for (let i = 0; i < BAYS_X / 2; i++) {
      for (let j = 0; j < BAYS_Y / 2; j++) {
        const x0 = i * BAY * 2;
        const y0 = j * BAY * 2;
        add(
          'Slabs',
          level,
          quad(
            [x0, y0, z],
            [x0 + BAY * 2, y0, z],
            [x0 + BAY * 2, y0 + BAY * 2, z],
            [x0, y0 + BAY * 2, z],
          ),
          x0 + y0 + BAY * 2 - 100,
        );
      }
    }
  }

  const segments = wallSegments();
  for (let level = 0; level < LEVELS; level++) {
    const z0 = level * STOREY;
    const z1 = z0 + STOREY;
    segments.forEach((seg, index) => {
      const cx = (seg.x1 + seg.x2) / 2;
      const cy = (seg.y1 + seg.y2) / 2;
      const key = cx + cy + level * 0.001;
      add(
        'Walls',
        level,
        wallPanel(seg.x1, seg.y1, seg.x2, seg.y2, z0, z1),
        key,
      );
      if (index % 3 === 0) {
        add(
          'Doors',
          level,
          wallPanel(seg.x1, seg.y1, seg.x2, seg.y2, z0, z0 + 2.1, 0.3, 0.7),
          key + 0.0001,
        );
      }
      if (seg.perimeter && index % 2 === 0) {
        add(
          'Windows',
          level,
          wallPanel(
            seg.x1,
            seg.y1,
            seg.x2,
            seg.y2,
            z0 + 0.9,
            z0 + 2.1,
            0.2,
            0.8,
          ),
          key + 0.0002,
        );
      }
    });
    for (const cx of [width / 4, width / 2, (width * 3) / 4]) {
      for (const cy of [depth / 3, (depth * 2) / 3]) {
        add(
          'Columns',
          level,
          quad(
            [cx - 0.2, cy, z0],
            [cx + 0.2, cy, z0],
            [cx + 0.2, cy, z1],
            [cx - 0.2, cy, z1],
          ),
          cx + cy + level * 0.001 + 0.0003,
        );
      }
    }
  }

  return elements.sort((a, b) => a.depth - b.depth);
}

export function elementProperties(
  element: MockElement,
): PropertyRow['properties'] {
  return {
    Category: element.category,
    Name: element.name,
    'Assembly Code': element.assemblyCode,
    'Classification Code': element.classificationCode,
    Level: element.level,
  };
}

export function buildMockRows(propertyNames: string[]): PropertyRow[] {
  return buildMockElements()
    .slice()
    .sort((a, b) => a.dbId - b.dbId)
    .map((element) => {
      const all = elementProperties(element);
      const properties: PropertyRow['properties'] = {};
      for (const name of propertyNames) properties[name] = all[name] ?? null;
      return { dbId: element.dbId, name: element.name, properties };
    });
}
