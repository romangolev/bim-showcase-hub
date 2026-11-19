import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DASHBOARD_VIEW } from '../extensions/dashboardPresets.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { saveSelectionSet } from '../viewer/selectionSets.js';
import { DashboardGallery } from './DashboardGallery.js';
import { DashboardSettingsBody } from './DashboardSettings.js';
import { saveDashboardPreset } from '../extensions/dashboardPresets.js';
import { SelectionSets } from './SelectionSets.js';

beforeEach(() => {
  installMemoryStorage();
});

function blankRename(label: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.blur(input);
  return input;
}

describe('rename failures revert the input and tell the user', () => {
  it('in the dashboard gallery', () => {
    saveDashboardPreset('Mine', DEFAULT_DASHBOARD_VIEW);
    render(<DashboardGallery view={DEFAULT_DASHBOARD_VIEW} apply={() => {}} />);
    const input = blankRename('Rename Mine');
    expect(input.value).toBe('Mine');
    expect(screen.getByRole('alert').textContent).toMatch(/Could not rename/);
  });

  it('in the dashboard settings presets', () => {
    saveDashboardPreset('Mine', DEFAULT_DASHBOARD_VIEW);
    render(<DashboardSettingsBody />);
    const input = blankRename('Rename Mine');
    expect(input.value).toBe('Mine');
    expect(screen.getByRole('alert').textContent).toMatch(/Could not rename/);
  });

  it('in selection sets', () => {
    saveSelectionSet('Walls', [{ modelId: 'a', dbId: 1 }]);
    render(<SelectionSets adapter={null} />);
    const input = blankRename('Rename Walls');
    expect(input.value).toBe('Walls');
    expect(screen.getByRole('alert').textContent).toMatch(/Could not rename/);
  });
});
