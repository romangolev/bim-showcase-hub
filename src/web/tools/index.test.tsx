import { beforeEach, describe, expect, it } from 'vitest';
import { BSH_KEYS, forgetPersonal } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { buildToolGroup } from '../test/toolGroup.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { DISPLAY_SETTINGS_KEY } from './display/displaySettings.js';
import { EXCEL_SETTINGS_KEY } from './excel/excelSettings.js';
import { GLB_SETTINGS_KEY } from './glb/GlbExportTool.js';
import { IFC_SETTINGS_KEY } from './ifc/ifcSettings.js';
import { TOOLS } from './index.js';
import { exportFileName } from './kernel/exportKit.js';
import { modelKey } from './kernel/modelKey.js';
import { PAINT_SETTINGS_KEY } from './paint/paintSettings.js';
import { TOOLBAR_SETTINGS_KEY } from './toolbar/ToolbarProfileTool.js';

const APP = BSH_KEYS.preference.settings;
const adapter = {} as ViewerAdapter;

beforeEach(() => {
  installMemoryStorage();
});

describe('the default tool registry', () => {
  it('registers paint, excel, glb, ifc, toolbar and display in toolbar order with own keys', () => {
    expect(TOOLS.all().map((tool) => tool.id)).toEqual([
      'paint',
      'excel',
      'glb',
      'ifc',
      'toolbar',
      'display',
    ]);
    expect(TOOLS.all().map((tool) => tool.settings.key)).toEqual([
      PAINT_SETTINGS_KEY,
      EXCEL_SETTINGS_KEY,
      GLB_SETTINGS_KEY,
      IFC_SETTINGS_KEY,
      TOOLBAR_SETTINGS_KEY,
      DISPLAY_SETTINGS_KEY,
    ]);
  });

  it('keeps tool settings out of the app settings key and the personal keys', () => {
    const personal = Object.values(BSH_KEYS.personal) as string[];
    for (const tool of TOOLS.all()) {
      expect(tool.settings.key).not.toBe(APP);
      expect(personal).not.toContain(tool.settings.key);
    }
  });

  it('gives every tool a settings window with a unique id', () => {
    const ids = TOOLS.modals().map((modal) => modal.id);
    expect(new Set(ids).size).toBe(8);
    expect(TOOLS.modals().map((modal) => modal.title)).toEqual([
      'Paint brushes settings',
      'Excel export settings',
      'Geometry export settings',
      'IFC export settings',
      'IFC export',
      'Batch IFC export',
      'Toolbar profile settings',
      'Viewer display settings',
    ]);
  });
});

describe('the toolbar group', () => {
  it('derives a short stable key from the urn', () => {
    expect(modelKey('urn-a')).toBe(modelKey('urn-a'));
    expect(modelKey('urn-a')).not.toBe(modelKey('urn-b'));
    expect(modelKey('urn-a')).toMatch(/^[0-9a-z]{1,7}$/);
  });

  it('keeps the plain ids without a key', () => {
    const spec = buildToolGroup(adapter);
    expect(spec.id).toBe('bim-showcase-hub-tools');
    expect(spec.paint?.id).toBe('paint');
    expect(spec.paint?.reset.id).toBe('paint-reset');
    expect(spec.exports.map((entry) => entry.id)).toEqual([
      'export-xlsx',
      'export-glb',
      'export-ifc',
    ]);
  });

  it('gives two viewers disjoint control ids and keeps the icons', () => {
    const ids = (suffix: string) => {
      const spec = buildToolGroup(adapter, { suffix });
      return [
        spec.id,
        spec.paint?.id,
        spec.paint?.reset.id,
        ...spec.exports.map((entry) => entry.id),
        ...(spec.paint?.swatches.map((swatch) => swatch.id) ?? []),
      ];
    };
    const a = ids(modelKey('urn-a'));
    const b = ids(modelKey('urn-b'));
    expect(a.filter((id) => b.includes(id))).toEqual([]);
    expect(a[0]).toMatch(/^bim-showcase-hub-tools-/);
    expect(
      buildToolGroup(adapter, { suffix: 'a' }).exports.map(
        (entry) => entry.icon,
      ),
    ).toEqual(['bsh-ico-export', 'bsh-ico-glb', 'bsh-ico-ifc']);
  });

  it.each([
    ['paint', true, []],
    ['excel', false, ['export-xlsx']],
    ['glb', false, ['export-glb']],
    ['ifc', false, ['export-ifc']],
  ])(
    'builds only the %s tool when the others are off',
    (id, paint, exports) => {
      const spec = buildToolGroup(adapter, { only: [id] });
      expect(Boolean(spec.paint)).toBe(paint);
      expect(spec.exports.map((entry) => entry.id)).toEqual(exports);
    },
  );

  it('builds nothing when every tool is off', () => {
    expect(() => buildToolGroup(adapter, { only: [] })).toThrow();
    expect(
      TOOLS.buildGroup(
        {
          adapter,
          id: (base) => base,
          fileName: () => '',
          current: (tool) => tool.settings.initial,
        },
        Object.fromEntries(
          TOOLS.all().map((tool) => [tool.id, { enabled: false }]),
        ),
      ),
    ).toBeNull();
  });
});

describe('exportFileName', () => {
  it('drops the format extension and properties suffix', () => {
    expect(exportFileName('Tower-properties.xlsx', 'fb', '-x', 'glb')).toBe(
      'Tower-x.glb',
    );
    expect(exportFileName('', 'fb', '-x', 'glb')).toBe('fb');
    expect(exportFileName(undefined, 'fb', '', 'ifc')).toBe('fb');
  });
});

describe('sign-out and the old combined settings', () => {
  it('drops personal IFC fields left in the app blob', () => {
    window.localStorage.setItem(
      APP,
      JSON.stringify({ recentsLength: 4, ifc: { author: 'Ada' } }),
    );
    forgetPersonal();
    expect(window.localStorage.getItem(APP)).toBe('{"recentsLength":4}');
  });
});
