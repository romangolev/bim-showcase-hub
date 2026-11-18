import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
  Router,
} from 'express';
import { isRecord } from '../../shared/guards.js';

const MAX_BODY = '8kb';
const WINDOW_MS = 60_000;
const MAX_ENTRIES = 5;
const SAFE = /^[\w.:\-[\]]{1,200}$/;
const KEYWORDS = new Set([
  'inline',
  'eval',
  'data',
  'blob',
  'self',
  'wasm-eval',
]);

export interface CspRouterOptions {
  log?: (line: string) => void;
  now?: () => number;
  maxPerMinute?: number;
}

function directiveOf(value: unknown): string {
  return typeof value === 'string' && /^[a-z-]{1,40}$/.test(value)
    ? value
    : 'unknown';
}

function blockedOf(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  if (KEYWORDS.has(value)) return value;
  try {
    const url = new URL(value);
    const origin = url.origin === 'null' ? url.protocol : url.origin;
    return SAFE.test(origin.replace('//', '')) ? origin : 'unknown';
  } catch {
    return 'unknown';
  }
}

function pathOf(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  try {
    const segment = new URL(value).pathname.split('/')[1] ?? '';
    return SAFE.test(segment) ? `/${segment}` : '/';
  } catch {
    return 'unknown';
  }
}

function entriesOf(body: unknown): Record<string, unknown>[] {
  const list = Array.isArray(body) ? body.slice(0, MAX_ENTRIES) : [body];
  return list.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (isRecord(entry['csp-report'])) {
      const r = entry['csp-report'];
      return [
        {
          directive: r['effective-directive'] ?? r['violated-directive'],
          blocked: r['blocked-uri'],
          document: r['document-uri'],
        },
      ];
    }
    if (entry.type === 'csp-violation' && isRecord(entry.body)) {
      const r = entry.body;
      return [
        {
          directive: r.effectiveDirective ?? r.violatedDirective,
          blocked: r.blockedURL,
          document: r.documentURL,
        },
      ];
    }
    return [];
  });
}

export function cspRouter(options: CspRouterOptions = {}): Router {
  const {
    log = (line) => console.warn(line),
    now = Date.now,
    maxPerMinute = 30,
  } = options;
  let windowStart = 0;
  let count = 0;
  const router = Router();
  const swallow: ErrorRequestHandler = (_err, _req, res, _next) => {
    res.status(204).end();
  };
  router.post(
    '/csp-report',
    express.raw({
      type: ['application/csp-report', 'application/reports+json'],
      limit: MAX_BODY,
    }),
    (req: Request, res: Response) => {
      res.status(204).end();
      if (!Buffer.isBuffer(req.body)) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(req.body.toString('utf8'));
      } catch {
        return;
      }
      for (const entry of entriesOf(parsed)) {
        const time = now();
        if (time - windowStart >= WINDOW_MS) {
          windowStart = time;
          count = 0;
        }
        if (count >= maxPerMinute) return;
        count += 1;
        log(
          `csp-report directive=${directiveOf(entry.directive)} blocked=${blockedOf(entry.blocked)} path=${pathOf(entry.document)}`,
        );
      }
    },
  );
  router.use('/csp-report', swallow);
  return router;
}
