import pg from 'pg';
import crypto from 'crypto';
import { config } from '../config.js';

const { Pool } = pg;

export interface DBResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  created_at: Date;
}

export interface ChannelRow {
  id: string;
  name: string;
  created_by: string;
  created_at: Date;
}

export interface ChannelMemberRow {
  channel_id: string;
  user_id: string;
  role: string;
  joined_at: Date;
}

export interface ChannelInviteRow {
  id: string;
  channel_id: string;
  code: string;
  created_by: string;
  created_at: Date;
  expires_at: Date | null;
  revoked: boolean;
}

// In-memory fallback storage for lightweight local testing without running Postgres
class InMemoryDB {
  users = new Map<string, UserRow>();
  channels = new Map<string, ChannelRow>();
  members = new Map<string, ChannelMemberRow>(); // key: `${channelId}:${userId}`
  invites = new Map<string, ChannelInviteRow>();

  async query(sqlText: string, params: any[] = []): Promise<DBResult> {
    const s = sqlText.trim().toLowerCase();

    // SELECT 1 (health check)
    if (s.startsWith('select 1')) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }

    // USERS: Insert
    if (s.includes('insert into users')) {
      const id = params[0] || crypto.randomUUID();
      const username = params[1];
      const displayName = params[2];
      const passwordHash = params[3];
      const row: UserRow = {
        id,
        username,
        display_name: displayName,
        password_hash: passwordHash,
        created_at: new Date()
      };
      this.users.set(id, row);
      return { rows: [row], rowCount: 1 };
    }

    // USERS: Find by username
    if (s.includes('from users') && s.includes('where username =')) {
      const username = params[0];
      const found = Array.from(this.users.values()).find(u => u.username.toLowerCase() === username.toLowerCase());
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    // USERS: Find by ID
    if (s.includes('from users') && s.includes('where id =')) {
      const id = params[0];
      const found = this.users.get(id);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    // CHANNELS: Insert
    if (s.includes('insert into channels')) {
      const id = params[0] || crypto.randomUUID();
      const name = params[1];
      const createdBy = params[2];
      const row: ChannelRow = {
        id,
        name,
        created_by: createdBy,
        created_at: new Date()
      };
      this.channels.set(id, row);
      return { rows: [row], rowCount: 1 };
    }

    // CHANNELS: Get channels for user
    if (s.includes('from channels') && s.includes('join channel_members') && s.includes('where cm.user_id =')) {
      const userId = params[0];
      const userMemberChannelIds = Array.from(this.members.values())
        .filter(m => m.user_id === userId)
        .map(m => m.channel_id);

      const rows = userMemberChannelIds
        .map(cid => {
          const ch = this.channels.get(cid);
          if (!ch) return null;
          const memberCount = Array.from(this.members.values()).filter(m => m.channel_id === cid).length;
          const userMember = this.members.get(`${cid}:${userId}`);
          return {
            id: ch.id,
            name: ch.name,
            created_by: ch.created_by,
            created_at: ch.created_at,
            role: userMember?.role || 'member',
            member_count: memberCount
          };
        })
        .filter(Boolean);

      return { rows, rowCount: rows.length };
    }

    // CHANNELS: Get channel by id with membership check
    if (s.includes('from channels') && s.includes('where c.id =') && s.includes('cm.user_id =')) {
      const channelId = params[0];
      const userId = params[1];
      const ch = this.channels.get(channelId);
      const mem = this.members.get(`${channelId}:${userId}`);
      if (!ch || !mem) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [{
          id: ch.id,
          name: ch.name,
          created_by: ch.created_by,
          created_at: ch.created_at,
          role: mem.role
        }],
        rowCount: 1
      };
    }

    // CHANNEL MEMBERS: Add
    if (s.includes('insert into channel_members')) {
      const channelId = params[0];
      const userId = params[1];
      const role = params[2] || 'member';
      const row: ChannelMemberRow = {
        channel_id: channelId,
        user_id: userId,
        role,
        joined_at: new Date()
      };
      this.members.set(`${channelId}:${userId}`, row);
      return { rows: [row], rowCount: 1 };
    }

    // CHANNEL MEMBERS: List for channel
    if (s.includes('from channel_members') && s.includes('join users') && s.includes('where cm.channel_id =')) {
      const channelId = params[0];
      const rows = Array.from(this.members.values())
        .filter(m => m.channel_id === channelId)
        .map(m => {
          const user = this.users.get(m.user_id);
          return {
            id: m.user_id,
            username: user?.username || 'unknown',
            display_name: user?.display_name || 'Unknown',
            role: m.role,
            joined_at: m.joined_at
          };
        });
      return { rows, rowCount: rows.length };
    }

    // CHANNEL MEMBERS: Check specific membership
    if (s.includes('from channel_members') && s.includes('where channel_id =') && s.includes('user_id =')) {
      const channelId = params[0];
      const userId = params[1];
      const mem = this.members.get(`${channelId}:${userId}`);
      return { rows: mem ? [mem] : [], rowCount: mem ? 1 : 0 };
    }

    // CHANNEL INVITES: Insert
    if (s.includes('insert into channel_invites')) {
      const id = params[0] || crypto.randomUUID();
      const channelId = params[1];
      const code = params[2];
      const createdBy = params[3];
      const expiresAt = params[4] || null;
      const row: ChannelInviteRow = {
        id,
        channel_id: channelId,
        code,
        created_by: createdBy,
        created_at: new Date(),
        expires_at: expiresAt ? new Date(expiresAt) : null,
        revoked: false
      };
      this.invites.set(id, row);
      return { rows: [row], rowCount: 1 };
    }

    // CHANNEL INVITES: Find active by code
    if (s.includes('from channel_invites') && s.includes('where code =')) {
      const code = params[0];
      const found = Array.from(this.invites.values()).find(i => i.code === code);
      if (!found) return { rows: [], rowCount: 0 };
      const ch = this.channels.get(found.channel_id);
      return {
        rows: [{
          ...found,
          channel_name: ch?.name || 'Unknown Channel'
        }],
        rowCount: 1
      };
    }

    // CHANNEL INVITES: List by channel
    if (s.includes('from channel_invites') && s.includes('where channel_id =')) {
      const channelId = params[0];
      const rows = Array.from(this.invites.values())
        .filter(i => i.channel_id === channelId && !i.revoked)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return { rows, rowCount: rows.length };
    }

    // CHANNEL INVITES: Revoke
    if (s.includes('update channel_invites set revoked = true')) {
      const id = params[0];
      const channelId = params[1];
      const row = this.invites.get(id);
      if (row && row.channel_id === channelId) {
        row.revoked = true;
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 0 };
  }
}

let pool: pg.Pool | null = null;
let inMemoryStore: InMemoryDB | null = null;
let useFallback = false;

export async function initDb(): Promise<void> {
  try {
    pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 2000,
    });
    // Test connectivity
    const client = await pool.connect();
    client.release();
    console.log('[DB] Connected to PostgreSQL successfully.');
  } catch (err: any) {
    console.warn(`[DB] PostgreSQL not reachable (${err.message}). Using resilient in-memory database store.`);
    useFallback = true;
    inMemoryStore = new InMemoryDB();
  }
}

export async function query<T = any>(sqlText: string, params: any[] = []): Promise<DBResult<T>> {
  if (useFallback || !pool) {
    if (!inMemoryStore) {
      inMemoryStore = new InMemoryDB();
      useFallback = true;
    }
    return inMemoryStore.query(sqlText, params);
  }

  try {
    const res = await pool.query(sqlText, params);
    return {
      rows: res.rows,
      rowCount: res.rowCount ?? 0,
    };
  } catch (err) {
    if (useFallback) {
      return inMemoryStore!.query(sqlText, params);
    }
    throw err;
  }
}

export function resetInMemoryStoreForTesting(): void {
  inMemoryStore = new InMemoryDB();
  useFallback = true;
}
