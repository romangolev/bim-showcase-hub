import { useState } from 'react';

export interface NumberFieldProps {
  value: number;
  min: number;
  max?: number;
  onCommit: (value: number) => void;
  className?: string;
  id?: string;
}

export function NumberField({
  value,
  min,
  max = Number.POSITIVE_INFINITY,
  onCommit,
  className,
  id,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = Math.floor(Number(draft));
    setDraft(null);
    if (draft.trim() === '' || !Number.isFinite(parsed)) return;
    onCommit(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <input
      id={id}
      type="number"
      min={min}
      max={Number.isFinite(max) ? max : undefined}
      className={className}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
