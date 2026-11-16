import { describe, expect, it } from 'vitest';
import { mountedPanels } from './mounted.js';

const attached = ['tree', 'summary', 'dashboard', 'viewer:a', 'viewer:b'];

describe('mountedPanels', () => {
  it('mounts what the dock has open and every open model', () => {
    expect(
      mountedPanels(attached, {
        mode: 'dock',
        open: ['tree', 'viewer', 'summary'],
        companions: ['summary', 'dashboard'],
        onModel: true,
        instances: ['viewer:a'],
      }),
    ).toEqual(['tree', 'summary', 'viewer:a']);
  });

  it('mounts only what the stack slots', () => {
    expect(
      mountedPanels(attached, {
        mode: 'stacked',
        open: ['tree', 'summary', 'dashboard'],
        companions: ['summary', 'dashboard'],
        onModel: false,
        instances: [],
      }),
    ).toEqual(['tree']);
    expect(
      mountedPanels(attached, {
        mode: 'stacked',
        open: ['tree'],
        companions: ['summary'],
        onModel: true,
        instances: ['viewer:a', 'viewer:b'],
      }),
    ).toEqual(['tree', 'summary', 'viewer:a', 'viewer:b']);
  });
});
