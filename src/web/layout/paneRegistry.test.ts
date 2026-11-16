import { describe, expect, it } from 'vitest';
import {
  instancePanelId,
  isPaneId,
  isPanelClosable,
  isRequired,
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

  it('keeps the viewer open and floatable', () => {
    const viewer = paneById('viewer');
    expect(viewer.closable).toBe(false);
    expect(viewer.canFloat).toBe(true);
    expect(isRequired('viewer')).toBe(true);
    expect(PANES.filter((pane) => isRequired(pane.id))).toEqual([viewer]);
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
    expect(isPanelClosable('viewer')).toBe(false);
  });

  it('rejects instances of panes without instances', () => {
    expect(parsePanelId('summary:x')).toBeNull();
    expect(parsePanelId('viewer:')).toBeNull();
    expect(parsePanelId('terminal:x')).toBeNull();
    expect(paneKind(42)).toBeNull();
  });
});
