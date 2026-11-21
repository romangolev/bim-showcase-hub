import { defineSavedKind } from '../store/savedKinds.js';
import { type ReportOptions, sanitizeReportOptions } from './report.js';

export const REPORT_TEMPLATES = defineSavedKind<ReportOptions>({
  kind: 'report-template',
  version: 1,
  label: 'Report template',
  sanitize: sanitizeReportOptions,
});
