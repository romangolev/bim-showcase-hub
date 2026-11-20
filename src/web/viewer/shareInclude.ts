import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord } from '../storage.js';
import { SHARE_INCLUDE_ALL, type ShareInclude } from './shareLink.js';

export function readShareInclude(raw: unknown): ShareInclude {
  const source = isRecord(raw) ? raw : {};
  return {
    selection: source.selection !== false,
    panes: source.panes !== false,
    nodes: source.nodes !== false,
  };
}

export const SHARE_INCLUDE = defineRecord<ShareInclude>({
  key: BSH_KEYS.preference.shareInclude,
  initial: SHARE_INCLUDE_ALL,
  sanitize: readShareInclude,
});
