import { useRender } from '@base-ui/react/use-render';
import {
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { cn } from './cn.js';
import type { CommonProps } from './types.js';

const layouts = {
  stack: 'flex flex-col gap-1',
  row: 'field-row grid items-center gap-x-4 gap-y-1 text-fg',
  inline: 'inline-flex min-w-0 items-center gap-2',
  between:
    'flex min-h-hit cursor-pointer items-center justify-between gap-3 has-disabled:cursor-not-allowed has-disabled:text-fg-disabled',
  wrap: 'flex flex-wrap gap-x-4 gap-y-1',
};

const variants = {
  default: '',
  quiet: 'font-label text-13 text-fg-subtle',
};

export interface FieldStyleProps {
  layout?: keyof typeof layouts;
  variant?: keyof typeof variants;
}

type Part = 'hint' | 'error';

interface FieldState {
  controlId: string;
  hintId: string;
  errorId: string;
  hint: boolean;
  error: boolean;
  invalid: boolean;
  group: boolean;
  mark: (part: Part, present: boolean) => void;
}

const FieldContext = createContext<FieldState | null>(null);

export type FieldProps = Omit<ComponentProps<'div'>, 'className'> &
  CommonProps &
  FieldStyleProps & {
    controlId?: string;
    invalid?: boolean;
    group?: boolean;
    render?: useRender.RenderProp;
  };

export function Field({
  className,
  effect,
  layout = 'stack',
  variant = 'default',
  controlId,
  invalid = false,
  group = false,
  render,
  ref,
  ...props
}: FieldProps) {
  const id = useId();
  const [parts, setParts] = useState({ hint: false, error: false });
  const mark = useCallback(
    (part: Part, present: boolean) =>
      setParts((current) =>
        current[part] === present ? current : { ...current, [part]: present },
      ),
    [],
  );
  const state = useMemo(
    () => ({
      controlId: controlId ?? `${id}-control`,
      hintId: `${id}-hint`,
      errorId: `${id}-error`,
      hint: parts.hint,
      error: parts.error,
      invalid,
      group,
      mark,
    }),
    [controlId, id, parts.hint, parts.error, invalid, group, mark],
  );
  const element = useRender({
    render,
    ref,
    props: {
      ...props,
      'aria-describedby': group
        ? describe(props['aria-describedby'], state)
        : props['aria-describedby'],
      'data-slot': 'field',
      'data-layout': layout,
      'data-variant': variant,
      'data-invalid': invalid ? '' : undefined,
      'data-effect': effect,
      className: cn(layouts[layout], variants[variant], className),
    },
  });
  return <FieldContext.Provider value={state}>{element}</FieldContext.Provider>;
}

export type FieldLabelProps = Omit<ComponentProps<'label'>, 'className'> &
  CommonProps &
  FieldStyleProps;

export function FieldLabel({
  className,
  effect,
  layout,
  variant = 'default',
  htmlFor,
  ...props
}: FieldLabelProps) {
  const field = useContext(FieldContext);
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the caller passes the text and the control, or the field wires htmlFor
    <label
      {...props}
      htmlFor={
        htmlFor ?? (layout || field?.group ? undefined : field?.controlId)
      }
      data-slot="field-label"
      data-layout={layout}
      data-variant={variant}
      data-effect={effect}
      className={cn(layout && layouts[layout], variants[variant], className)}
    />
  );
}

export type FieldPartProps = Omit<ComponentProps<'span'>, 'className'> &
  CommonProps;

export function FieldContent({ className, effect, ...props }: FieldPartProps) {
  return (
    <span
      {...props}
      data-slot="field-content"
      data-effect={effect}
      className={cn('flex flex-col', className)}
    />
  );
}

export function FieldTitle({ className, effect, ...props }: FieldPartProps) {
  return (
    <span
      {...props}
      data-slot="field-title"
      data-effect={effect}
      className={cn(className)}
    />
  );
}

function usePart(part: Part, id: string | undefined): string | undefined {
  const field = useContext(FieldContext);
  const mark = field?.mark;
  const own = id !== undefined;
  useLayoutEffect(() => {
    if (own) return;
    mark?.(part, true);
    return () => mark?.(part, false);
  }, [mark, part, own]);
  return id ?? field?.[`${part}Id`];
}

export function FieldHint({ className, effect, id, ...props }: FieldPartProps) {
  return (
    <span
      {...props}
      id={usePart('hint', id)}
      data-slot="field-hint"
      data-effect={effect}
      className={cn('text-13 text-fg-disabled', className)}
    />
  );
}

export function FieldError({
  className,
  effect,
  id,
  ...props
}: FieldPartProps) {
  return (
    <span
      {...props}
      id={usePart('error', id)}
      data-slot="field-error"
      data-effect={effect}
      className={cn('text-13 text-danger', className)}
    />
  );
}

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: ComponentProps<'input'>['aria-invalid'];
}

function describe(own: string | undefined, field: FieldState) {
  return (
    [
      own,
      field.hint ? field.hintId : undefined,
      field.error ? field.errorId : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  );
}

export function useFieldControl<P extends ControlProps>(props: P): P {
  const field = useContext(FieldContext);
  if (!field || field.group) return props;
  return {
    ...props,
    id: props.id ?? field.controlId,
    'aria-describedby': describe(props['aria-describedby'], field),
    'aria-invalid': props['aria-invalid'] ?? (field.invalid || undefined),
  };
}
