import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { IfcSettingsSection } from './IfcSettingsSection.js';
import { SETTINGS_STORAGE_KEY, SettingsProvider } from './index.js';

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  window.localStorage.clear();
});

function renderSection() {
  render(
    <SettingsProvider>
      <IfcSettingsSection />
    </SettingsProvider>,
  );
}

function stored() {
  return JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
}

describe('IfcSettingsSection', () => {
  it('edits a text field and persists it', () => {
    renderSection();
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Tower' },
    });
    expect(stored().ifc.projectName).toBe('Tower');
  });

  it('changes the length unit', () => {
    renderSection();
    fireEvent.change(screen.getByLabelText('Length unit'), {
      target: { value: 'mm' },
    });
    expect(stored().ifc.lengthUnit).toBe('mm');
  });

  it('commits a group list on blur and keeps commas while typing', () => {
    renderSection();
    const field = screen.getByLabelText('Exclude property groups');
    fireEvent.change(field, { target: { value: 'Dimensions, ' } });
    expect(field).toHaveValue('Dimensions, ');
    fireEvent.blur(field);
    expect(stored().ifc.psetExclude).toEqual(['Dimensions']);
  });

  it('adds and removes a class override', () => {
    renderSection();
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Revit Walls' },
    });
    fireEvent.change(screen.getByLabelText('IFC class'), {
      target: { value: 'IfcCovering' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add override' }));
    expect(screen.getByText('Revit Walls')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Revit Walls' }));
    expect(screen.queryByText('Revit Walls')).toBeNull();
  });

  it('ignores an empty category when adding', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Add override' }));
    expect(stored().ifc?.classOverrides ?? {}).toEqual({});
  });
});
