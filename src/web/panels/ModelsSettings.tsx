import { recallModel } from '../api/modelStore.js';
import type { ModalBodyProps, ModalDefinition } from '../modal/types.js';
import { Button } from '../ui/Button.js';
import { usePublishedAdapter } from '../viewer/activeAdapterStore.js';
import { useModels } from '../viewer/useModels.js';
import { saveModelSetPrompt } from './ModelSets.js';

export const MODELS_SETTINGS_ID = 'models-settings';

export function ModelsSettingsBody({ close }: ModalBodyProps) {
  const urns = useModels(usePublishedAdapter()).map((model) => model.id);
  return (
    <div className="settings">
      <section
        className="settings__section"
        aria-labelledby="models-settings-sets"
      >
        <h3 id="models-settings-sets" className="settings__heading">
          Model sets
        </h3>
        <p className="settings__hint">
          {urns.length > 0
            ? 'Save the models of the active viewer as a model set. Documents home lists it and opens them together again.'
            : 'Open a model to save it as a model set.'}
        </p>
        <div className="settings__actions">
          <Button
            disabled={urns.length === 0}
            onClick={() => {
              close();
              saveModelSetPrompt(
                urns.map((urn) => ({ urn, context: recallModel(urn) ?? {} })),
              );
            }}
          >
            Save as model set
          </Button>
        </div>
      </section>
    </div>
  );
}

export const MODELS_SETTINGS_MODAL: ModalDefinition = {
  id: MODELS_SETTINGS_ID,
  title: 'Models settings',
  size: 'sm',
  Body: ModelsSettingsBody,
};
