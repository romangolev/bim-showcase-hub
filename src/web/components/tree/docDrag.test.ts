import { describe, expect, it, vi } from 'vitest';
import {
  handleModelDrop,
  hasModelDrag,
  MODEL_DRAG_TYPE,
  modelDragText,
  readModelDrag,
  startModelDrag,
} from './docDrag.js';

function source(data: Record<string, string>) {
  return {
    types: Object.keys(data),
    getData: (format: string) => data[format] ?? '',
  };
}

describe('model drag payload', () => {
  it('round-trips a urn and its context', () => {
    const text = modelDragText({
      urn: 'urn-a',
      context: { file: 'A.rvt', v: 'v1', trail: ['h1', 'p1'] },
    });
    expect(readModelDrag(text)).toEqual({
      urn: 'urn-a',
      context: { file: 'A.rvt', v: 'v1', trail: ['h1', 'p1'] },
    });
  });

  it('rejects junk and empty payloads', () => {
    expect(readModelDrag(null)).toBeNull();
    expect(readModelDrag('')).toBeNull();
    expect(readModelDrag('not json')).toBeNull();
    expect(readModelDrag('{"urn":""}')).toBeNull();
    expect(readModelDrag('{"urn":3}')).toBeNull();
  });

  it('writes the custom type and a copy effect', () => {
    const transfer = {
      setData: vi.fn(),
      effectAllowed: 'none',
    };
    startModelDrag(
      { dataTransfer: transfer as unknown as DataTransfer },
      { urn: 'urn-a', context: { file: 'A.rvt' } },
    );
    expect(transfer.setData).toHaveBeenCalledWith(
      MODEL_DRAG_TYPE,
      modelDragText({ urn: 'urn-a', context: { file: 'A.rvt' } }),
    );
    expect(transfer.effectAllowed).toBe('copy');
  });
});

describe('hasModelDrag', () => {
  it('recognizes only the documents model type', () => {
    expect(hasModelDrag(source({ [MODEL_DRAG_TYPE]: 'x' }))).toBe(true);
    expect(hasModelDrag(source({ 'text/plain': 'x' }))).toBe(false);
    expect(hasModelDrag(null)).toBe(false);
  });
});

describe('handleModelDrop', () => {
  it('opens the dropped model', () => {
    const open = vi.fn();
    const event = {
      dataTransfer: source({
        [MODEL_DRAG_TYPE]: modelDragText({
          urn: 'urn-a',
          context: { file: 'A.rvt' },
        }),
      }),
      preventDefault: vi.fn(),
    };
    expect(handleModelDrop(event, open)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith({
      urn: 'urn-a',
      context: { file: 'A.rvt' },
    });
  });

  it('ignores an unrelated drag', () => {
    const open = vi.fn();
    const event = {
      dataTransfer: source({ 'text/plain': 'hello' }),
      preventDefault: vi.fn(),
    };
    expect(handleModelDrop(event, open)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('ignores a model drag with an unreadable payload', () => {
    const open = vi.fn();
    const event = {
      dataTransfer: source({ [MODEL_DRAG_TYPE]: 'garbage' }),
      preventDefault: vi.fn(),
    };
    expect(handleModelDrop(event, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
