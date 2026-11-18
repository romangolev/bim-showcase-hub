import { describe, expect, it, vi } from 'vitest';
import { recentModelCommands } from './recentModels.js';

describe('recentModelCommands', () => {
  it('offers the most recent models as jump commands', () => {
    const open = vi.fn();
    const models = Array.from({ length: 7 }, (_, index) => ({
      urn: `urn:${index}`,
      file: `Model ${index}.rvt`,
    }));
    const commands = recentModelCommands(open, models);
    expect(commands).toHaveLength(5);
    expect(commands[0]).toMatchObject({
      id: 'model.recent.urn:0',
      title: 'Open Model 0.rvt',
      group: 'Recent models',
      icon: 'model',
    });
    expect(commands.map((command) => command.id)).not.toContain(
      'model.recent.urn:5',
    );
  });

  it('runs the provided navigation handle with the model context', () => {
    const open = vi.fn();
    const commands = recentModelCommands(open, [
      { urn: 'urn:tower', file: 'Tower.rvt', v: '2' },
    ]);
    commands[0]?.run({ openModal: () => undefined });
    expect(open).toHaveBeenCalledWith('urn:tower', {
      file: 'Tower.rvt',
      v: '2',
    });
  });
});
