import { useContext, useEffect, useRef, useState } from 'react';
import { type ViewLink, viewFileJson, withViewParam } from '../api/viewLink.js';
import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { writeClipboard } from '../extensions/clipboard.js';
import { saveBlob } from '../extensions/download.js';
import { type LayoutApi, LayoutContext } from '../layout/layoutContext.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { usePersisted } from '../storage.js';
import { useSavedKindItems } from '../store/savedKinds.js';
import { Button } from '../ui/Button.js';
import { Checkbox } from '../ui/Checkbox.js';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog.js';
import { FieldLabel } from '../ui/Field.js';
import { Input } from '../ui/Input.js';
import { Select, SelectOption } from '../ui/Select.js';
import { Textarea } from '../ui/Textarea.js';
import {
  blobToDataUrl,
  collectReport,
  openReportWindow,
  printReport,
  REPORT_DEFAULTS,
  REPORT_NOTES_MAX,
  REPORT_SECTIONS,
  REPORT_TITLE_MAX,
  type ReportOptions,
  type ReportSections,
  reportHtml,
  sanitizeReportOptions,
} from './report.js';
import { REPORT_TEMPLATES } from './reportTemplates.js';
import { SHARE_INCLUDE } from './shareInclude.js';
import {
  LINK_DEGRADED_TEXT,
  LINK_TRIMMED_TEXT,
  SHARE_INCLUDE_ALL,
  type ShareInclude,
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
export const SHARE_ACCESS_HINT =
  'The link opens only for people who already have Autodesk access to these files.';

export const COPIED_IMAGE_TEXT = 'Image copied';
export const SAVED_IMAGE_TEXT = 'Image saved';
export const SAVED_VIEWPOINT_TEXT = 'Viewpoint saved';
export const MAX_LISTED_VIEWPOINTS = 10;
export const IMAGE_FAILED_TEXT = 'Could not take the snapshot';
export const REPORT_READY_TEXT = 'Report opened for printing';
export const REPORT_BLOCKED_TEXT = 'Allow pop-ups to print the report';
const REPORT_FAILED_TEXT = 'Could not build the report';
const SAVED_VIEW_FILE_TEXT = 'View data saved';
const FRAME_UNKNOWN_TEXT =
  'Could not read the size of the viewer. Choose 1x in Settings or try again.';

const REPORT_SECTION_LABELS: readonly [keyof ReportSections, string][] = [
  ['snapshot', 'Snapshot'],
  ['summary', 'Summary'],
  ['dashboard', 'Dashboard'],
];

export function snapshotName(exportName?: string): string {
  const base = (exportName ?? '').replace(/(-properties)?\.xlsx$/, '');
  return `${base && base !== 'model' ? base : 'model'}-snapshot.png`;
}

function viewFileName(exportName?: string): string {
  const base = (exportName ?? '').replace(/(-properties)?\.xlsx$/, '');
  return `${base && base !== 'model' ? base : 'model'}-view.json`;
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

interface ShareHref {
  href: string;
  degraded: boolean;
  trimmed: boolean;
}

interface ReportDialogProps {
  initial: ReportOptions;
  onPrint: (options: ReportOptions) => void;
  onClose: () => void;
}

function ReportDialog({ initial, onPrint, onClose }: ReportDialogProps) {
  const [options, setOptions] = useState(initial);
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const templates = useSavedKindItems(REPORT_TEMPLATES);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const patch = (next: Partial<ReportOptions>) =>
    setOptions((current) => ({ ...current, ...next }));
  const patchSection = (key: keyof ReportSections, value: boolean) =>
    setOptions((current) => ({
      ...current,
      sections: { ...current.sections, [key]: value },
    }));
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const item = templates.find((entry) => entry.id === id);
    if (!item) return;
    const clean = sanitizeReportOptions(item.data) ?? item.data;
    setOptions({ ...clean, title: options.title || clean.title });
  };
  const saveTemplate = () => {
    const saved = REPORT_TEMPLATES.save(templateName.trim(), options);
    if (!saved) return;
    setTemplateId(saved.id);
    setTemplateName('');
  };
  return (
    <Dialog size="sm" aria-label="Report options" onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Print report</DialogTitle>
        <DialogClose>
          <Icon name="close" size={16} />
        </DialogClose>
      </DialogHeader>
      <DialogBody className="settings">
        <div className="settings__section">
          <h3 className="settings__heading">Template</h3>
          <FieldLabel layout="row">
            <span>Template</span>
            <Select
              value={templateId}
              aria-label="Template"
              onValueChange={(next) => applyTemplate(next)}
            >
              <SelectOption value="">None</SelectOption>
              {templates.map((item) => (
                <SelectOption key={item.id} value={item.id}>
                  {item.name}
                </SelectOption>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel layout="row">
            <span>Template name</span>
            <Input
              type="text"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
          </FieldLabel>
          <div className="settings__actions">
            <Button
              disabled={templateName.trim() === ''}
              onClick={saveTemplate}
            >
              Save template
            </Button>
          </div>
        </div>
        <FieldLabel layout="row">
          <span>Title</span>
          <Input
            ref={titleRef}
            type="text"
            value={options.title}
            maxLength={REPORT_TITLE_MAX}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </FieldLabel>
        <FieldLabel layout="row">
          <span>Notes</span>
          <Textarea
            rows={3}
            value={options.notes}
            maxLength={REPORT_NOTES_MAX}
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </FieldLabel>
        <div className="settings__section">
          <h3 className="settings__heading">Sections</h3>
          {REPORT_SECTION_LABELS.map(([key, label]) => (
            <FieldLabel layout="row" key={key}>
              <span>{label}</span>
              <Checkbox
                checked={options.sections[key]}
                aria-label={label}
                onChange={(event) => patchSection(key, event.target.checked)}
              />
            </FieldLabel>
          ))}
        </div>
        <FieldLabel layout="row">
          <span>Orientation</span>
          <Select
            value={options.orientation}
            aria-label="Orientation"
            onValueChange={(next) =>
              patch({
                orientation: next === 'landscape' ? 'landscape' : 'portrait',
              })
            }
          >
            <SelectOption value="portrait">Portrait</SelectOption>
            <SelectOption value="landscape">Landscape</SelectOption>
          </Select>
        </FieldLabel>
        <div className="settings__actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => onPrint(options)}>Print</Button>
        </div>
      </DialogBody>
    </Dialog>
  );
}

export function shareHref(
  adapter: ViewerAdapter,
  modelIds: readonly string[],
  baseHref: string,
  withView: boolean,
  layout: Pick<LayoutApi, 'openPanes' | 'isCollapsed'> | null = null,
  include: ShareInclude = SHARE_INCLUDE_ALL,
): ShareHref {
  const shared = withView
    ? sharedView(adapter, modelIds, layout, include)
    : null;
  if (!shared) {
    return {
      href: withViewParam(baseHref, null),
      degraded: false,
      trimmed: false,
    };
  }
  return {
    href: withViewParam(baseHref, shared.view),
    degraded: shared.degraded,
    trimmed: shared.trimmed,
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
  const [include, setInclude] = usePersisted(SHARE_INCLUDE);
  const [report, setReport] = useState<ReportOptions | null>(null);
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
  const printModelReport = async (options: ReportOptions) => {
    const win = openReportWindow();
    if (!win) {
      onResult(REPORT_BLOCKED_TEXT, true);
      return;
    }
    setReport(null);
    try {
      const image = options.sections.snapshot
        ? await blobToDataUrl(await takeImage())
        : null;
      const dashboard = PANE_SETTINGS.dashboard.view.read();
      const content = await collectReport(adapter, {
        title: options.title.trim() || caption.name,
        ...(caption.version ? { version: caption.version } : {}),
        ...(image ? { image } : {}),
        names: PANE_SETTINGS.summary.properties.read(),
        chartProperties: dashboard.properties,
        maxCategories: dashboard.maxCategories,
        view: PANE_SETTINGS.summary.view.read(),
        sections: options.sections,
        ...(options.notes.trim() ? { notes: options.notes.trim() } : {}),
        orientation: options.orientation,
      });
      printReport(reportHtml(content), () => win);
      onResult(REPORT_READY_TEXT, false);
    } catch (err) {
      win.close();
      onResult(
        err instanceof SnapshotError ? err.message : REPORT_FAILED_TEXT,
        true,
      );
    }
  };
  const openReportOptions = () => {
    setReport({
      ...REPORT_DEFAULTS,
      title: caption.name,
      sections: { ...REPORT_SECTIONS },
    });
  };
  const saveViewFile = (link: ViewLink) => {
    const text = viewFileJson(link, modelIds);
    saveBlob(
      new Blob([text], { type: 'application/json' }),
      viewFileName(fileName),
    );
    onResult(SAVED_VIEW_FILE_TEXT, false);
  };
  const copy = async (withView: boolean) => {
    const { href, degraded, trimmed } = shareHref(
      adapter,
      modelIds,
      baseHref ?? window.location.href,
      withView,
      layout ?? null,
      include,
    );
    if (await writeClipboard(href)) {
      onResult(
        degraded
          ? LINK_DEGRADED_TEXT
          : trimmed
            ? LINK_TRIMMED_TEXT
            : COPIED_LINK_TEXT,
        false,
      );
    } else {
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
    const shared = sharedView(adapter, modelIds, layout ?? null, include);
    return [
      {
        id: 'copy-view',
        label: 'Copy link to this view',
        onSelect: () => void copy(true),
      },
      ...(shared?.degraded
        ? [
            {
              id: 'save-view-json',
              label: 'Save view data (JSON)',
              onSelect: () => saveViewFile(shared.link),
            },
          ]
        : []),
      {
        id: 'copy-models',
        label: combined
          ? 'Copy link to these models'
          : 'Copy link to this model',
        onSelect: () => void copy(false),
      },
      { kind: 'separator', id: 'include-separator' },
      ...(
        [
          ['selection', 'Include selection'],
          ['panes', 'Include panes and charts'],
          ['nodes', 'Include hidden and isolated'],
        ] as const
      ).map(([key, label]) => ({
        id: `include-${key}`,
        label,
        checked: include[key],
        onSelect: () => setInclude({ ...include, [key]: !include[key] }),
      })),
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
      {
        id: 'print-report',
        label: 'Print report...',
        onSelect: openReportOptions,
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
        title="Share a link, an image or a print report"
        hint={SHARE_ACCESS_HINT}
        triggerClassName="bsh-viewer-models__trigger"
        trigger={<span>Share</span>}
        items={items}
      />
      {report ? (
        <ReportDialog
          initial={report}
          onPrint={(options) => void printModelReport(options)}
          onClose={() => setReport(null)}
        />
      ) : null}
    </div>
  );
}
