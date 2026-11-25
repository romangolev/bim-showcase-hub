import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Field,
  FieldContent,
  FieldError,
  FieldHint,
  FieldLabel,
  FieldTitle,
} from './Field.js';
import { Input } from './Input.js';
import { Textarea } from './Textarea.js';

describe('Field', () => {
  it('wires the label, the hint and the error to the control', () => {
    render(
      <Field layout="row" invalid>
        <FieldLabel>Name</FieldLabel>
        <Input />
        <FieldHint>Shown in the title</FieldHint>
        <FieldError>Required</FieldError>
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAccessibleDescription('Shown in the title Required');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const field = input.closest('[data-slot="field"]');
    expect(field).toHaveAttribute('data-layout', 'row');
    expect(field).toHaveAttribute('data-invalid');
    expect(field).toHaveClass('field-row', 'grid');
    expect(screen.getByText('Required')).toHaveClass('text-danger');
  });

  it('describes nothing when the field has no hint', () => {
    render(
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Textarea />
      </Field>,
    );
    const area = screen.getByRole('textbox', { name: 'Name' });
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).not.toHaveAttribute('aria-describedby');
    expect(area).not.toHaveAttribute('aria-invalid');
    expect(area.closest('[data-slot="field"]')).toHaveClass('flex-col');
  });

  it('takes the control id from the caller and swaps its element', () => {
    render(
      <Field controlId="given" render={<fieldset />} layout="wrap">
        <FieldLabel>Name</FieldLabel>
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('id', 'given');
    expect(input.closest('[data-slot="field"]')?.tagName).toBe('FIELDSET');
  });

  it('describes a group field on its root and leaves its controls alone', () => {
    render(
      <Field group render={<fieldset />} layout="wrap">
        <legend>Columns</legend>
        <FieldLabel layout="inline">
          <Input aria-label="A" />
        </FieldLabel>
        <FieldLabel layout="inline">
          <Input aria-label="B" />
        </FieldLabel>
        <FieldHint>Pick any</FieldHint>
      </Field>,
    );
    const group = screen.getByRole('group', { name: 'Columns' });
    expect(group).toHaveAccessibleDescription('Pick any');
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).not.toHaveAttribute('id');
      expect(input).not.toHaveAttribute('aria-describedby');
    }
  });

  it('keeps the ids a caller wrote on the control and on the hint', () => {
    render(
      <Field>
        <Input aria-label="Name" id="own" aria-describedby="other" />
        <FieldHint id="own-hint">Hint</FieldHint>
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('id', 'own');
    expect(input).toHaveAttribute('aria-describedby', 'other');
    expect(screen.getByText('Hint')).toHaveAttribute('id', 'own-hint');
  });

  it('lets a label be the row that wraps its text and its control', () => {
    render(
      <FieldLabel layout="between" variant="quiet" className="app-row">
        <FieldContent>
          <FieldTitle>Compact rows</FieldTitle>
          <FieldHint>Less padding</FieldHint>
        </FieldContent>
        <Input aria-label="Compact rows" />
      </FieldLabel>,
    );
    const label = screen
      .getByRole('textbox', { name: 'Compact rows' })
      .closest('label');
    expect(label).toHaveAttribute('data-slot', 'field-label');
    expect(label).toHaveAttribute('data-layout', 'between');
    expect(label).not.toHaveAttribute('for');
    expect(label).toHaveClass('justify-between', 'min-h-hit', 'app-row');
    expect(label).toHaveClass('text-13', 'text-fg-subtle');
    expect(screen.getByText('Less padding')).toHaveClass('text-fg-disabled');
  });
});

describe('Input', () => {
  it('is a native input with the field look and the caller class last', () => {
    render(<Input type="search" aria-label="Find" className="app-width" />);
    const input = screen.getByRole('searchbox', { name: 'Find' });
    expect(input).toHaveAttribute('data-slot', 'input');
    expect(input).toHaveClass('min-h-hit', 'border-line-strong', 'app-width');
  });

  it('passes the placeholder and the disabled state through', () => {
    render(<Input aria-label="Find" placeholder="Type here" disabled />);
    const input = screen.getByPlaceholderText('Type here');
    expect(input).toBeDisabled();
  });
});

describe('Textarea', () => {
  it('shares the input look', () => {
    render(<Textarea aria-label="Notes" rows={3} />);
    const area = screen.getByRole('textbox', { name: 'Notes' });
    expect(area).toHaveAttribute('data-slot', 'textarea');
    expect(area).toHaveAttribute('rows', '3');
    expect(area).toHaveClass('min-h-hit', 'bg-surface-raised');
  });
});
