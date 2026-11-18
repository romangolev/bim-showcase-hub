import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePaneSetting } from '../settings/paneSettings.js';
import { forgetPersonal } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  forgetInstanceSetting,
  instanceSettingKey,
  propertiesSetting,
  sanitizePropertiesSpec,
  seedInstanceSetting,
} from './instanceSettings.js';
import { isUserFamily, parsePanelId } from './paneRegistry.js';
import {
  addUserInstance,
  sanitizeUserInstances,
  userInstanceIds,
} from './userInstances.js';

describe('properties pane family', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('is a creatable user family with its own ids', () => {
    expect(isUserFamily('properties')).toBe(true);
    expect(parsePanelId('properties:2')).toEqual({
      kind: 'properties',
      instance: '2',
    });
    const first = addUserInstance({}, 'properties');
    expect(first?.id).toBe('properties:1');
    expect(first?.state.properties?.[0]?.title).toBe('Properties 1');
  });

  it('caps the family at twelve instances', () => {
    let state = {};
    for (let n = 0; n < 12; n += 1) {
      state = addUserInstance(state, 'properties')?.state ?? state;
    }
    expect(userInstanceIds(state)).toHaveLength(12);
    expect(addUserInstance(state, 'properties')).toBeNull();
  });

  it('keys, sanitizes, seeds and forgets its spec', () => {
    expect(instanceSettingKey('properties:3')).toBe('bsh.pane.properties.3.v1');
    expect(sanitizePropertiesSpec(null)).toEqual({ scope: 'all' });
    expect(sanitizePropertiesSpec({ scope: 3 })).toEqual({ scope: 'all' });
    expect(sanitizePropertiesSpec({ scope: '' })).toEqual({ scope: 'all' });
    expect(sanitizePropertiesSpec({ scope: 'm1', extra: 1 })).toEqual({
      scope: 'm1',
    });
    seedInstanceSetting('properties:1', null);
    expect(window.localStorage.getItem('bsh.pane.properties.1.v1')).toBeNull();
    seedInstanceSetting('properties:1', 'urn-a');
    const { result } = renderHook(() =>
      usePaneSetting(propertiesSetting('properties:1')),
    );
    expect(result.current[0]).toEqual({ scope: 'urn-a' });
    forgetInstanceSetting('properties:1');
    expect(window.localStorage.getItem('bsh.pane.properties.1.v1')).toBeNull();
  });

  it('is scrubbed on sign-out forget', () => {
    window.localStorage.setItem(
      'bsh.pane.properties.2.v1',
      JSON.stringify({ scope: 'urn-a' }),
    );
    forgetPersonal();
    expect(window.localStorage.getItem('bsh.pane.properties.2.v1')).toBeNull();
  });
});

describe('sanitizing persisted user instances per family', () => {
  it('keeps valid ids of every user family and drops the rest explicitly', () => {
    const clean = sanitizeUserInstances({
      chart: [
        { id: 'chart:1', title: 'Cost' },
        { id: 'properties:1', title: 'wrong key' },
        { id: 'chart:1' },
      ],
      modelSummary: [
        { id: 'modelSummary:2' },
        { id: 'modelSummary:', title: 'no instance' },
        { id: 'modelSummary' },
        { id: 7 },
      ],
      properties: [
        { id: 'properties:1', title: 'Doors' },
        { id: 'properties:1', title: 'dup' },
        { id: 'chart:4', title: 'stale: other family' },
        { id: 'properties:' },
        { id: 'properties:9', title: '' },
        null,
      ],
      viewer: [{ id: 'viewer:x' }],
      summary: [{ id: 'summary:1' }],
      gone: [{ id: 'gone:1' }],
    });
    expect(clean).toEqual({
      chart: [{ id: 'chart:1', title: 'Cost' }],
      modelSummary: [{ id: 'modelSummary:2', title: 'Model summary' }],
      properties: [
        { id: 'properties:1', title: 'Doors' },
        { id: 'properties:9', title: 'Properties' },
      ],
    });
  });

  it('ignores a family whose list is not an array and non-object roots', () => {
    expect(sanitizeUserInstances({ properties: 'properties:1' })).toEqual({});
    expect(sanitizeUserInstances(undefined)).toEqual({});
    expect(sanitizeUserInstances(['properties:1'])).toEqual({});
  });

  it('caps each family when a stored list is too long', () => {
    const many = Array.from({ length: 20 }, (_, n) => ({
      id: `properties:${n + 1}`,
    }));
    expect(sanitizeUserInstances({ properties: many }).properties).toHaveLength(
      12,
    );
  });
});
