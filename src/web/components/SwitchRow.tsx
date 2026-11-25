import { useId } from 'react';
import {
  FieldContent,
  FieldHint,
  FieldLabel,
  FieldTitle,
} from '../ui/Field.js';
import { Switch } from '../ui/Switch.js';

export interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}

export function SwitchRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: SwitchRowProps) {
  const hintId = useId();
  return (
    <FieldLabel layout="between">
      <FieldContent>
        <FieldTitle>{label}</FieldTitle>
        {description ? <FieldHint id={hintId}>{description}</FieldHint> : null}
      </FieldContent>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={label}
        aria-describedby={description ? hintId : undefined}
        onCheckedChange={onChange}
      />
    </FieldLabel>
  );
}
