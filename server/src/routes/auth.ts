import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase, rpcAppendAuditLog } from '../db/supabase';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimit';
import { loginSchema, registerSchema } from '../schemas';
import crypto from 'crypto';

const router = Router();

function signToken(user: { id: string; email: string; role: string; department_id: string }): string {
  return jwt.sign(
    {
      sub: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.department_id
    },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
    }
  );
}

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash, full_name, role, department_id')
      .eq('email', email)
      .maybeSingle();

    if (error || !user) {
      res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
      });
      return;
    }

    let isValid = false;
    try {
      isValid = await bcrypt.compare(password, user.password_hash);
    } catch {
      isValid = false;
    }

    if (!isValid) {
      res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
      });
      return;
    }

    const token = signToken(user);

    await rpcAppendAuditLog({
      runId: null,
      actorType: 'user',
      actor: user.email,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
      details: { role: user.role, departmentId: user.department_id }
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        departmentId: user.department_id
      }
    });
  }
);

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password, fullName, departmentId } = req.body;

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      res.status(409).json({
        error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' }
      });
      return;
    }

    const { data: dept } = await supabase
      .from('departments')
      .select('id')
      .eq('id', departmentId)
      .maybeSingle();

    if (!dept) {
      res.status(400).json({
        error: { code: 'INVALID_DEPARTMENT', message: 'Selected department does not exist.' }
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        password_hash: passwordHash,
        full_name: fullName,
        role: 'employee',
        department_id: departmentId
      })
      .select('id, email, full_name, role, department_id')
      .single();

    if (error || !user) {
      res.status(400).json({
        error: { code: 'REGISTRATION_FAILED', message: error?.message || 'Registration failed.' }
      });
      return;
    }

    const token = signToken(user);

    await rpcAppendAuditLog({
      runId: null,
      actorType: 'user',
      actor: user.email,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: user.id,
      details: { role: user.role, departmentId: user.department_id }
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        departmentId: user.department_id
      }
    });
  }
);

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const u = req.user!;
  res.json({
    user: {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      departmentId: u.departmentId
    }
  });
});

export default router;
