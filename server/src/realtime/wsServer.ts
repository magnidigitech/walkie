import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import url from 'url';
import { verifyToken, AuthUser } from '../auth/jwt.js';
import { query } from '../db/index.js';
import { arbiter, CurrentSpeaker } from './arbiter.js';

interface ClientConnection {
  ws: WebSocket;
  user: AuthUser;
  channelId: string | null;
  isAlive: boolean;
}

export class WalkieWsServer {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientConnection>();
  private pingInterval: NodeJS.Timeout;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Hook up arbiter speaker change events to broadcast to all clients in that channel
    arbiter.setOnSpeakerChange((channelId: string, speaker: CurrentSpeaker | null, reason?: string) => {
      this.broadcastToChannel(channelId, {
        type: 'CURRENT_SPEAKER_CHANGE',
        channelId,
        speaker,
        reason,
      });
    });

    // Periodic ping to detect dead sockets
    this.pingInterval = setInterval(() => {
      for (const [ws, client] of this.clients.entries()) {
        if (!client.isAlive) {
          console.log(`[WS] Terminating stale socket for user ${client.user.username}`);
          ws.terminate();
          continue;
        }
        client.isAlive = false;
        try {
          ws.ping();
        } catch (e) {
          ws.terminate();
        }
      }
    }, 30000);
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const parsed = url.parse(req.url || '', true);
    const token = (parsed.query.token as string) || '';

    const user = verifyToken(token);
    if (!user) {
      ws.close(4401, 'Unauthorized: Invalid token');
      return;
    }

    const client: ClientConnection = {
      ws,
      user,
      channelId: null,
      isAlive: true,
    };

    this.clients.set(ws, client);
    console.log(`[WS] User connected: ${user.username} (${user.id})`);

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', async (data: string | Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleClientMessage(client, message);
      } catch (err: any) {
        console.error('[WS] Message handling error:', err.message);
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error on socket for ${user.username}:`, err.message);
      this.handleDisconnect(client);
    });

    // Send welcome confirmation
    this.send(ws, {
      type: 'AUTHENTICATED',
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
    });
  }

  private async handleClientMessage(client: ClientConnection, msg: any): Promise<void> {
    switch (msg.type) {
      case 'PING': {
        this.send(client.ws, { type: 'PONG', timestamp: Date.now() });
        break;
      }

      case 'JOIN_CHANNEL': {
        const channelId = msg.channelId;
        if (!channelId) return;

        // Verify membership in database
        const memberCheck = await query(
          'SELECT role FROM channel_members WHERE channel_id = $1 AND user_id = $2',
          [channelId, client.user.id]
        );

        if (memberCheck.rowCount === 0) {
          this.send(client.ws, {
            type: 'ERROR',
            code: 'FORBIDDEN',
            message: 'You are not a member of this channel',
          });
          return;
        }

        // Leave previous channel if any
        if (client.channelId && client.channelId !== channelId) {
          this.leaveCurrentChannel(client);
        }

        client.channelId = channelId;

        // Send channel state to client
        const currentSpeaker = arbiter.getCurrentSpeaker(channelId);
        const onlineUsers = this.getOnlineUsersInChannel(channelId);

        this.send(client.ws, {
          type: 'CHANNEL_STATE',
          channelId,
          currentSpeaker,
          onlineUsers,
        });

        // Notify other channel members that this user came online
        this.broadcastToChannel(channelId, {
          type: 'PRESENCE_UPDATE',
          channelId,
          onlineUsers,
        });

        break;
      }

      case 'LEAVE_CHANNEL': {
        this.leaveCurrentChannel(client);
        break;
      }

      case 'REQUEST_SPEAK': {
        const channelId = msg.channelId || client.channelId;
        if (!channelId) {
          this.send(client.ws, {
            type: 'DENY_SPEAK',
            reason: 'NO_CHANNEL',
            message: 'No channel selected',
          });
          return;
        }

        // Ensure user is in the channel
        if (client.channelId !== channelId) {
          this.send(client.ws, {
            type: 'DENY_SPEAK',
            channelId,
            reason: 'NOT_IN_CHANNEL',
            message: 'You must join this channel first',
          });
          return;
        }

        const result = await arbiter.requestTurn(channelId, client.user);
        if (result.granted) {
          this.send(client.ws, {
            type: 'GRANT_SPEAK',
            channelId,
            speaker: result.currentSpeaker,
          });
        } else {
          this.send(client.ws, {
            type: 'DENY_SPEAK',
            channelId,
            reason: result.reason,
            currentSpeaker: result.currentSpeaker,
          });
        }
        break;
      }

      case 'RELEASE_SPEAK': {
        const channelId = msg.channelId || client.channelId;
        if (!channelId) return;

        await arbiter.releaseTurn(channelId, client.user.id, 'NORMAL_RELEASE');
        this.send(client.ws, {
          type: 'RELEASE_CONFIRMED',
          channelId,
        });
        break;
      }

      case 'HEARTBEAT_SPEAK': {
        const channelId = msg.channelId || client.channelId;
        if (channelId) {
          const active = arbiter.heartbeat(channelId, client.user.id);
          if (!active) {
            // Heartbeat rejected because turn already expired or was revoked
            this.send(client.ws, {
              type: 'REVOKE_SPEAK',
              channelId,
              reason: 'TURN_LOST',
            });
          }
        }
        break;
      }

      default:
        console.warn(`[WS] Unrecognized message type: ${msg.type}`);
    }
  }

  private leaveCurrentChannel(client: ClientConnection): void {
    const oldChannelId = client.channelId;
    if (!oldChannelId) return;

    arbiter.releaseTurn(oldChannelId, client.user.id, 'LEAVE_CHANNEL');
    client.channelId = null;

    const remainingOnline = this.getOnlineUsersInChannel(oldChannelId);
    this.broadcastToChannel(oldChannelId, {
      type: 'PRESENCE_UPDATE',
      channelId: oldChannelId,
      onlineUsers: remainingOnline,
    });
  }

  private handleDisconnect(client: ClientConnection): void {
    this.clients.delete(client.ws);
    console.log(`[WS] User disconnected: ${client.user.username} (${client.user.id})`);

    // Release any active turns across all channels
    arbiter.handleDisconnect(client.user.id);

    if (client.channelId) {
      const channelId = client.channelId;
      client.channelId = null;
      const onlineUsers = this.getOnlineUsersInChannel(channelId);
      this.broadcastToChannel(channelId, {
        type: 'PRESENCE_UPDATE',
        channelId,
        onlineUsers,
      });
    }
  }

  public getOnlineUsersInChannel(channelId: string): Array<{ id: string; username: string; displayName: string }> {
    const seen = new Set<string>();
    const list: Array<{ id: string; username: string; displayName: string }> = [];

    for (const client of this.clients.values()) {
      if (client.channelId === channelId && !seen.has(client.user.id)) {
        seen.add(client.user.id);
        list.push({
          id: client.user.id,
          username: client.user.username,
          displayName: client.user.displayName,
        });
      }
    }

    return list;
  }

  public broadcastToChannel(channelId: string, payload: any): void {
    const msg = JSON.stringify(payload);
    for (const client of this.clients.values()) {
      if (client.channelId === channelId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    }
  }

  private send(ws: WebSocket, payload: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  public close(): void {
    clearInterval(this.pingInterval);
    this.wss.close();
  }
}
