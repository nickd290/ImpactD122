import type { Request, Response, NextFunction } from 'express';

export function requireOwnerHubAuth(req: Request, res: Response, next: NextFunction) {
  const token = process.env.OWNER_HUB_TOKEN;
  if (!token) {
    return res
      .status(503)
      .json({ error: 'OWNER_HUB_TOKEN not configured on this service' });
  }
  const header = req.headers.authorization ?? '';
  if (header !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
