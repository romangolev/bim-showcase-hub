import { saveBlob } from '../extensions/download.js';

export function downloadText(name: string, text: string): boolean {
  try {
    if (typeof URL.createObjectURL !== 'function') return false;
    saveBlob(new Blob([text], { type: 'application/json' }), name);
    return true;
  } catch {
    return false;
  }
}
