import { useId, useState } from 'react';
import type { Vec3 } from '../../shared/combined.js';
import { useSettings } from '../settings/SettingsContext.js';
import type { Language } from '../settings/settings.js';
import { Button } from '../ui/Button.js';
import { ToggleButton } from '../ui/ToggleButton.js';
import { nudgeOffset, resetOffset, snapToAnchor } from '../viewer/alignment.js';
import { formatKm, type ModelInfo, metersPerUnit } from '../viewer/modelSet.js';
import type { PlacementInfo } from '../viewer/placement.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

export const VISUAL_ONLY_NOTE =
  'Visual only. The files and their coordinates do not change.';

export const ALIGNMENT_STEPS = [0.1, 1, 10] as const;

const AXES = [
  { axis: 0, name: 'X' },
  { axis: 1, name: 'Y' },
  { axis: 2, name: 'Z' },
] as const;

function stepLabel(meters: number): string {
  return `${meters} m`;
}

function sharedLabel(value: boolean | null): string {
  if (value === null) return 'unknown';
  return value ? 'yes' : 'no';
}

function distanceLabel(
  distanceMeters: number | null,
  language: Language,
): string {
  if (distanceMeters === null) return 'unknown';
  return `${formatKm(distanceMeters, language)} km`;
}

export interface ModelAlignmentProps {
  adapter: ViewerAdapter | null;
  model: ModelInfo;
  info: PlacementInfo | null;
  anchorName: string | null;
  anchorUnit?: string | null;
  offsets?: Readonly<Record<string, Vec3>> | null;
  onOffsetsChange?: (next: Record<string, Vec3> | null) => void;
}

export function ModelAlignment({
  adapter,
  model,
  info,
  anchorName,
  anchorUnit = null,
  offsets,
  onOffsetsChange,
}: ModelAlignmentProps) {
  const { language } = useSettings().settings;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<number>(1);
  const bodyId = useId();
  const noteId = useId();
  const anchor = info?.anchor === true;
  const unitMeters = metersPerUnit(anchorUnit);
  const disabled = !onOffsetsChange;
  const change = (next: Record<string, Vec3> | null) => {
    if (!onOffsetsChange) return;
    adapter?.setModelOffsets(next);
    onOffsetsChange(next);
  };
  return (
    <div className="bsh-models__alignment">
      <Button
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
      >
        Alignment for {model.name}
      </Button>
      {open ? (
        <div id={bodyId} className="bsh-models__alignment-body">
          <p id={noteId} className="settings__hint">
            {VISUAL_ONLY_NOTE}
          </p>
          <p className="settings__hint">Unit: {info?.unit ?? 'unknown'}</p>
          <p className="settings__hint">
            Shared coordinates: {sharedLabel(info?.sharedCoordinates ?? null)}
          </p>
          <p className="settings__hint">
            {anchor
              ? 'Anchor'
              : `Distance from ${anchorName ?? 'the anchor'}: ${distanceLabel(info?.distanceMeters ?? null, language)}`}
          </p>
          {anchor ? null : (
            <>
              <div className="bsh-models__tools">
                {ALIGNMENT_STEPS.map((meters) => (
                  <ToggleButton
                    key={meters}
                    pressed={step === meters}
                    aria-describedby={noteId}
                    onClick={() => setStep(meters)}
                  >
                    {stepLabel(meters)}
                  </ToggleButton>
                ))}
              </div>
              <div className="bsh-models__tools">
                {AXES.map(({ axis, name }) => (
                  <span key={name} className="bsh-models__tools">
                    <Button
                      aria-label={`Move -${name} ${stepLabel(step)}`}
                      aria-describedby={noteId}
                      disabled={disabled}
                      onClick={() =>
                        change(
                          nudgeOffset(
                            offsets,
                            model.id,
                            axis,
                            -step,
                            unitMeters,
                          ),
                        )
                      }
                    >
                      -{name}
                    </Button>
                    <Button
                      aria-label={`Move +${name} ${stepLabel(step)}`}
                      aria-describedby={noteId}
                      disabled={disabled}
                      onClick={() =>
                        change(
                          nudgeOffset(
                            offsets,
                            model.id,
                            axis,
                            step,
                            unitMeters,
                          ),
                        )
                      }
                    >
                      +{name}
                    </Button>
                  </span>
                ))}
              </div>
              <div className="bsh-models__tools">
                <Button
                  aria-describedby={noteId}
                  disabled={disabled || !adapter}
                  onClick={() => {
                    if (!adapter) return;
                    change(
                      snapToAnchor(
                        offsets,
                        model.id,
                        adapter.getTogetherOffsets(),
                      ),
                    );
                  }}
                >
                  Snap centre to anchor
                </Button>
                <Button
                  aria-describedby={noteId}
                  disabled={disabled}
                  onClick={() => change(resetOffset(offsets, model.id))}
                >
                  Reset
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
