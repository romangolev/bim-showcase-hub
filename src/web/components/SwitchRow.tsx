import { useId } from 'react';

export interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}

export function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: SwitchRowProps) {
  const hintId = useId();
  return (
    <label className="switch-row">
      <span className="switch-row__text">
        <span className="switch-row__label">{label}</span>
        {description ? (
          <span id={hintId} className="switch-row__hint">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        aria-label={label}
        aria-describedby={description ? hintId : undefined}
        onChange={onChange}
      />
    </label>
  );
}
