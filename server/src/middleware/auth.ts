import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { supabase } from '../db/supabase';
import { UserRole } from '../types';

export interface AuthUser {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  departmentId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' }
    });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as {
      sub?: string;
      userId?: string;
      email?: string;
      role?: UserRole;
      departmentId?: string;
    };

    const uid = decoded.sub || decoded.userId;
    if (!uid) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid token payload.' }
      });
      return;
    }

    // Re-load user from DB to honour role changes
    const { data: dbUser } = await supabase
      .from('users')
      .select('id, email, full_name, role, department_id')
      .eq('id', uid)
      .maybeSingle();

    if (!dbUser) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'User account no longer exists.' }
      });
      return;
    }

    req.user = {
      id: dbUser.id,
      userId: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      role: dbUser.role as UserRole,
      departmentId: dbUser.department_id
    };
    next();
  } catch {
    res.status(401).json({
      error: { code: 'TOKEN_EXPIRED', message: 'Token is invalid or expired. Please log in again.' }
    });
  }
}
