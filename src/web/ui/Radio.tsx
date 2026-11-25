import { useRender } from '@base-ui/react/use-render';
import { type ComponentProps, createContext, useContext, useMemo } from 'react';
import { checkClasses } from './Checkbox.js';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

interface GroupState {
  name: string | undefined;
  value: string | undefined;
  onValueChange: ((value: string) => void) | undefined;
}

const GroupContext = createContext<GroupState | null>(null);

export type RadioGroupProps = Omit<
  ComponentProps<'fieldset'>,
  'className' | 'onChange'
> &
  CommonProps & {
    value?: string;
    onValueChange?: (value: string) => void;
    render?: useRender.RenderProp;
  };

export function RadioGroup({
  className,
  effect,
  name,
  value,
  onValueChange,
  render,
  ref,
  ...props
}: RadioGroupProps) {
  const state = useMemo(
    () => ({ name, value, onValueChange }),
    [name, value, onValueChange],
  );
  const element = useRender({
    defaultTagName: 'fieldset',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'radio-group',
      'data-effect': effect,
      className: cn('m-0 min-w-0 border-0 p-0', className),
    },
  });
  return <GroupContext.Provider value={state}>{element}</GroupContext.Provider>;
}

export type RadioProps = Omit<ComponentProps<'input'>, 'className' | 'type'> &
  CommonProps;

export function Radio({
  className,
  effect,
  onChange,
  value,
  ...props
}: RadioProps) {
  const group = useContext(GroupContext);
  const checked =
    group?.value === undefined ? props.checked : group.value === value;
  return (
    <input
      name={group?.name}
      {...props}
      type="radio"
      value={value}
      checked={checked}
      onChange={(event) => {
        onChange?.(event);
        if (event.target.checked) group?.onValueChange?.(String(value));
      }}
      data-slot="radio"
      data-checked={checked ? '' : undefined}
      data-effect={effect}
      className={cn(checkClasses, className)}
    />
  );
}
