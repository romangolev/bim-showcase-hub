import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Field, FieldLabel } from './Field.js';
import { Select, SelectOption } from './Select.js';

describe('Select', () => {
  it('is a native select that reports the chosen value', () => {
    const onValueChange = vi.fn();
    render(
      <Select
        aria-label="Density"
        value="comfortable"
        onValueChange={onValueChange}
        className="app-width"
      >
        <SelectOption value="comfortable">Comfortable</SelectOption>
        <SelectOption value="compact">Compact</SelectOption>
        <SelectOption value="hidden" disabled>
          Hidden
        </SelectOption>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Density' });
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveAttribute('data-slot', 'select');
    expect(select).toHaveClass('min-h-hit', 'border-line-strong', 'app-width');
    expect(select).toHaveValue('comfortable');
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Comfortable',
      'Compact',
      'Hidden',
    ]);
    expect(options[0]).toHaveAttribute('data-slot', 'select-option');
    expect(options[2]).toBeDisabled();
    fireEvent.change(select, { target: { value: 'compact' } });
    expect(onValueChange).toHaveBeenCalledWith('compact');
  });

  it('takes its name from a field label and honours disabled', () => {
    render(
      <Field layout="row">
        <FieldLabel>Units</FieldLabel>
        <Select disabled defaultValue="mm">
          <SelectOption value="mm">Millimetres</SelectOption>
        </Select>
      </Field>,
    );
    expect(screen.getByRole('combobox', { name: 'Units' })).toBeDisabled();
  });
});
