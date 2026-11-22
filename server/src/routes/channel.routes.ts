import { Router, Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth, AuthenticatedRequest } from '../auth/jwt.js';
import { arbiter } from '../realtime/arbiter.js';
import { config } from '../config.js';

export const channelRouter = Router();

// Apply auth to all channel routes
channelRouter.use(requireAuth);

const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many invite requests. Please try again later.' },
});

const createChannelSchema = z.object({
  name: z.string().min(1).max(50),
});

const createInviteSchema = z.object({
  expiresInHours: z.number().min(1).max(720).optional(), // up to 30 days
});

const joinInviteSchema = z.object({
  code: z.string().min(4).max(64),
});

// GET /api/channels - list user channels
channelRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await query(
      `SELECT c.id, c.name, c.created_by, c.created_at, cm.role,
        (SELECT COUNT(*)::int FROM channel_members WHERE channel_id = c.id) as member_count
       FROM channels c
       JOIN channel_members cm ON c.id = cm.channel_id
       WHERE cm.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );

    res.json({ channels: result.rows });
  } catch (err: any) {
    console.error('[Channels] List error:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// POST /api/channels - create new channel
channelRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = createChannelSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Channel name is required (max 50 chars)' });
      return;
    }

    const userId = req.user!.id;
    const name = parseResult.data.name.trim();

    const channelRes = await query(
      'INSERT INTO channels (id, name, created_by) VALUES (gen_random_uuid(), $1, $2) RETURNING id, name, created_by, created_at',
      [name, userId]
    );
    const channel = channelRes.rows[0];

    // Add creator as owner
    await query(
      'INSERT INTO channel_members (channel_id, user_id, role) VALUES ($1, $2, $3)',
      [channel.id, userId, 'owner']
    );

    res.status(201).json({
      channel: {
        ...channel,
        role: 'owner',
        member_count: 1,
      },
    });
  } catch (err: any) {
    console.error('[Channels] Create error:', err);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// GET /api/channels/:id - get channel details, members, and current speaker
channelRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const channelId = req.params.id;
    const userId = req.user!.id;

    // Verify membership
    const membership = await query(
      'SELECT role FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [channelId, userId]
    );

    if (membership.rowCount === 0) {
      res.status(403).json({ error: 'You are not a member of this channel' });
      return;
    }

    const channelRes = await query(
      'SELECT id, name, created_by, created_at FROM channels WHERE id = $1',
      [channelId]
    );

    if (channelRes.rowCount === 0) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const membersRes = await query(
      `SELECT u.id, u.username, u.display_name, cm.role, cm.joined_at
       FROM channel_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.channel_id = $1
       ORDER BY cm.joined_at ASC`,
      [channelId]
    );

    const currentSpeaker = arbiter.getCurrentSpeaker(channelId);

    res.json({
      channel: channelRes.rows[0],
      userRole: membership.rows[0].role,
      members: membersRes.rows,
      currentSpeaker,
    });
  } catch (err: any) {
    console.error('[Channels] Get detail error:', err);
    res.status(500).json({ error: 'Failed to get channel details' });
  }
});

// POST /api/channels/:id/invites - create a revocable invite link
channelRouter.post('/:id/invites', inviteLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const channelId = req.params.id;
    const userId = req.user!.id;

    // Verify membership
    const membership = await query(
      'SELECT role FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [channelId, userId]
    );

    if (membership.rowCount === 0) {
      res.status(403).json({ error: 'Only channel members can generate invite links' });
      return;
    }

    const parseResult = createInviteSchema.safeParse(req.body);
    const expiresInHours = parseResult.success && parseResult.data.expiresInHours ? parseResult.data.expiresInHours : 168; // 7 days default
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    // Generate random 10-char url-safe code
    const code = crypto.randomBytes(6).toString('base64url');

    const result = await query(
      'INSERT INTO channel_invites (id, channel_id, code, created_by, expires_at) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id, channel_id, code, created_at, expires_at, revoked',
      [channelId, code, userId, expiresAt.toISOString()]
    );

    res.status(201).json({ invite: result.rows[0] });
  } catch (err: any) {
    console.error('[Channels] Create invite error:', err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// GET /api/channels/:id/invites - list active invites for channel
channelRouter.get('/:id/invites', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const channelId = req.params.id;
    const userId = req.user!.id;

    const membership = await query(
      'SELECT role FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [channelId, userId]
    );

    if (membership.rowCount === 0) {
      res.status(403).json({ error: 'You are not a member of this channel' });
      return;
    }

    const result = await query(
      'SELECT id, channel_id, code, created_at, expires_at, revoked FROM channel_invites WHERE channel_id = $1 AND revoked = FALSE ORDER BY created_at DESC',
      [channelId]
    );

    res.json({ invites: result.rows });
  } catch (err: any) {
    console.error('[Channels] List invites error:', err);
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

// DELETE /api/channels/:id/invites/:inviteId - revoke an invite link
channelRouter.delete('/:id/invites/:inviteId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id: channelId, inviteId } = req.params;
    const userId = req.user!.id;

    // Check permissions: either owner of the channel or creator of the invite
    const membership = await query(
      'SELECT role FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [channelId, userId]
    );

    if (membership.rowCount === 0) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await query(
      'UPDATE channel_invites SET revoked = TRUE WHERE id = $1 AND channel_id = $2',
      [inviteId, channelId]
    );

    res.json({ success: true, message: 'Invite link revoked' });
  } catch (err: any) {
    console.error('[Channels] Revoke invite error:', err);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

// POST /api/channels/join-by-invite - join channel via invite code
channelRouter.post('/join-by-invite', inviteLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = joinInviteSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Valid invite code is required' });
      return;
    }

    const { code } = parseResult.data;
    const userId = req.user!.id;

    const inviteRes = await query(
      `SELECT ci.id, ci.channel_id, ci.expires_at, ci.revoked, c.name as channel_name
       FROM channel_invites ci
       JOIN channels c ON ci.channel_id = c.id
       WHERE ci.code = $1`,
      [code.trim()]
    );

    if (inviteRes.rowCount === 0) {
      res.status(404).json({ error: 'Invalid or expired invite link' });
      return;
    }

    const invite = inviteRes.rows[0];

    if (invite.revoked) {
      res.status(410).json({ error: 'This invite link has been revoked by the channel owner' });
      return;
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      res.status(410).json({ error: 'This invite link has expired' });
      return;
    }

    // Check if user is already a member
    const existingMember = await query(
      'SELECT role FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [invite.channel_id, userId]
    );

    if (existingMember.rowCount > 0) {
      res.json({
        success: true,
        alreadyMember: true,
        channelId: invite.channel_id,
        channelName: invite.channel_name,
      });
      return;
    }

    // Add user as member
    await query(
      'INSERT INTO channel_members (channel_id, user_id, role) VALUES ($1, $2, $3)',
      [invite.channel_id, userId, 'member']
    );

    res.status(200).json({
      success: true,
      channelId: invite.channel_id,
      channelName: invite.channel_name,
    });
  } catch (err: any) {
    console.error('[Channels] Join by invite error:', err);
    res.status(500).json({ error: 'Failed to join channel' });
  }
});

// GET /api/channels/:id/livekit-token - generate LiveKit room token (verified membership)
channelRouter.get('/:id/livekit-token', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const channelId = req.params.id;
    const user = req.user!;

    // Check membership
    const membership = await query(
      'SELECT role FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [channelId, user.id]
    );

    if (membership.rowCount === 0) {
      res.status(403).json({ error: 'You are not a member of this channel' });
      return;
    }

    const token = await arbiter.createRoomToken(channelId, user);

    res.json({
      token,
      livekitUrl: process.env.LIVEKIT_PUBLIC_URL || config.livekit.url,
      channelId,
    });
  } catch (err: any) {
    console.error('[Channels] Token error:', err);
    res.status(500).json({ error: 'Failed to generate media token' });
  }
});
