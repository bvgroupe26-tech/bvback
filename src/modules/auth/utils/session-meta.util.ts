import type { Request } from 'express';
import { SessionMeta } from '../types/session.types';

export function extractSessionMeta(req: Request): SessionMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const ipFromForwarded =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]
        : undefined;

  return {
    deviceInfo: req.headers['user-agent'] ?? null,
    ipAddress: ipFromForwarded ?? req.ip ?? req.socket?.remoteAddress ?? null,
  };
}
