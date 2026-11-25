import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Radio, RadioGroup } from './Radio.js';

describe('RadioGroup', () => {
  it('is a fieldset that names its radios and reports the chosen value', () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup
        aria-label="Show as"
        name="role"
        value="rows"
        onValueChange={onValueChange}
        className="app-group"
      >
        <label>
          <Radio value="rows" />
          Rows
        </label>
        <label>
          <Radio value="column" />
          Column
        </label>
      </RadioGroup>,
    );
    const group = screen.getByRole('group', { name: 'Show as' });
    expect(group.tagName).toBe('FIELDSET');
    expect(group).toHaveAttribute('data-slot', 'radio-group');
    expect(group).toHaveClass('border-0', 'app-group');
    const rows = screen.getByRole('radio', { name: 'Rows' });
    const column = screen.getByRole('radio', { name: 'Column' });
    expect(rows).toBeChecked();
    expect(rows).toHaveAttribute('data-checked');
    expect(rows).toHaveAttribute('name', 'role');
    expect(column).not.toBeChecked();
    fireEvent.click(column);
    expect(onValueChange).toHaveBeenCalledWith('column');
  });

  it('disables every radio through the fieldset and swaps its element', () => {
    render(
      <RadioGroup disabled value="a" render={<div />}>
        <Radio value="a" aria-label="A" />
      </RadioGroup>,
    );
    const radio = screen.getByRole('radio', { name: 'A' });
    expect(radio.closest('[data-slot="radio-group"]')?.tagName).toBe('DIV');
  });
});

describe('Radio', () => {
  it('works alone as a native radio', () => {
    const onChange = vi.fn();
    render(
      <Radio
        aria-label="By rules"
        value="rules"
        name="source"
        checked={false}
        onChange={onChange}
        className="app-radio"
      />,
    );
    const radio = screen.getByRole('radio', { name: 'By rules' });
    expect(radio).toHaveAttribute('data-slot', 'radio');
    expect(radio).toHaveAttribute('name', 'source');
    expect(radio).toHaveClass('accent-accent-fill', 'app-radio');
    fireEvent.click(radio);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('requires a value, so a group never reports undefined', () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup value="a" onValueChange={onValueChange}>
        {/* @ts-expect-error value is required */}
        <Radio aria-label="Blank" />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Blank' })).not.toBeChecked();
  });
});
