import { useContext, useEffect } from 'react';
import { withViewParam } from '../api/viewLink.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { saveBlob } from '../extensions/excelExport.js';
import { type LayoutApi, LayoutContext } from '../layout/layoutContext.js';
import {
  LINK_DEGRADED_TEXT,
  LINK_RESTORED_TEXT,
  restoreLinkView,
  sharedView,
} from './shareLink.js';
import {
  type Caption,
  type Size,
  SNAPSHOT,
  SnapshotError,
  snapshotSize,
  takeSnapshot,
} from './snapshot.js';
import type { ViewerAdapter } from './ViewerAdapter.js';
import {
  goToViewpoint,
  nextViewpointName,
  saveViewpoint,
  useViewpoints,
  VIEWPOINT_MESSAGES,
} from './viewpoints.js';

export const COPIED_LINK_TEXT = 'Link copied';
export const COPY_FAILED_TEXT = 'Could not copy the link';

export const COPIED_IMAGE_TEXT = 'Image copied';
export const SAVED_IMAGE_TEXT = 'Image saved';
export const SAVED_VIEWPOINT_TEXT = 'Viewpoint saved';
export const MAX_LISTED_VIEWPOINTS = 10;
export const IMAGE_FAILED_TEXT = 'Could not take the snapshot';
export const FRAME_UNKNOWN_TEXT =
  'Could not read the size of the viewer. Choose 1x in Settings or try again.';

export function snapshotName(exportName?: string): string {
  const base = (exportName ?? '').replace(/(-properties)?\.xlsx$/, '');
  return `${base && base !== 'model' ? base : 'model'}-snapshot.png`;
}

export interface ShareMenuProps {
  fileName?: string;
  adapter: ViewerAdapter;
  modelIds: readonly string[];
  baseHref?: string;
  combined: boolean;
  frameSize?: () => Size | null;
  caption?: Caption;
  onManageViewpoints?: () => void;
  onPresent?: () => void;
  onResult: (text: string, error: boolean) => void;
}

export interface ShareHref {
  href: string;
  degraded: boolean;
}

export function shareHref(
  adapter: ViewerAdapter,
  modelIds: readonly string[],
  baseHref: string,
  withView: boolean,
  layout: Pick<LayoutApi, 'openPanes' | 'isCollapsed'> | null = null,
): ShareHref {
  const shared = withView ? sharedView(adapter, modelIds, layout) : null;
  if (!shared) {
    return { href: withViewParam(baseHref, null), degraded: false };
  }
  return {
    href: withViewParam(baseHref, shared.view),
    degraded: shared.degraded,
  };
}

export function ShareMenu({
  adapter,
  modelIds,
  baseHref,
  combined,
  onResult,
  fileName,
  frameSize,
  caption = { name: 'Model' },
  onManageViewpoints,
  onPresent,
}: ShareMenuProps) {
  const viewpoints = useViewpoints();
  const layout = useContext(LayoutContext);
  useEffect(() => {
    const restored = restoreLinkView(
      window.location.search,
      modelIds,
      layout ?? null,
    );
    if (restored && (restored.panes || restored.charts > 0)) {
      onResult(LINK_RESTORED_TEXT, false);
    }
  }, [layout, modelIds, onResult]);
  const takeImage = async (): Promise<Blob> => {
    const frame = frameSize?.() ?? null;
    const settings = SNAPSHOT.read();
    if (settings.resolution !== '1x') {
      if (!frame || frame.width <= 0 || frame.height <= 0) {
        throw new SnapshotError(FRAME_UNKNOWN_TEXT);
      }
      snapshotSize(frame, settings);
    }
    return takeSnapshot({ adapter, frame, settings, caption });
  };
  const snapshot = async (mode: 'copy' | 'save') => {
    try {
      const image = await takeImage();
      if (mode === 'copy') {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': image }),
        ]);
        onResult(COPIED_IMAGE_TEXT, false);
      } else {
        saveBlob(image, snapshotName(fileName));
        onResult(SAVED_IMAGE_TEXT, false);
      }
    } catch (err) {
      onResult(
        err instanceof SnapshotError ? err.message : IMAGE_FAILED_TEXT,
        true,
      );
    }
  };
  const copy = async (withView: boolean) => {
    const { href, degraded } = shareHref(
      adapter,
      modelIds,
      baseHref ?? window.location.href,
      withView,
      layout ?? null,
    );
    try {
      await navigator.clipboard.writeText(href);
      onResult(degraded ? LINK_DEGRADED_TEXT : COPIED_LINK_TEXT, false);
    } catch {
      onResult(COPY_FAILED_TEXT, true);
    }
  };
  const saveView = () => {
    const result = saveViewpoint(nextViewpointName(), adapter.getState());
    if (result === 'ok') onResult(SAVED_VIEWPOINT_TEXT, false);
    else onResult(VIEWPOINT_MESSAGES[result], true);
  };
  const goTo = async (id: string) => {
    const outcome = await goToViewpoint(adapter, id);
    onResult(outcome.text, outcome.result !== 'ok');
  };
  const items = (): MenuEntry[] => {
    return [
      {
        id: 'copy-view',
        label: 'Copy link to this view',
        onSelect: () => void copy(true),
      },
      {
        id: 'copy-models',
        label: combined
          ? 'Copy link to these models'
          : 'Copy link to this model',
        onSelect: () => void copy(false),
      },
      { kind: 'separator', id: 'image-separator' },
      {
        id: 'copy-image',
        label: 'Copy image',
        onSelect: () => void snapshot('copy'),
      },
      {
        id: 'save-image',
        label: 'Save image (PNG)',
        onSelect: () => void snapshot('save'),
      },
      { kind: 'separator', id: 'viewpoint-separator' },
      { id: 'save-viewpoint', label: 'Save viewpoint', onSelect: saveView },
      ...viewpoints.slice(0, MAX_LISTED_VIEWPOINTS).map((point) => ({
        id: `go-${point.id}`,
        label: `Go to ${point.name}`,
        onSelect: () => void goTo(point.id),
      })),
      ...(onManageViewpoints
        ? [
            {
              id: 'manage-viewpoints',
              label: 'Manage viewpoints...',
              onSelect: onManageViewpoints,
            },
          ]
        : []),
      ...(onPresent
        ? [
            { kind: 'separator' as const, id: 'present-separator' },
            { id: 'present', label: 'Present', onSelect: onPresent },
          ]
        : []),
    ];
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
