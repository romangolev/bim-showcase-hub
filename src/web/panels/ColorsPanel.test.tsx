import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLOR_RULE_PRESETS } from '../extensions/colorRulePresets.js';
import { setStorageAdapter } from '../storage.js';
import { memoryAdapter } from '../storageAdapter.js';
import { loadedMockAdapter } from '../test/mockAdapter.js';
import { render } from '../test/render.js';
import { colorLayersFor } from '../viewer/colorLayers.js';
import { currentColoring } from '../viewer/modelColoring.js';
import { ColorsPanel } from './ColorsPanel.js';
import { COLORS_SETTINGS } from './colorsSettings.js';

beforeEach(() => {
  setStorageAdapter(memoryAdapter());
});

describe('ColorsPanel', () => {
  it('colours the model by the chosen property and shows the legend', async () => {
    const adapter = await loadedMockAdapter();
    render(<ColorsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Color the model' }));
    await waitFor(() =>
      expect(currentColoring(adapter)?.title).toBe('Category'),
    );
    expect(
      screen.getByRole('list', { name: 'Legend for Category' }),
    ).toBeInTheDocument();
    const modelId = adapter.getModels()[0]?.id ?? '';
    expect(colorLayersFor(adapter).hasModel('chart', modelId)).toBe(true);
  });

  it('clears the colours and does not colour again on its own', async () => {
    const adapter = await loadedMockAdapter();
    render(<ColorsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Color the model' }));
    await screen.findByRole('list', { name: 'Legend for Category' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear colours' }));
    expect(currentColoring(adapter)).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), {
      target: { value: 'range' },
    });
    expect(currentColoring(adapter)).toBeNull();
  });

  it('follows its settings only while its own colouring is shown', async () => {
    const adapter = await loadedMockAdapter();
    render(<ColorsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Color the model' }));
    await waitFor(() =>
      expect(currentColoring(adapter)?.origin).toBe('property'),
    );
    const first = currentColoring(adapter);
    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), {
      target: { value: 'range' },
    });
    await waitFor(() => expect(currentColoring(adapter)).not.toBe(first));
    expect(currentColoring(adapter)?.origin).toBe('property');
  });

  it('colours by rules and ghosts the rest', async () => {
    const adapter = await loadedMockAdapter();
    const ghosting = vi.spyOn(adapter, 'setGhosting');
    COLORS_SETTINGS.write({
      ...COLORS_SETTINGS.read(),
      source: 'rules',
      rules: {
        rules: [
          {
            id: 'w',
            property: 'Category',
            op: 'equals',
            value: 'Walls',
            min: null,
            max: null,
            color: '#ff0000',
            label: 'Walls',
          },
        ],
        fallback: null,
        ghostRest: true,
      },
    });
    render(<ColorsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Color the model' }));
    await waitFor(() => expect(currentColoring(adapter)?.origin).toBe('rules'));
    expect(adapter.getIsolated().length).toBe(
      currentColoring(adapter)?.legend[0]?.count,
    );
    expect(ghosting).toHaveBeenCalledWith(true);
  });

  it('shows the whole model again when ghosting is turned off', async () => {
    const adapter = await loadedMockAdapter();
    const ghosting = vi.spyOn(adapter, 'setGhosting');
    COLORS_SETTINGS.write({
      ...COLORS_SETTINGS.read(),
      source: 'rules',
      rules: {
        rules: [
          {
            id: 'w',
            property: 'Category',
            op: 'equals',
            value: 'Walls',
            min: null,
            max: null,
            color: '#ff0000',
            label: 'Walls',
          },
        ],
        fallback: null,
        ghostRest: true,
      },
    });
    render(<ColorsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Color the model' }));
    await waitFor(() =>
      expect(adapter.getIsolated().length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ghost the rest' }));
    await waitFor(() => expect(adapter.getIsolated()).toEqual([]));
    expect(ghosting).toHaveBeenLastCalledWith(false);
  });

  it('saves the rules as a preset and duplicates it', async () => {
    const adapter = await loadedMockAdapter();
    render(<ColorsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('radio', { name: 'By rules' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Mine' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Duplicate Mine' }),
    );
    expect(COLOR_RULE_PRESETS.list().map((item) => item.name)).toEqual([
      'Mine',
      'Mine copy',
    ]);
  });

  it('keeps decimal thresholds in a range rule', async () => {
    const adapter = await loadedMockAdapter();
    COLORS_SETTINGS.write({
      ...COLORS_SETTINGS.read(),
      source: 'rules',
      rules: {
        rules: [
          {
            id: 'thickness',
            property: 'Category',
            op: 'range',
            value: '',
            min: null,
            max: null,
            color: '#ff0000',
            label: 'Thickness',
          },
        ],
        fallback: null,
        ghostRest: false,
      },
    });
    render(<ColorsPanel adapter={adapter} />);
    const min = screen.getByLabelText('Min');
    fireEvent.change(min, { target: { value: '0.5' } });
    fireEvent.blur(min);
    const max = screen.getByLabelText('Max');
    fireEvent.change(max, { target: { value: '2.5' } });
    fireEvent.blur(max);
    expect(COLORS_SETTINGS.read().rules.rules[0]).toMatchObject({
      min: 0.5,
      max: 2.5,
    });
  });

  it('keeps the top values an integer', async () => {
    const adapter = await loadedMockAdapter();
    render(<ColorsPanel adapter={adapter} />);
    const top = screen.getByLabelText('Top values');
    fireEvent.change(top, { target: { value: '6.8' } });
    fireEvent.blur(top);
    expect(COLORS_SETTINGS.read().spec.topN).toBe(6);
  });
});
