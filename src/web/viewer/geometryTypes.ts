export interface GeometryPart {
  name: string;
  dbId?: number;
  model?: string;
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
  color?: readonly [number, number, number, number];
}

export interface GeometryRead {
  parts: GeometryPart[];
  skipped: number;
}
