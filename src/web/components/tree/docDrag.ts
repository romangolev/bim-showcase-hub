import {
  type ModelContext,
  parseModelContext,
} from '../../api/modelContext.js';

export const MODEL_DRAG_TYPE = 'application/x-bsh-model';

export interface DraggedModel {
  urn: string;
  context: ModelContext;
}

export interface DragSource {
  readonly types: readonly string[];
  getData(format: string): string;
}

export interface DropLike {
  dataTransfer: DragSource | null;
  preventDefault(): void;
}

export function modelDragText(model: DraggedModel): string {
  return JSON.stringify({ urn: model.urn, context: model.context });
}

export function readModelDrag(
  text: string | null | undefined,
): DraggedModel | null {
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { urn, context } = parsed as Record<string, unknown>;
  if (typeof urn !== 'string' || urn === '') return null;
  return { urn, context: parseModelContext(context) };
}

export function hasModelDrag(source: DragSource | null): boolean {
  return Boolean(source?.types.includes(MODEL_DRAG_TYPE));
}

export function startModelDrag(
  event: { dataTransfer: DataTransfer | null },
  model: DraggedModel,
): void {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  transfer.setData(MODEL_DRAG_TYPE, modelDragText(model));
  transfer.effectAllowed = 'copy';
}

export function handleModelDrop(
  event: DropLike,
  open: (model: DraggedModel) => void,
): boolean {
  const transfer = event.dataTransfer;
  if (!transfer || !hasModelDrag(transfer)) return false;
  const model = readModelDrag(transfer.getData(MODEL_DRAG_TYPE));
  if (!model) return false;
  event.preventDefault();
  open(model);
  return true;
}
