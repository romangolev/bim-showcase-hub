import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createOpenModelsStore,
  type OpenModelsStore,
} from '../api/openModels.js';
import { BSH_KEYS } from '../storage.js';
import { tasks } from '../tasks/taskStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import '../tools/index.js';
import { useOwnedModels } from './LayoutProvider.js';

function Harness({
  id,
  name,
  store,
}: {
  id: string;
  name: string;
  store: OpenModelsStore;
}) {
  const owned = useOwnedModels({ id, name }, store);
  return <span>{owned.getState().models.length} models</span>;
}

beforeEach(() => {
  installMemoryStorage();
  tasks.clearFinished();
});

describe('useOwnedModels', () => {
  it('claims a changed owner and clears the previous models', () => {
    window.localStorage.setItem(BSH_KEYS.personal.modelOwner, 'id:previous');
    const store = createOpenModelsStore();
    store.open('urn:previous');
    render(<Harness id="u2" name="Grace" store={store} />);
    expect(window.localStorage.getItem(BSH_KEYS.personal.modelOwner)).toBe(
      'id:u2',
    );
    expect(store.getState().models).toHaveLength(0);
  });

  it('keeps the stored owner when it already matches', () => {
    window.localStorage.setItem(BSH_KEYS.personal.modelOwner, 'id:u1');
    const store = createOpenModelsStore();
    store.open('urn:kept');
    render(<Harness id="u1" name="Ada" store={store} />);
    expect(window.localStorage.getItem(BSH_KEYS.personal.modelOwner)).toBe(
      'id:u1',
    );
    expect(store.getState().models).toHaveLength(1);
  });
});
