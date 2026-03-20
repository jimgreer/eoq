import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

/**
 * CSRF protection middleware - requires X-Requested-With header on state-changing requests.
 * Browsers block cross-origin JavaScript from setting custom headers without CORS approval,
 * so if this header is present, the request came from an allowed origin.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safeMethod) {
    return next();
  }

  const xRequestedWith = req.headers['x-requested-with'];
  if (xRequestedWith !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!(req.user as any).is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
