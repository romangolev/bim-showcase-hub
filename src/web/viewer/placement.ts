import {
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

  private boxes(): ModelBox[] {
    const boxes: ModelBox[] = [];
    for (const { info, handle } of this.models.ready()) {
      const box = this.port.boxOf(info, handle);
      if (box) boxes.push(box);
    }
    return boxes;
  }
}
