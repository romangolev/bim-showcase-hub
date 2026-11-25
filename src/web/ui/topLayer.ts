export function topLayerContainer(origin: Element | null): HTMLElement {
  if (!origin) return document.body;
  let host: Element | null = null;
  try {
    host = origin.closest('dialog, :fullscreen');
  } catch {
    host = origin.closest('dialog');
  }
  return host instanceof HTMLElement ? host : document.body;
}
