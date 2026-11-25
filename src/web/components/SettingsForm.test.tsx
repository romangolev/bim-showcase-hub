import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type FormDefinition, SettingsForm } from './SettingsForm.js';

interface Demo {
  on: boolean;
  count: number;
  mode: string;
  name: string;
  shown: string[];
  tags: string[];
}

const FORM: FormDefinition<Demo> = {
  title: 'Demo',
  intro: 'Intro text',
  fields: [
    { key: 'on', kind: 'toggle', label: 'Enabled' },
    { key: 'count', kind: 'number', label: 'Count', min: 1, max: 5 },
    {
      key: 'mode',
      kind: 'select',
      label: 'Mode',
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ],
    },
    { key: 'name', kind: 'text', label: 'Name' },
    {
      key: 'shown',
      kind: 'multi',
      label: 'Columns',
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
        { value: 'z', label: 'Z' },
      ],
    },
    {
      key: 'tags',
      kind: 'list',
      label: 'Tags',
      itemType: 'text',
      newItem: 'new',
      min: 1,
      max: 2,
      addLabel: 'Add tag',
      itemLabel: (i) => `Tag ${i + 1}`,
      removeLabel: (i) => `Remove tag ${i + 1}`,
    },
  ],
  reset: {
    label: 'Reset demo',
    patch: { count: 2, tags: ['t'] },
  },
};

const VALUE: Demo = {
  on: false,
  count: 3,
  mode: 'a',
  name: 'n',
  shown: ['x', 'z'],
  tags: ['t1'],
};

function setup() {
  const onChange = vi.fn();
  render(<SettingsForm form={FORM} value={VALUE} onChange={onChange} />);
  return onChange;
}

describe('SettingsForm', () => {
  it('renders the title and intro', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Demo' })).toBeTruthy();
    expect(screen.getByText('Intro text')).toBeTruthy();
  });

  it('reports a toggle, select and text patch', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(onChange).toHaveBeenLastCalledWith({ on: true });
    fireEvent.change(screen.getByLabelText('Mode'), {
      target: { value: 'b' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'b' });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'zz' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ name: 'zz' });
  });

  it('commits a number clamped to its range', () => {
    const onChange = setup();
    const input = screen.getByLabelText('Count');
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith({ count: 5 });
  });

  it('toggles multi options in declared order', () => {
    const onChange = setup();
    fireEvent.click(screen.getByLabelText('Y'));
    expect(onChange).toHaveBeenLastCalledWith({ shown: ['x', 'y', 'z'] });
    fireEvent.click(screen.getByLabelText('X'));
    expect(onChange).toHaveBeenLastCalledWith({ shown: ['z'] });
  });

  it('adds up to the max and keeps the minimum of list items', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    expect(onChange).toHaveBeenLastCalledWith({ tags: ['t1', 'new'] });
    const remove = screen.getByRole('button', {
      name: 'Remove tag 1',
    }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Tag 1'), {
      target: { value: 'q' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ tags: ['q'] });
  });

  it('gives multi and list rows unique ids and describes the group once', () => {
    const form: FormDefinition<Demo> = {
      fields: [
        {
          key: 'shown',
          kind: 'multi',
          label: 'Columns',
          hint: 'Pick columns',
          options: [
            { value: 'w', label: 'W' },
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ],
        },
        {
          key: 'tags',
          kind: 'list',
          label: 'Tags',
          hint: 'Tag hint',
          itemType: 'text',
          newItem: 'new',
          addLabel: 'Add tag',
          itemLabel: (i) => `Tag ${i + 1}`,
          removeLabel: (i) => `Remove tag ${i + 1}`,
        },
      ],
    };
    const { container } = render(
      <SettingsForm
        form={form}
        value={{ ...VALUE, tags: ['a', 'b', 'c'] }}
        onChange={vi.fn()}
      />,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box).not.toHaveAttribute('aria-describedby');
    }
    expect(
      screen.getByRole('group', { name: 'Columns' }),
    ).toHaveAccessibleDescription('Pick columns');
    const tags = screen.getByRole('group', { name: 'Tags' });
    expect(tags).toHaveAccessibleDescription('Tag hint');
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).not.toHaveAttribute('aria-describedby');
    }
  });

  it('applies the reset patch', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(onChange).toHaveBeenLastCalledWith({ count: 2, tags: ['t'] });
  });
});

describe('SettingsForm with missing or stale values', () => {
  it('falls back to the first option, the minimum and an empty text', () => {
    const form: FormDefinition<Demo> = {
      fields: [
        { key: 'count', kind: 'number', label: 'Count', min: 2, max: 5 },
        {
          key: 'level',
          kind: 'number',
          label: 'Level',
          min: 3,
          max: 9,
          slider: { step: 1, format: (v) => `${v}x` },
        },
        {
          key: 'mode',
          kind: 'select',
          label: 'Mode',
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
          ],
        },
        { key: 'name', kind: 'text', label: 'Name' },
      ],
    };
    const { rerender } = render(
      <SettingsForm form={form} value={{} as Demo} onChange={vi.fn()} />,
    );
    expect((screen.getByLabelText('Mode') as HTMLSelectElement).value).toBe(
      'a',
    );
    expect(screen.getByLabelText(/Level/)).toHaveValue('3');
    expect(screen.getByLabelText('Name')).toHaveValue('');
    rerender(
      <SettingsForm
        form={form}
        value={{ mode: 'gone', count: 'x', level: null } as unknown as Demo}
        onChange={vi.fn()}
      />,
    );
    expect((screen.getByLabelText('Mode') as HTMLSelectElement).value).toBe(
      'a',
    );
    expect(screen.getByLabelText(/Level/)).toHaveValue('3');
  });
});
