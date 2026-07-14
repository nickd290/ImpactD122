import type { Request, Response, NextFunction } from 'express';

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * Gate for /api/* (after public portal/webhook routes).
 *
 * Behavior:
 * - If INTERNAL_API_SECRET is unset → open (warn once). Needed so the SPA
 *   (which only sends Bearer when VITE_INTERNAL_API_SECRET was baked at build)
 *   does not brick Jobs to 0 with "Server auth not configured".
 * - If set → require Authorization: Bearer <same secret>.
 */
let warnedOpen = false;

export function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_API_SECRET) {
    if (!warnedOpen) {
      console.warn(
        '[auth] INTERNAL_API_SECRET not set — /api is open. Set INTERNAL_API_SECRET + rebuild client with VITE_INTERNAL_API_SECRET to lock.'
      );
      warnedOpen = true;
    }
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  if (token !== INTERNAL_API_SECRET) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  next();
}
