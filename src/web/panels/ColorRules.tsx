import { useState } from 'react';
import {
  COLOR_RULE_PRESETS,
  duplicateRulePreset,
} from '../extensions/colorRulePresets.js';
import {
  type ColorRule,
  FALLBACK_LABEL,
  MAX_RULES,
  type RuleOp,
  type RuleSet,
  sanitizeRuleSet,
} from '../extensions/colorRules.js';
import { OTHER_COLOR } from '../extensions/dashboardData.js';
import { useSavedKindItems } from '../store/savedKinds.js';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { Button } from '../ui/Button.js';
import { Checkbox } from '../ui/Checkbox.js';
import { FieldLabel } from '../ui/Field.js';
import { Input } from '../ui/Input.js';
import { NumberField } from '../ui/NumberField.js';
import { Select, SelectOption } from '../ui/Select.js';

export interface ColorRulesProps {
  value: RuleSet;
  onChange: (next: RuleSet) => void;
  properties: readonly string[];
}

const OPS: readonly { id: RuleOp; label: string }[] = [
  { id: 'equals', label: 'Equals' },
  { id: 'contains', label: 'Contains' },
  { id: 'range', label: 'Range' },
  { id: 'empty', label: 'Is empty' },
];

const NEW_RULE_COLOR = '#ff0000';
let ruleSeq = 0;

function newRuleId(): string {
  ruleSeq += 1;
  return `rule-${Date.now().toString(36)}-${ruleSeq}`;
}

export function ColorRules({ value, onChange, properties }: ColorRulesProps) {
  const presets = useSavedKindItems(COLOR_RULE_PRESETS);
  const [presetName, setPresetName] = useState('');

  const update = (id: string, patch: Partial<ColorRule>) =>
    onChange({
      ...value,
      rules: value.rules.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule,
      ),
    });

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= value.rules.length) return;
    const rules = [...value.rules];
    const [rule] = rules.splice(index, 1);
    if (rule) rules.splice(target, 0, rule);
    onChange({ ...value, rules });
  };

  const add = () => {
    if (value.rules.length >= MAX_RULES) return;
    onChange({
      ...value,
      rules: [
        ...value.rules,
        {
          id: newRuleId(),
          property: properties[0] ?? 'Category',
          op: 'equals',
          value: '',
          min: null,
          max: null,
          color: NEW_RULE_COLOR,
          label: `Rule ${value.rules.length + 1}`,
        },
      ],
    });
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    if (COLOR_RULE_PRESETS.save(name, value)) setPresetName('');
  };

  return (
    <div className="bsh-color-rules">
      <ul className="bsh-color-rules__list">
        {value.rules.map((rule, index) => (
          <li key={rule.id} className="bsh-color-rules__row">
            <div className="bsh-color-rules__fields">
              <Select
                aria-label={`Property for ${rule.label}`}
                value={rule.property}
                onValueChange={(next) => update(rule.id, { property: next })}
              >
                {!properties.includes(rule.property) ? (
                  <SelectOption value={rule.property}>
                    {rule.property}
                  </SelectOption>
                ) : null}
                {properties.map((name) => (
                  <SelectOption key={name} value={name}>
                    {name}
                  </SelectOption>
                ))}
              </Select>
              <Select
                aria-label={`Operator for ${rule.label}`}
                value={rule.op}
                onValueChange={(next) =>
                  update(rule.id, { op: next as RuleOp })
                }
              >
                {OPS.map((op) => (
                  <SelectOption key={op.id} value={op.id}>
                    {op.label}
                  </SelectOption>
                ))}
              </Select>
              {rule.op === 'range' ? (
                <>
                  <FieldLabel layout="inline" variant="quiet">
                    Min
                    <NumberField
                      value={rule.min ?? 0}
                      min={Number.MIN_SAFE_INTEGER}
                      integer={false}
                      onValueCommitted={(min) => update(rule.id, { min })}
                      className="bsh-number--narrow"
                    />
                  </FieldLabel>
                  <FieldLabel layout="inline" variant="quiet">
                    Max
                    <NumberField
                      value={rule.max ?? 0}
                      min={Number.MIN_SAFE_INTEGER}
                      integer={false}
                      onValueCommitted={(max) => update(rule.id, { max })}
                      className="bsh-number--narrow"
                    />
                  </FieldLabel>
                </>
              ) : rule.op === 'empty' ? null : (
                <Input
                  type="text"
                  aria-label={`Value for ${rule.label}`}
                  value={rule.value}
                  onChange={(event) =>
                    update(rule.id, { value: event.target.value })
                  }
                />
              )}
              <input
                type="color"
                aria-label={`Colour for ${rule.label}`}
                value={rule.color}
                onChange={(event) =>
                  update(rule.id, { color: event.target.value })
                }
              />
              <Input
                type="text"
                aria-label={`Label for ${rule.label}`}
                maxLength={80}
                value={rule.label}
                onChange={(event) =>
                  update(rule.id, { label: event.target.value })
                }
              />
            </div>
            <div className="bsh-color-rules__actions">
              <Button
                aria-label={`Move ${rule.label} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                Move up
              </Button>
              <Button
                aria-label={`Move ${rule.label} down`}
                disabled={index === value.rules.length - 1}
                onClick={() => move(index, 1)}
              >
                Move down
              </Button>
              <Button
                aria-label={`Remove ${rule.label}`}
                onClick={() =>
                  onChange({
                    ...value,
                    rules: value.rules.filter((item) => item.id !== rule.id),
                  })
                }
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="bsh-color-rules__actions">
        <Button disabled={value.rules.length >= MAX_RULES} onClick={add}>
          Add rule
        </Button>
      </div>
      <div className="bsh-color-rules__fields">
        <FieldLabel layout="inline" variant="quiet">
          <Checkbox
            checked={value.fallback !== null}
            onChange={(event) =>
              onChange({
                ...value,
                fallback: event.target.checked ? OTHER_COLOR : null,
              })
            }
          />
          {FALLBACK_LABEL}
        </FieldLabel>
        {value.fallback !== null ? (
          <input
            type="color"
            aria-label={`${FALLBACK_LABEL} colour`}
            value={value.fallback}
            onChange={(event) =>
              onChange({ ...value, fallback: event.target.value })
            }
          />
        ) : null}
        <FieldLabel layout="inline" variant="quiet">
          <Checkbox
            checked={value.ghostRest}
            onChange={(event) =>
              onChange({ ...value, ghostRest: event.target.checked })
            }
          />
          Ghost the rest
        </FieldLabel>
      </div>
      <div className="bsh-color-rules__presets">
        <Select
          className="bsh-select"
          aria-label="Preset"
          value=""
          onChange={(event) => {
            const item = presets.find(
              (preset) => preset.id === event.target.value,
            );
            if (!item) return;
            const next = sanitizeRuleSet(item.data);
            if (next) onChange(next);
          }}
        >
          <SelectOption value="">Load a preset…</SelectOption>
          {presets.map((item) => (
            <SelectOption key={item.id} value={item.id}>
              {item.name}
            </SelectOption>
          ))}
        </Select>
        <Input
          type="text"
          aria-label="Preset name"
          placeholder="Name these rules"
          maxLength={MAX_NAME_LENGTH}
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
        />
        <Button disabled={!presetName.trim()} onClick={savePreset}>
          Save preset
        </Button>
      </div>
      {presets.length > 0 ? (
        <ul className="bsh-color-rules__presets">
          {presets.map((item) => (
            <li key={item.id} className="bsh-color-rules__presets">
              <span>{item.name}</span>
              <Button
                aria-label={`Duplicate ${item.name}`}
                onClick={() => duplicateRulePreset(item.id)}
              >
                Duplicate
              </Button>
              <Button
                aria-label={`Delete ${item.name}`}
                onClick={() => COLOR_RULE_PRESETS.remove(item.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings__hint">No saved rule presets yet.</p>
      )}
    </div>
  );
}
