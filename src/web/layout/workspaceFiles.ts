import { saveBlob } from '../extensions/download.js';

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(name: string, text: string): boolean {
  try {
    if (typeof URL.createObjectURL !== 'function') return false;
    saveBlob(new Blob([text], { type: 'application/json' }), name);
    return true;
  } catch {
    return false;
  }
}
