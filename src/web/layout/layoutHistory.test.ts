import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  LAYOUT_HISTORY_LIMIT,
  recordLayout,
  redoStep,
  undoStep,
} from './layoutHistory.js';
import { defaultModel, type LayoutModel } from './layoutState.js';

const at = (treeWidth: number): LayoutModel => ({
  ...defaultModel(),
  treeWidth,
});

describe('layoutHistory', () => {
  it('undoes to the recorded layout and redoes back', () => {
    const history = recordLayout(EMPTY_HISTORY, at(300));
    const undone = undoStep(history, at(400));
    expect(undone?.layout.treeWidth).toBe(300);
    const redone = redoStep(undone?.history ?? EMPTY_HISTORY, at(300));
    expect(redone?.layout.treeWidth).toBe(400);
  });

  it('clears the redo list on a new record', () => {
    const undone = undoStep(recordLayout(EMPTY_HISTORY, at(300)), at(400));
    const next = recordLayout(undone?.history ?? EMPTY_HISTORY, at(300));
    expect(next.future).toEqual([]);
  });

  it('keeps the last entries only', () => {
    let history = EMPTY_HISTORY;
    for (let i = 0; i < LAYOUT_HISTORY_LIMIT + 5; i += 1)
      history = recordLayout(history, at(260 + i));
    expect(history.past).toHaveLength(LAYOUT_HISTORY_LIMIT);
    expect(history.past[0]?.treeWidth).toBe(265);
  });

  it('skips entries equal to the current layout', () => {
    const history = recordLayout(recordLayout(EMPTY_HISTORY, at(300)), at(400));
    expect(undoStep(history, at(400))?.layout.treeWidth).toBe(300);
    expect(undoStep(recordLayout(EMPTY_HISTORY, at(400)), at(400))).toBeNull();
  });

  it('returns null with nothing to undo or redo', () => {
    expect(undoStep(EMPTY_HISTORY, at(300))).toBeNull();
    expect(redoStep(EMPTY_HISTORY, at(300))).toBeNull();
  });
});
