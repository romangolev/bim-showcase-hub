import { useState } from 'react';
import { NumberField } from '../components/NumberField.js';
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
              <select
                className="bsh-select"
                aria-label={`Property for ${rule.label}`}
                value={rule.property}
                onChange={(event) =>
                  update(rule.id, { property: event.target.value })
                }
              >
                {!properties.includes(rule.property) ? (
                  <option value={rule.property}>{rule.property}</option>
                ) : null}
                {properties.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className="bsh-select"
                aria-label={`Operator for ${rule.label}`}
                value={rule.op}
                onChange={(event) =>
                  update(rule.id, { op: event.target.value as RuleOp })
                }
              >
                {OPS.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.label}
                  </option>
                ))}
              </select>
              {rule.op === 'range' ? (
                <>
                  <label className="bsh-field">
                    Min
                    <NumberField
                      value={rule.min ?? 0}
                      min={Number.MIN_SAFE_INTEGER}
                      onCommit={(min) => update(rule.id, { min })}
                      className="bsh-input bsh-input--narrow"
                    />
                  </label>
                  <label className="bsh-field">
                    Max
                    <NumberField
                      value={rule.max ?? 0}
                      min={Number.MIN_SAFE_INTEGER}
                      onCommit={(max) => update(rule.id, { max })}
                      className="bsh-input bsh-input--narrow"
                    />
                  </label>
                </>
              ) : rule.op === 'empty' ? null : (
                <input
                  type="text"
                  className="bsh-input"
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
              <input
                type="text"
                className="bsh-input"
                aria-label={`Label for ${rule.label}`}
                maxLength={80}
                value={rule.label}
                onChange={(event) =>
                  update(rule.id, { label: event.target.value })
                }
              />
            </div>
            <div className="bsh-color-rules__actions">
              <button
                type="button"
                className="btn"
                aria-label={`Move ${rule.label} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                Move up
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`Move ${rule.label} down`}
                disabled={index === value.rules.length - 1}
                onClick={() => move(index, 1)}
              >
                Move down
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`Remove ${rule.label}`}
                onClick={() =>
                  onChange({
                    ...value,
                    rules: value.rules.filter((item) => item.id !== rule.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="bsh-color-rules__actions">
        <button
          type="button"
          className="btn"
          disabled={value.rules.length >= MAX_RULES}
          onClick={add}
        >
          Add rule
        </button>
      </div>
      <div className="bsh-color-rules__fields">
        <label className="bsh-field">
          <input
            type="checkbox"
            checked={value.fallback !== null}
            onChange={(event) =>
              onChange({
                ...value,
                fallback: event.target.checked ? OTHER_COLOR : null,
              })
            }
          />
          {FALLBACK_LABEL}
        </label>
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
        <label className="bsh-field">
          <input
            type="checkbox"
            checked={value.ghostRest}
            onChange={(event) =>
              onChange({ ...value, ghostRest: event.target.checked })
            }
          />
          Ghost the rest
        </label>
      </div>
      <div className="bsh-color-rules__presets">
        <select
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
          <option value="">Load a preset…</option>
          {presets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="bsh-input"
          aria-label="Preset name"
          placeholder="Name these rules"
          maxLength={MAX_NAME_LENGTH}
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
        />
        <button
          type="button"
          className="btn"
          disabled={!presetName.trim()}
          onClick={savePreset}
        >
          Save preset
        </button>
      </div>
      {presets.length > 0 ? (
        <ul className="bsh-color-rules__presets">
          {presets.map((item) => (
            <li key={item.id} className="bsh-color-rules__presets">
              <span>{item.name}</span>
              <button
                type="button"
                className="btn"
                aria-label={`Duplicate ${item.name}`}
                onClick={() => duplicateRulePreset(item.id)}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`Delete ${item.name}`}
                onClick={() => COLOR_RULE_PRESETS.remove(item.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings__hint">No saved rule presets yet.</p>
      )}
    </div>
  );
}
