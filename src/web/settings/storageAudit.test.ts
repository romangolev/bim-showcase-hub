import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BSH_PREFIXES,
  forgetPersonal,
  getStorageAdapter,
  setStorageAdapter,
} from '../storage.js';
import { memoryAdapter, type StorageAdapter } from '../storageAdapter.js';
import {
  clearLocalData,
  formatStorageBytes,
  storageReport,
} from './storageAudit.js';

let previous: StorageAdapter;

function seed(): void {
  const adapter = memoryAdapter();
  adapter.set('local', 'bsh.layout.v2', '{"dock":{}}');
  adapter.set('local', 'bsh.pane.chart.1.v1', '{"chart":true}');
  adapter.set('local', 'bsh.tree.view', '{"sort":"name"}');
  adapter.set('local', 'bsh.tool.paint.v1', '{"enabled":true}');
  adapter.set('local', 'bsh.mystery', '{"x":1}');
  adapter.set('local', 'unrelated', 'x');
  adapter.set('session', 'bsh.models.open', '{"models":[]}');
  previous = setStorageAdapter(adapter);
}

beforeEach(seed);

afterEach(() => {
  setStorageAdapter(previous);
});

describe('storage report', () => {
  it('groups app keys by family and classifies them', () => {
    const report = storageReport();
    expect(report.personal).toEqual({ keys: 3, bytes: expect.any(Number) });
    expect(report.preference).toEqual({ keys: 2, bytes: expect.any(Number) });
    expect(report.other).toEqual({ keys: 1, bytes: expect.any(Number) });
    expect(report.total.keys).toBe(6);
    expect(report.families.map((family) => family.id)).toEqual(
      expect.arrayContaining([
        'layout',
        'models',
        'tree',
        'tools',
        'other-other',
      ]),
    );
    expect(report.families.some((family) => family.id === 'unrelated')).toBe(
      false,
    );
    expect(report.families.find((family) => family.id === 'layout')?.keys).toBe(
      2,
    );
  });

  it('keeps preferences and unclassified keys when personal data is cleared', () => {
    const result = clearLocalData({ preferences: false });
    expect(result.keys).toBe(3);
    const report = storageReport();
    expect(report.personal.keys).toBe(0);
    expect(report.preference.keys).toBe(2);
    expect(report.other.keys).toBe(1);
  });

  it('clears preferences only when asked, and never unclassified keys', () => {
    clearLocalData({ preferences: true });
    const report = storageReport();
    expect(report.personal.keys).toBe(0);
    expect(report.preference.keys).toBe(0);
    expect(report.other.keys).toBe(1);
  });

  it('leaves an unclassified app key for a deliberate decision', () => {
    forgetPersonal();
    expect(storageReport().other.keys).toBe(1);
  });

  it('formats bytes for the readout', () => {
    expect(formatStorageBytes(900)).toBe('900 B');
    expect(formatStorageBytes(2400)).toBe('2.4 KB');
    expect(formatStorageBytes(1_500_000)).toBe('1.5 MB');
  });

  it('reports the last session record as a personal models key', () => {
    getStorageAdapter().set(
      'local',
      'bsh.models.session.v1',
      '{"models":[],"active":null}',
    );
    const report = storageReport();
    expect(report.personal.keys).toBe(4);
    expect(report.families.find((family) => family.id === 'models')?.keys).toBe(
      2,
    );
    forgetPersonal();
    expect(
      getStorageAdapter().get('local', 'bsh.models.session.v1'),
    ).toBeNull();
  });
});

describe('prefix constants', () => {
  it('classifies each shared prefix into a named family', () => {
    const adapter = memoryAdapter();
    const prefixes = [BSH_PREFIXES.pane, BSH_PREFIXES.paint, BSH_PREFIXES.tool];
    for (const prefix of prefixes) {
      adapter.set('local', `${prefix}probe`, '1');
    }
    setStorageAdapter(adapter);
    const ids = storageReport().families.map((family) => family.id);
    expect(ids).toEqual(expect.arrayContaining(['layout', 'paint', 'tools']));
    expect(ids).not.toContain('personal-other');
    expect(ids).not.toContain('preference-other');
    expect(storageReport().total.keys).toBe(3);
  });
});
