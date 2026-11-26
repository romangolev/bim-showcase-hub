import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '../shared/types.js';

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export class RateLimited extends HttpError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(429, 'Rate limited');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function retryAfterSeconds(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 120) : 5;
}

function retryAfterOf(err: unknown): number {
  const headers = (
    err as
      | { axiosError?: { response?: { headers?: Record<string, unknown> } } }
      | undefined
  )?.axiosError?.response?.headers;
  return retryAfterSeconds(headers?.['retry-after']);
}

function upstreamStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) {
    return null;
  }
  const candidate = err as { httpStatusCode?: unknown };
  if (typeof candidate.httpStatusCode === 'function') {
    const status = (candidate.httpStatusCode as () => unknown)();
    return typeof status === 'number' ? status : null;
  }
  return null;
}

export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) {
    return err;
  }
  const status = upstreamStatus(err);
  if (status === 404) {
    return new HttpError(404, 'Not found');
  }
  if (status === 429) {
    return new RateLimited(retryAfterOf(err));
  }
  if (status === 401) {
    return new HttpError(401, 'Not authorized');
  }
  if (status === 403) {
    return new HttpError(403, 'Forbidden');
  }
  return new HttpError(502, 'Upstream service error');
}

function clientStatus(err: unknown): number | null {
  if (err instanceof HttpError) {
    return err.status;
  }
  if (typeof err === 'object' && err !== null) {
    const { status, expose } = err as { status?: unknown; expose?: unknown };
    if (
      expose === true &&
      typeof status === 'number' &&
      status >= 400 &&
      status < 500
    ) {
      return status;
    }
  }
  return null;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = clientStatus(err);
  if (status === null) {
    const label = err instanceof Error ? err.name : typeof err;
    console.error(`unhandled error: ${label}`);
    const body: ApiError = { error: 'Internal server error' };
    res.status(500).json(body);
    return;
  }
  const message =
    err instanceof HttpError
      ? err.message
      : ((err as { message?: string }).message ?? 'Bad request');
  if (err instanceof RateLimited) {
    res.set('Retry-After', String(err.retryAfterSeconds));
  }
  const body: ApiError = { error: message };
  if (err instanceof HttpError && err.code) body.code = err.code;
  res.status(status).json(body);
}
