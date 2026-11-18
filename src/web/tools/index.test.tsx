import { beforeEach, describe, expect, it } from 'vitest';
import { BSH_KEYS, forgetPersonal, readJson, writeJson } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { buildToolGroup } from '../test/toolGroup.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { EXCEL_SETTINGS_KEY } from './excel/excelSettings.js';
import { GLB_SETTINGS_KEY } from './glb/GlbExportTool.js';
import { IFC_SETTINGS_KEY } from './ifc/ifcSettings.js';
import { migrateLegacyToolSettings, TOOLS } from './index.js';
import { exportFileName } from './kernel/exportKit.js';
import { modelKey } from './kernel/modelKey.js';
import { PAINT_SETTINGS_KEY } from './paint/paintSettings.js';

const APP = BSH_KEYS.preference.settings;
const adapter = {} as ViewerAdapter;

beforeEach(() => {
  installMemoryStorage();
});

describe('the default tool registry', () => {
  it('registers paint, excel, glb and ifc in toolbar order with own keys', () => {
    expect(TOOLS.all().map((tool) => tool.id)).toEqual([
      'paint',
      'excel',
      'glb',
      'ifc',
    ]);
    expect(TOOLS.all().map((tool) => tool.settings.key)).toEqual([
      PAINT_SETTINGS_KEY,
      EXCEL_SETTINGS_KEY,
      GLB_SETTINGS_KEY,
      IFC_SETTINGS_KEY,
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
    expect(new Set(ids).size).toBe(4);
    expect(TOOLS.modals().map((modal) => modal.title)).toEqual([
      'Paint brushes settings',
      'Excel export settings',
      'Geometry export settings',
      'IFC export settings',
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
          report: () => undefined,
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

describe('migrating the old combined settings', () => {
  const legacy = {
    paintBrushes: false,
    paintPalette: ['#010203', '#0a0b0c'],
    paintIntensity: 0.7,
    excelExport: true,
    excel: { format: 'csv', scope: 'selected', namePattern: '{model}-x' },
    glbExport: false,
    ifcExport: true,
    ifc: {
      projectName: 'Tower',
      author: 'Ada',
      organisation: 'Acme',
      lengthUnit: 'mm',
    },
    sessionWarnMinutes: 15,
    recentsLength: 9,
  };

  it('moves every tool field to its tool key and keeps the app fields', () => {
    writeJson(APP, legacy);
    migrateLegacyToolSettings();
    expect(readJson(PAINT_SETTINGS_KEY, null)).toEqual({
      enabled: false,
      palette: ['#010203', '#0a0b0c'],
      intensity: 0.7,
    });
    expect(readJson(EXCEL_SETTINGS_KEY, null)).toMatchObject({
      enabled: true,
      format: 'csv',
      scope: 'selected',
      namePattern: '{model}-x',
    });
    expect(readJson(GLB_SETTINGS_KEY, null)).toEqual({ enabled: false });
    expect(readJson(IFC_SETTINGS_KEY, null)).toMatchObject({
      enabled: true,
      projectName: 'Tower',
      author: 'Ada',
      organisation: 'Acme',
      lengthUnit: 'mm',
    });
    expect(readJson(APP, null)).toEqual({
      sessionWarnMinutes: 15,
      recentsLength: 9,
    });
  });

  it('migrates a partial blob and writes keys only for tools it mentions', () => {
    writeJson(APP, { glbExport: false, recentsLength: 3 });
    migrateLegacyToolSettings();
    expect(readJson(GLB_SETTINGS_KEY, null)).toEqual({ enabled: false });
    expect(window.localStorage.getItem(PAINT_SETTINGS_KEY)).toBeNull();
    expect(window.localStorage.getItem(EXCEL_SETTINGS_KEY)).toBeNull();
    expect(window.localStorage.getItem(IFC_SETTINGS_KEY)).toBeNull();
    expect(readJson(APP, null)).toEqual({ recentsLength: 3 });
  });

  it('sanitizes bad values inside a legacy blob', () => {
    writeJson(APP, {
      paintBrushes: 'no',
      paintPalette: 'nope',
      paintIntensity: 'x',
      excel: 'junk',
      ifc: { lengthUnit: 'km', siteName: '' },
    });
    migrateLegacyToolSettings();
    expect(readJson(PAINT_SETTINGS_KEY, null)).toMatchObject({
      enabled: true,
      intensity: 0.5,
    });
    expect(readJson(IFC_SETTINGS_KEY, null)).toMatchObject({
      lengthUnit: 'm',
      siteName: 'Site',
    });
    expect(readJson(APP, null)).toEqual({});
  });

  it('leaves a corrupt blob alone and writes nothing', () => {
    window.localStorage.setItem(APP, '{"paintBrushes": ');
    migrateLegacyToolSettings();
    expect(window.localStorage.getItem(APP)).toBe('{"paintBrushes": ');
    for (const tool of TOOLS.all()) {
      expect(window.localStorage.getItem(tool.settings.key)).toBeNull();
    }
  });

  it('does nothing for an already migrated blob and runs twice safely', () => {
    writeJson(APP, legacy);
    migrateLegacyToolSettings();
    const once = tools();
    migrateLegacyToolSettings();
    expect(tools()).toEqual(once);
    expect(readJson(APP, null)).toEqual({
      sessionWarnMinutes: 15,
      recentsLength: 9,
    });
  });

  it('does not overwrite a tool key that is already there', () => {
    writeJson(IFC_SETTINGS_KEY, { projectName: 'Newer' });
    writeJson(APP, legacy);
    migrateLegacyToolSettings();
    expect(readJson(IFC_SETTINGS_KEY, null)).toEqual({ projectName: 'Newer' });
    expect(readJson(APP, null)).toEqual({
      sessionWarnMinutes: 15,
      recentsLength: 9,
    });
  });

  it('keeps the IFC identity out of the app blob but blanks it on sign-out', () => {
    writeJson(APP, legacy);
    migrateLegacyToolSettings();
    expect(JSON.stringify(readJson(APP, null))).not.toContain('Ada');
    forgetPersonal();
    expect(readJson(IFC_SETTINGS_KEY, null)).toMatchObject({
      author: '',
      organisation: '',
      projectName: 'Tower',
      lengthUnit: 'mm',
    });
    expect(readJson(PAINT_SETTINGS_KEY, null)).toMatchObject({
      enabled: false,
    });
  });

  function tools() {
    return TOOLS.all().map((tool) =>
      window.localStorage.getItem(tool.settings.key),
    );
  }
});
