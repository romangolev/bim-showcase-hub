import { encodeView, withViewParam } from '../api/viewLink.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const COPIED_LINK_TEXT = 'Link copied';
export const COPY_FAILED_TEXT = 'Could not copy the link';

export interface ShareMenuProps {
  adapter: ViewerAdapter;
  modelIds: readonly string[];
  baseHref?: string;
  combined: boolean;
  onResult: (text: string, error: boolean) => void;
}

export function shareHref(
  adapter: ViewerAdapter,
  modelIds: readonly string[],
  baseHref: string,
  withView: boolean,
): string {
  const camera = withView ? adapter.getCamera?.() : null;
  if (!camera) return withViewParam(baseHref, null);
  return withViewParam(
    baseHref,
    encodeView({ camera, selection: adapter.getModelSelection() }, modelIds),
  );
}

export function ShareMenu({
  adapter,
  modelIds,
  baseHref,
  combined,
  onResult,
}: ShareMenuProps) {
  const copy = async (withView: boolean) => {
    const href = shareHref(
      adapter,
      modelIds,
      baseHref ?? window.location.href,
      withView,
    );
    try {
      await navigator.clipboard.writeText(href);
      onResult(COPIED_LINK_TEXT, false);
    } catch {
      onResult(COPY_FAILED_TEXT, true);
    }
  };
  const items = (): MenuEntry[] => {
    const entries: MenuEntry[] = [];
    if (adapter.getCamera) {
      entries.push({
        id: 'copy-view',
        label: 'Copy link to this view',
        onSelect: () => void copy(true),
      });
    }
    entries.push({
      id: 'copy-models',
      label: combined ? 'Copy link to these models' : 'Copy link to this model',
      onSelect: () => void copy(false),
    });
    return entries;
  };
  return (
    <div className="bsh-viewer-share">
      <Menu
        label="Share"
        title="Copy a link"
        triggerClassName="bsh-viewer-models__trigger"
        trigger={<span>Share</span>}
        items={items}
      />
    </div>
  );
}
