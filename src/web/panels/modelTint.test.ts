import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { buildMockElements } from '../viewer/mockModel.js';
import {
  applyGhostOthers,
  applyModelTint,
  clampTintStrength,
  clearModelTint,
  DEFAULT_TINT_PALETTE,
  INITIAL_MODEL_TINTS,
  MAX_TINT_PALETTE,
  resetGhostOthers,
  sanitizeModelTints,
  tintColor,
  tintFor,
  tintName,
  tintPaletteFor,
  withGhostOthers,
  withModelTint,
  withoutTintPalette,
  withTintPalette,
} from './modelTint.js';

let host: HTMLElement;
let adapter: MockViewerAdapter;

beforeEach(async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  adapter = new MockViewerAdapter(host);
  await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
});

afterEach(() => {
  adapter.destroy();
  host.remove();
});

function themed(modelId: string): number {
  const group = host.querySelector(`[data-model-id="${modelId}"]`);
  return group?.querySelectorAll('.bsh-mock__el--themed').length ?? 0;
}

const EXTRA = buildMockElements().length;

describe('model tint state', () => {
  it('reads a valid record and falls back to the defaults', () => {
    expect(sanitizeModelTints(undefined)).toEqual(INITIAL_MODEL_TINTS);
    expect(sanitizeModelTints('nope')).toEqual(INITIAL_MODEL_TINTS);
    expect(
      sanitizeModelTints({ palette: ['#ABCDEF', 'x', '#abcdef'] }),
    ).toEqual({ ...INITIAL_MODEL_TINTS, palette: ['#abcdef'] });
    expect(
      sanitizeModelTints({
        tints: {
          a: { color: '#EF4444', strength: 5 },
          b: { color: 'red', strength: 0.5 },
          c: 'nope',
        },
      }).tints,
    ).toEqual({ a: { color: '#ef4444', strength: 1 } });
  });

  it('clamps the tint strength', () => {
    expect(clampTintStrength(undefined)).toBe(0.5);
    expect(clampTintStrength(0)).toBe(0.1);
    expect(clampTintStrength(3)).toBe(1);
    expect(clampTintStrength(0.42)).toBe(0.4);
  });

  it('keeps the global palette and a palette per set', () => {
    const custom = ['#111111', '#222222'];
    const withSet = withTintPalette(INITIAL_MODEL_TINTS, 'tab', custom);
    expect(tintPaletteFor(withSet, 'tab')).toEqual(custom);
    expect(tintPaletteFor(withSet, 'other')).toEqual(DEFAULT_TINT_PALETTE);
    expect(
      tintPaletteFor(withTintPalette(withSet, null, custom), 'tab'),
    ).toEqual(custom);
    expect(tintPaletteFor(withoutTintPalette(withSet, 'tab'), 'tab')).toEqual(
      DEFAULT_TINT_PALETTE,
    );
    expect(
      withTintPalette(INITIAL_MODEL_TINTS, 'tab', ['#x']).palettes.tab,
    ).toHaveLength(DEFAULT_TINT_PALETTE.length);
    const many = Array.from(
      { length: 20 },
      (_, index) => `#${index.toString(16).padStart(6, '0')}`,
    );
    expect(
      withTintPalette(INITIAL_MODEL_TINTS, 'tab', many).palettes.tab,
    ).toHaveLength(MAX_TINT_PALETTE);
  });

  it('stores and removes one model colour', () => {
    const tint = { color: '#3b82f6', strength: 0.4 };
    const withOne = withModelTint(INITIAL_MODEL_TINTS, 'a', tint);
    expect(tintFor(withOne, 'a')).toEqual(tint);
    expect(tintFor(withOne, 'b')).toBeNull();
    expect(withOne.strength).toBe(0.4);
    expect(tintFor(withModelTint(withOne, 'a', null), 'a')).toBeNull();
    expect(tintColor(tint)).toEqual([59 / 255, 130 / 255, 246 / 255, 0.4]);
    expect(tintName('#3b82f6')).toBe('Blue');
    expect(tintName('#123456')).toBe('#123456');
    expect(withGhostOthers(INITIAL_MODEL_TINTS, true).ghostOthers).toBe(true);
  });
});

describe('model tint on the viewer', () => {
  it('recolours only the chosen model', async () => {
    await applyModelTint(adapter, 'urn-a', {
      color: '#ef4444',
      strength: 0.5,
    });
    expect(themed('urn-a')).toBe(EXTRA);
    expect(themed('urn-b')).toBe(0);
    const node = host.querySelector<SVGElement>(
      '[data-model-id="urn-a"] [data-dbid]',
    );
    expect(node?.style.fill).toBe('rgba(239, 68, 68, 0.5)');
  });

  it('clears only the tint layer', async () => {
    await applyModelTint(adapter, 'urn-a', { color: '#ef4444', strength: 0.5 });
    await applyModelTint(adapter, 'urn-b', { color: '#22c55e', strength: 0.5 });
    clearModelTint(adapter, 'urn-a');
    expect(themed('urn-a')).toBe(0);
    expect(themed('urn-b')).toBe(EXTRA);
  });

  it('replaces a tint instead of stacking colours', async () => {
    await applyModelTint(adapter, 'urn-a', { color: '#ef4444', strength: 0.5 });
    await applyModelTint(adapter, 'urn-a', { color: '#22c55e', strength: 0.5 });
    expect(themed('urn-a')).toBe(EXTRA);
    const node = host.querySelector<SVGElement>(
      '[data-model-id="urn-a"] [data-dbid]',
    );
    expect(node?.style.fill).toBe('rgba(34, 197, 94, 0.5)');
  });

  it('ghosts every other model and resets', async () => {
    await applyGhostOthers(adapter, 'urn-a');
    expect(host.querySelectorAll('.bsh-mock__el--dim')).toHaveLength(EXTRA);
    expect(host.querySelectorAll('.bsh-mock__el--hidden')).toHaveLength(0);
    expect(adapter.getIsolated()).toHaveLength(EXTRA);
    resetGhostOthers(adapter);
    expect(host.querySelectorAll('.bsh-mock__el--dim')).toHaveLength(0);
    expect(host.querySelectorAll('.bsh-mock__el--hidden')).toHaveLength(0);
    expect(adapter.getIsolated()).toEqual([]);
  });
});
