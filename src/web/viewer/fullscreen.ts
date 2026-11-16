const CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'];
const ERROR_EVENTS = ['fullscreenerror', 'webkitfullscreenerror'];

interface PrefixedDocument extends Document {
  webkitFullscreenElement?: Element | null;
}

export function fullscreenElementOf(doc: Document): Element | null {
  const prefixed = doc as PrefixedDocument;
  return prefixed.fullscreenElement ?? prefixed.webkitFullscreenElement ?? null;
}

export function watchFullscreen(
  doc: Document,
  onChange: () => void,
  onError: () => void,
): () => void {
  for (const type of CHANGE_EVENTS) doc.addEventListener(type, onChange);
  for (const type of ERROR_EVENTS) doc.addEventListener(type, onError);
  return () => {
    for (const type of CHANGE_EVENTS) doc.removeEventListener(type, onChange);
    for (const type of ERROR_EVENTS) doc.removeEventListener(type, onError);
  };
}
