import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_USER_PRESETS,
  DEFAULT_DASHBOARD_VIEW,
  saveDashboardPreset,
} from '../extensions/dashboardPresets.js';
import { notifications } from '../tasks/notifications.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { FEDERATIONS } from '../viewer/savedFederations.js';
import { saveSelectionSet } from '../viewer/selectionSets.js';
import { DashboardGallery } from './DashboardGallery.js';
import { DashboardSettingsBody } from './DashboardSettings.js';
import { ModelsPanel } from './ModelsPanel.js';
import { SelectionSets } from './SelectionSets.js';

beforeEach(() => {
  installMemoryStorage();
  notifications.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
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

describe('saved combinations in the models panel', () => {
  it('reverts a blank rename and tells the user', () => {
    FEDERATIONS.save('Site', {
      members: [
        { urn: 'urn-a', context: {}, latest: false, hidden: false },
        { urn: 'urn-b', context: {}, latest: false, hidden: false },
      ],
    });
    render(<ModelsPanel adapter={null} onOpenFederation={() => {}} />);
    const input = blankRename('Rename Site');
    expect(input.value).toBe('Site');
    expect(screen.getByRole('alert').textContent).toMatch(/Could not rename/);
  });
});

describe('a failed delete is reported', () => {
  const messages = () =>
    notifications.getSnapshot().items.map((entry) => entry.message);

  it('in the dashboard gallery', () => {
    saveDashboardPreset('Mine', DEFAULT_DASHBOARD_VIEW);
    vi.spyOn(DASHBOARD_USER_PRESETS, 'remove').mockReturnValue(false);
    render(<DashboardGallery view={DEFAULT_DASHBOARD_VIEW} apply={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Mine' }));
    expect(messages()).toContain('Could not delete the preset.');
  });

  it('in the dashboard settings presets', () => {
    saveDashboardPreset('Mine', DEFAULT_DASHBOARD_VIEW);
    vi.spyOn(DASHBOARD_USER_PRESETS, 'remove').mockReturnValue(false);
    render(<DashboardSettingsBody />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Mine' }));
    expect(messages()).toContain('Could not delete the preset.');
  });

  it('in saved combinations', () => {
    FEDERATIONS.save('Site', {
      members: [
        { urn: 'urn-a', context: {}, latest: false, hidden: false },
        { urn: 'urn-b', context: {}, latest: false, hidden: false },
      ],
    });
    vi.spyOn(FEDERATIONS, 'remove').mockReturnValue(false);
    render(<ModelsPanel adapter={null} onOpenFederation={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Site' }));
    expect(messages()).toContain('Could not delete the combination.');
  });
});
