import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/index.js';
import { signToken, requireAuth, AuthenticatedRequest } from '../auth/jwt.js';

export const authRouter = Router();

// Rate limiter for auth endpoints: 20 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  displayName: z.string().min(1).max(50),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// POST /api/auth/register
authRouter.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { username, displayName, password } = parseResult.data;

    // Check if username already exists
    const existing = await query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    if (existing.rowCount > 0) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await query(
      'INSERT INTO users (id, username, display_name, password_hash) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id, username, display_name',
      [username.toLowerCase(), displayName.trim(), passwordHash]
    );

    const user = result.rows[0];
    const token = signToken({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
      },
    });
  } catch (err: any) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// POST /api/auth/login
authRouter.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid username or password' });
      return;
    }

    const { username, password } = parseResult.data;

    const result = await query(
      'SELECT id, username, display_name, password_hash FROM users WHERE username = $1',
      [username.toLowerCase()]
    );

    if (result.rowCount === 0) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const token = signToken({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
      },
    });
  } catch (err: any) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({ user: req.user });
});
