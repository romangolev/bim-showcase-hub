import type { ModelContext } from '../api/modelContext.js';
import { listRecentModels } from '../api/modelStore.js';
import { modelTabTitle } from '../api/modelTitles.js';
import { readSettings } from '../settings/settings.js';
import type { Command } from './types.js';

export function recentModelCommands(
  openModel: (urn: string, context: ModelContext) => void,
  models: ReadonlyArray<{ urn: string } & ModelContext> = listRecentModels(),
): Command[] {
  return models
    .slice(0, readSettings().recentsLength)
    .map(({ urn, ...context }) => ({
      id: `model.recent.${urn}`,
      title: `Open ${modelTabTitle(urn, context).label}`,
      group: 'Recent models',
      keywords: 'jump recent model',
      icon: 'model',
      run: () => openModel(urn, context),
    }));
}
