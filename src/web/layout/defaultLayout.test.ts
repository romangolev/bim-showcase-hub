import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISMISSED,
  defaultSteps,
  placementFor,
} from './defaultLayout.js';

describe('default layout', () => {
  it('places the viewer first, panes beside it next and edges last', () => {
    expect(defaultSteps(320).map((step) => step.id)).toEqual([
      'viewer',
      'summary',
      'dashboard',
      'export',
      'search',
      'tree',
      'models',
      'colors',
    ]);
  });

  it('leaves panes that start closed out of the default layout', () => {
    const ids = defaultSteps(320).map((step) => step.id);
    expect(ids).not.toContain('help');
    expect(ids).not.toContain('activity');
  });

  it('matches the classic look: tree left, summary right, dashboard below', () => {
    const steps = Object.fromEntries(
      defaultSteps(320).map((step) => [step.id, step.placement]),
    );
    expect(steps.viewer).toEqual({ kind: 'root' });
    expect(steps.summary).toMatchObject({
      kind: 'beside',
      reference: 'viewer',
      direction: 'right',
    });
    expect(steps.dashboard).toMatchObject({
      kind: 'beside',
      reference: 'viewer',
      direction: 'below',
    });
    expect(steps.tree).toEqual({ kind: 'edge', direction: 'left', size: 320 });
    expect(steps.models).toEqual({ kind: 'tab', reference: 'tree' });
  });

  it('uses the imported tree width', () => {
    const tree = defaultSteps(400).find((step) => step.id === 'tree');
    expect(tree?.placement).toMatchObject({ size: 400 });
  });

  it('starts the optional viewer panes closed', () => {
    expect(DEFAULT_DISMISSED).toEqual(['measurements', 'views']);
    expect(defaultSteps(320).map((step) => step.id)).toEqual(
      expect.not.arrayContaining(['measurements', 'views']),
    );
  });

  it('falls back to the dock edge when the reference pane is closed', () => {
    const beside = {
      kind: 'beside' as const,
      reference: 'viewer' as const,
      direction: 'right' as const,
      size: 320,
    };
    expect(placementFor(beside, () => true)).toBe(beside);
    expect(placementFor(beside, () => false)).toEqual({
      kind: 'edge',
      direction: 'right',
      size: 320,
    });
  });
});
