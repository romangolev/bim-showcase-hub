import {
  centerOf,
  type ModelBox,
  type ModelInfo,
  type ModelSet,
  type ModelSpread,
  spreadOf,
  togetherOffsets,
  type Vec3,
} from './modelSet.js';

export interface PlacementPort<H> {
  boxOf(info: ModelInfo, handle: H): ModelBox | undefined;
  anchorId(): string | undefined;
  unitMeters(): number;
  apply(info: ModelInfo, handle: H, offset: Vec3 | undefined): void;
}

export interface PlacementInfo {
  modelId: string;
  anchor: boolean;
  unit: string | null;
  sharedCoordinates: boolean | null;
  distanceMeters: number | null;
}

export class Placement<H> {
  private offsets: Record<string, Vec3> | null = null;

  constructor(
    private readonly models: ModelSet<H>,
    private readonly port: PlacementPort<H>,
  ) {}

  get together(): boolean {
    return this.offsets !== null;
  }

  offsetOf(modelId: string): Vec3 | undefined {
    return this.offsets?.[modelId];
  }

  set(offsets: Readonly<Record<string, Vec3>> | null): void {
    this.offsets =
      offsets && Object.keys(offsets).length > 0 ? { ...offsets } : null;
    for (const { info, handle } of this.models.ready()) {
      this.port.apply(info, handle, this.offsets?.[info.id]);
    }
  }

  reset(): void {
    this.offsets = null;
  }

  spread(): ModelSpread | null {
    return spreadOf(this.boxes(), this.port.unitMeters());
  }

  togetherOffsets(): Record<string, Vec3> {
    const boxes = this.boxes();
    const wanted = this.port.anchorId();
    const anchor = boxes.find((box) => box.id === wanted)?.id ?? boxes[0]?.id;
    return anchor ? togetherOffsets(boxes, anchor) : {};
  }

  info(
    unitOf: (modelId: string) => string | null,
    sharedOf: (modelId: string) => boolean | null,
  ): PlacementInfo[] {
    const boxes = this.boxes();
    const wanted = this.port.anchorId();
    const anchorId = boxes.find((box) => box.id === wanted)?.id ?? boxes[0]?.id;
    const anchor = boxes.find((box) => box.id === anchorId);
    const target = anchor ? this.placedCenter(anchor) : null;
    const unitMeters = this.port.unitMeters();
    return boxes.map((box) => {
      const center = this.placedCenter(box);
      return {
        modelId: box.id,
        anchor: box.id === anchorId,
        unit: unitOf(box.id),
        sharedCoordinates: sharedOf(box.id),
        distanceMeters: target
          ? Math.hypot(
              center[0] - target[0],
              center[1] - target[1],
              center[2] - target[2],
            ) * unitMeters
          : null,
      };
    });
  }

  private placedCenter(box: ModelBox): Vec3 {
    const center = centerOf(box);
    const offset = this.offsets?.[box.id];
    if (!offset) return center;
    return [
      center[0] + offset[0],
      center[1] + offset[1],
      center[2] + offset[2],
    ];
  }

  private boxes(): ModelBox[] {
    const boxes: ModelBox[] = [];
    for (const { info, handle } of this.models.ready()) {
      const box = this.port.boxOf(info, handle);
      if (box) boxes.push(box);
    }
    return boxes;
  }
}
