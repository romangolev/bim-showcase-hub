import { describe, expect, it, vi } from 'vitest';
import { SelectionHub } from './selectionHub.js';

describe('SelectionHub', () => {
  it('gives each listener its own copy of the items', () => {
    const hub = new SelectionHub();
    const first = vi.fn((items: { dbId: number }[]) => {
      for (const item of items) item.dbId = 99;
    });
    const second = vi.fn();
    hub.subscribe(first);
    hub.subscribe(second);
    hub.emit([{ modelId: 'a', dbId: 1 }]);
    expect(second).toHaveBeenCalledWith([{ modelId: 'a', dbId: 1 }]);
  });

  it('keeps notifying after a listener throws', () => {
    const hub = new SelectionHub();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    hub.subscribe(() => {
      throw new Error('bad');
    });
    hub.subscribe(after);
    hub.emit([]);
    expect(after).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it('stops notifying after unsubscribe and clear', () => {
    const hub = new SelectionHub();
    const a = vi.fn();
    const b = vi.fn();
    hub.subscribe(a)();
    hub.subscribe(b);
    hub.clear();
    hub.emit([]);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
