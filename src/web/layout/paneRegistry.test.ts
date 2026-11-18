import { describe, expect, it } from 'vitest';
import {
  FOLLOWERS,
  followersOf,
  hasPlainPanel,
  instancePanelId,
  isPaneId,
  isPanelClosable,
  isRequired,
  isUserFamily,
  isUserInstance,
  PANE_IDS,
  PANES,
  paneById,
  paneKind,
  parsePanelId,
} from './paneRegistry.js';

describe('pane registry', () => {
  it('has unique ids and a definition for every id', () => {
    expect(new Set(PANE_IDS).size).toBe(PANES.length);
    for (const id of PANE_IDS) {
      expect(paneById(id).id).toBe(id);
    }
  });

  it('makes Documents the only required pane', () => {
    const tree = paneById('tree');
    expect(tree.closable).toBe(false);
    expect(isRequired('tree')).toBe(true);
    expect(PANES.filter((pane) => isRequired(pane.id))).toEqual([tree]);
    expect(isRequired('viewer')).toBe(false);
    expect(paneById('viewer').canFloat).toBe(true);
    expect(hasPlainPanel('viewer')).toBe(false);
    expect(hasPlainPanel('tree')).toBe(true);
  });

  it('places exactly one pane at the root and references only known panes', () => {
    expect(
      PANES.filter((pane) => pane.defaultPlacement.kind === 'root'),
    ).toHaveLength(1);
    for (const pane of PANES) {
      const placement = pane.defaultPlacement;
      if (placement.kind === 'beside') {
        expect(isPaneId(placement.reference)).toBe(true);
        expect(placement.reference).not.toBe(pane.id);
      }
    }
  });

  it('gives every pane a title, an icon and a positive minimum size', () => {
    for (const pane of PANES) {
      expect(pane.title.length).toBeGreaterThan(0);
      expect(pane.icon.length).toBeGreaterThan(0);
      expect(pane.minSize.width).toBeGreaterThan(0);
      expect(pane.minSize.height).toBeGreaterThan(0);
    }
  });

  it('rejects unknown ids', () => {
    expect(isPaneId('tree')).toBe(true);
    expect(isPaneId('terminal')).toBe(false);
    expect(isPaneId(3)).toBe(false);
    expect(() => paneById('terminal' as never)).toThrow();
  });

  it('maps model tab ids to the viewer pane kind', () => {
    const id = instancePanelId('viewer', 'dXJuOmE_dmVyc2lvbj0y');
    expect(id).toBe('viewer:dXJuOmE_dmVyc2lvbj0y');
    expect(parsePanelId(id)).toEqual({
      kind: 'viewer',
      instance: 'dXJuOmE_dmVyc2lvbj0y',
    });
    expect(paneKind(id)).toBe('viewer');
    expect(parsePanelId('viewer')).toEqual({ kind: 'viewer', instance: null });
    expect(isPanelClosable(id)).toBe(true);
    expect(isPanelClosable('tree')).toBe(false);
    expect(isPanelClosable('summary')).toBe(true);
  });

  it('derives the viewer followers from the registry in one place', () => {
    expect(FOLLOWERS).toEqual(['summary', 'dashboard', 'models']);
    expect(followersOf('viewer')).toEqual(['summary', 'dashboard', 'models']);
    expect(followersOf('tree')).toEqual([]);
  });

  it('rejects instances of panes without instances', () => {
    expect(parsePanelId('summary:x')).toBeNull();
    expect(parsePanelId('viewer:')).toBeNull();
    expect(parsePanelId('terminal:x')).toBeNull();
    expect(paneKind(42)).toBeNull();
  });

  it('registers user families as instance panes that are not companions', () => {
    expect(isUserFamily('chart')).toBe(true);
    expect(isUserFamily('viewer')).toBe(false);
    expect(parsePanelId('chart:3')).toEqual({ kind: 'chart', instance: '3' });
    expect(parsePanelId('chart')).toEqual({ kind: 'chart', instance: null });
    expect(isUserInstance('chart:3')).toBe(true);
    expect(isUserInstance('viewer:x')).toBe(false);
    expect(isPanelClosable('chart:3')).toBe(true);
    expect(hasPlainPanel('chart')).toBe(false);
    expect(FOLLOWERS).not.toContain('chart');
  });
});
