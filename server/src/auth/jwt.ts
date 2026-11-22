import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser, expiresIn: string = '7d'): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
    },
    config.jwtSecret,
    { expiresIn } as any
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as any;
    if (!payload || !payload.sub) return null;
    return {
      id: payload.sub,
      username: payload.username,
      displayName: payload.displayName,
    };
  } catch (err) {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7);
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
    return;
  }

  req.user = user;
  next();
}
