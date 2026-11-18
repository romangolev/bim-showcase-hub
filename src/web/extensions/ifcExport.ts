import { buildIfc } from '../ifc/buildIfc.js';
import { mapToIfc } from '../ifc/mapToIfc.js';
import { DEFAULT_IFC_SETTINGS } from '../ifc/settings.js';
import type { IfcSettings } from '../ifc/types.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { saveBlob } from './excelExport.js';
import {
  formatCount,
  missingModels,
  tick,
  tooLargeReason,
} from './exportCommon.js';

export const DEFAULT_IFC_FILE_NAME = 'model.ifc';
export const MAX_IFC_BYTES = 512 * 1024 * 1024;

export type IfcExportStatus =
  | { phase: 'reading' }
  | { phase: 'building' }
  | {
      phase: 'done';
      fileName: string;
      elementCount: number;
      triangleCount: number;
      byteLength: number;
      missing?: string[];
      skipped?: number;
      levelsUnavailable?: number;
      generatedIds?: number;
    }
  | { phase: 'empty' }
  | { phase: 'error'; message: string };

export interface IfcExportOptions {
  fileName?: string;
  settings?: () => IfcSettings;
  onStatus?: (status: IfcExportStatus) => void;
  save?: (blob: Blob, fileName: string) => void;
  now?: Date;
  maxBytes?: number;
}

export function describeIfcStatus(status: IfcExportStatus): string {
  switch (status.phase) {
    case 'reading':
      return 'Reading model';
    case 'building':
      return 'Building IFC';
    case 'done': {
      const base = `Exported ${formatCount(status.elementCount)} elements, ${formatCount(status.triangleCount)} triangles`;
      const notes: string[] = [];
      if (status.missing?.length) {
        notes.push(`missing ${status.missing.join(', ')}`);
      }
      if (status.skipped) {
        notes.push(`${formatCount(status.skipped)} fragments skipped`);
      }
      if (status.levelsUnavailable) notes.push('levels unavailable');
      if (status.generatedIds) {
        notes.push(`${formatCount(status.generatedIds)} ids generated`);
      }
      return notes.length ? `${base}, ${notes.join(', ')}` : base;
    }
    case 'empty':
      return 'No elements to export';
    case 'error':
      return status.message;
  }
}

export async function exportToIfc(
  adapter: ViewerAdapter,
  options: IfcExportOptions = {},
): Promise<IfcExportStatus> {
  const {
    fileName = DEFAULT_IFC_FILE_NAME,
    settings = () => DEFAULT_IFC_SETTINGS,
    onStatus,
    save = saveBlob,
    now,
    maxBytes = MAX_IFC_BYTES,
  } = options;
  const emit = (status: IfcExportStatus): IfcExportStatus => {
    onStatus?.(status);
    return status;
  };
  try {
    emit({ phase: 'reading' });
    const read = await adapter.getIfcSource();
    const sourceCount = read.models.reduce(
      (sum, model) => sum + model.elements.length,
      0,
    );
    if (sourceCount === 0) return emit({ phase: 'empty' });
    emit({ phase: 'building' });
    await tick();
    const defaultName = fileName.replace(/\.ifc$/i, '') || 'Model';
    const model = mapToIfc(read, settings(), { defaultName, now });
    let triangleCount = 0;
    let elementCount = 0;
    for (const building of model.buildings) {
      for (const storey of building.storeys) {
        elementCount += storey.elements.length;
        for (const element of storey.elements) {
          for (const mesh of element.meshes) {
            triangleCount += Math.floor(mesh.indices.length / 3);
          }
        }
      }
    }
    if (elementCount === 0) return emit({ phase: 'empty' });
    const parts: Blob[] = [];
    let size = 0;
    for (const chunk of buildIfc(model)) {
      const part = new Blob([chunk]);
      size += part.size;
      if (size > maxBytes) {
        return emit({
          phase: 'error',
          message: `Export failed: ${tooLargeReason(maxBytes)}`,
        });
      }
      parts.push(part);
      await tick();
    }
    const blob = new Blob(parts, { type: 'application/x-step' });
    save(blob, fileName);
    const missing = missingModels(adapter);
    const skipped = read.skipped;
    return emit({
      phase: 'done',
      fileName,
      elementCount,
      triangleCount,
      byteLength: blob.size,
      ...(missing.length ? { missing } : {}),
      ...(skipped ? { skipped } : {}),
      ...(read.levelsUnavailable
        ? { levelsUnavailable: read.levelsUnavailable }
        : {}),
      ...(read.generatedIds ? { generatedIds: read.generatedIds } : {}),
    });
  } catch (err) {
    return emit({
      phase: 'error',
      message:
        err instanceof Error && err.message
          ? `Export failed: ${err.message}`
          : 'Export failed',
    });
  }
}
