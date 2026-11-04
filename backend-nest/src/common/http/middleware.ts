import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence in depth (cookies are already SameSite=Strict):
 * state-changing requests from browsers must come from an allowed origin.
 * Non-browser clients (no Origin / Sec-Fetch-Site) carry no victim cookies.
 */
export function originCheck(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!UNSAFE.has(req.method)) return next();
    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite === 'cross-site' || (origin !== undefined && !allowed.has(origin))) {
      res.status(403).json({ detail: 'Origem não permitida' });
      return;
    }
    next();
  };
}

/** Correlation id + one structured line per request. Never logs query strings, bodies or secrets. */
export function requestLogger() {
  const logger = new Logger('HTTP');
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const entry = { msg: 'request', requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs) };
      if (res.statusCode >= 500) logger.error(entry);
      else if (req.path !== '/health' && req.path !== '/health/live') logger.log(entry);
    });
    next();
  };
}

/** Converts body-parser failures (raised before Nest routing) into the { detail } contract. */
export function bodyParserErrors() {
  return (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const type = (err as { type?: string } | null)?.type;
    if (type === 'entity.too.large') {
      res.status(413).json({ detail: 'A requisição excede 6 MB.' });
      return;
    }
    if (type === 'entity.parse.failed' || type === 'encoding.unsupported' || type === 'charset.unsupported') {
      res.status(422).json({ detail: 'Confira os campos e seus limites.' });
      return;
    }
    next(err);
  };
}

/** Rejects request bodies with content types the API never accepts (defence against form-based CSRF). */
export function contentTypeGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!UNSAFE.has(req.method)) return next();
    const length = Number(req.headers['content-length'] ?? 0);
    const hasBody = length > 0 || req.headers['transfer-encoding'] !== undefined;
    if (!hasBody) return next();
    const type = (req.headers['content-type'] ?? '').toLowerCase();
    const json = type.startsWith('application/json');
    const multipart = type.startsWith('multipart/form-data') && req.method === 'POST' && req.path === '/tickets';
    if (!json && !multipart) {
      res.status(415).json({ detail: 'Tipo de conteúdo não permitido.' });
      return;
    }
    next();
  };
}
