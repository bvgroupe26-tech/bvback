import * as cookieParser from 'cookie-parser';
import type { RequestHandler } from 'express';

/**
 * Initialise cookie-parser (CommonJS : export = fonction ou export default).
 * Évite req.cookies vide quand `cookieParser.default()` est undefined à l'exécution.
 */
export function cookieParserMiddleware(): RequestHandler {
  const mod = cookieParser as typeof cookieParser & {
    default?: () => RequestHandler;
  };

  if (typeof mod === 'function') {
    return (mod as unknown as () => RequestHandler)();
  }

  if (typeof mod.default === 'function') {
    return mod.default();
  }

  throw new Error('Impossible d\'initialiser cookie-parser');
}
