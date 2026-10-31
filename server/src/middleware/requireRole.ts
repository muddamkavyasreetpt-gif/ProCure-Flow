import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
      });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions for this action.' }
      });
      return;
    }
    next();
  };
}
