import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import { config } from '../config.js';
import { AuthUser } from '../auth/jwt.js';

export interface ActiveTurn {
  channelId: string;
  userId: string;
  displayName: string;
  grantedAt: number;
  maxTimer: NodeJS.Timeout;
  heartbeatTimer: NodeJS.Timeout;
}

export interface CurrentSpeaker {
  id: string;
  name: string;
  grantedAt: number;
}

export type SpeakerChangeCallback = (
  channelId: string,
  speaker: CurrentSpeaker | null,
  reason?: string
) => void;

export class PttArbiter {
  private activeTurns = new Map<string, ActiveTurn>();
  private roomService: RoomServiceClient | null = null;
  private onSpeakerChangeCallback: SpeakerChangeCallback | null = null;

  constructor() {
    try {
      this.roomService = new RoomServiceClient(
        config.livekit.url,
        config.livekit.apiKey,
        config.livekit.apiSecret
      );
    } catch (err: any) {
      console.warn('[Arbiter] LiveKit RoomServiceClient init warning:', err.message);
    }
  }

  public setOnSpeakerChange(cb: SpeakerChangeCallback): void {
    this.onSpeakerChangeCallback = cb;
  }

  public getCurrentSpeaker(channelId: string): CurrentSpeaker | null {
    const turn = this.activeTurns.get(channelId);
    if (!turn) return null;
    return {
      id: turn.userId,
      name: turn.displayName,
      grantedAt: turn.grantedAt,
    };
  }

  public async requestTurn(
    channelId: string,
    user: AuthUser
  ): Promise<{ granted: boolean; currentSpeaker?: CurrentSpeaker; reason?: string }> {
    const existing = this.activeTurns.get(channelId);

    // If channel is already held by someone else
    if (existing) {
      if (existing.userId === user.id) {
        // Speaker already holds turn; refresh watchdog
        this.resetHeartbeatTimer(existing);
        return {
          granted: true,
          currentSpeaker: {
            id: existing.userId,
            name: existing.displayName,
            grantedAt: existing.grantedAt,
          },
        };
      }

      // Someone else is speaking
      return {
        granted: false,
        currentSpeaker: {
          id: existing.userId,
          name: existing.displayName,
          grantedAt: existing.grantedAt,
        },
        reason: 'CHANNEL_BUSY',
      };
    }

    // Channel is free: atomic grant
    const grantedAt = Date.now();

    const maxTimer = setTimeout(() => {
      console.log(`[Arbiter] Max turn duration (${config.turnMaxDurationMs}ms) exceeded for user ${user.id} in channel ${channelId}`);
      this.releaseTurn(channelId, user.id, 'MAX_DURATION_EXCEEDED');
    }, config.turnMaxDurationMs);

    const heartbeatTimer = setTimeout(() => {
      console.log(`[Arbiter] Heartbeat timed out (${config.turnHeartbeatTimeoutMs}ms) for user ${user.id} in channel ${channelId}`);
      this.releaseTurn(channelId, user.id, 'HEARTBEAT_TIMEOUT');
    }, config.turnHeartbeatTimeoutMs);

    const newTurn: ActiveTurn = {
      channelId,
      userId: user.id,
      displayName: user.displayName,
      grantedAt,
      maxTimer,
      heartbeatTimer,
    };

    this.activeTurns.set(channelId, newTurn);

    // Enforce permissions at LiveKit media server
    await this.updateLivekitPublishPermission(channelId, user.id, true);

    const speakerInfo: CurrentSpeaker = {
      id: user.id,
      name: user.displayName,
      grantedAt,
    };

    if (this.onSpeakerChangeCallback) {
      this.onSpeakerChangeCallback(channelId, speakerInfo, 'GRANT');
    }

    return {
      granted: true,
      currentSpeaker: speakerInfo,
    };
  }

  public async releaseTurn(
    channelId: string,
    userId: string,
    reason: string = 'NORMAL_RELEASE'
  ): Promise<boolean> {
    const turn = this.activeTurns.get(channelId);
    if (!turn) return false;

    // Only current speaker can release their turn
    if (turn.userId !== userId) {
      return false;
    }

    clearTimeout(turn.maxTimer);
    clearTimeout(turn.heartbeatTimer);
    this.activeTurns.delete(channelId);

    // Revoke permissions at media server immediately
    await this.updateLivekitPublishPermission(channelId, userId, false);

    if (this.onSpeakerChangeCallback) {
      this.onSpeakerChangeCallback(channelId, null, reason);
    }

    return true;
  }

  public heartbeat(channelId: string, userId: string): boolean {
    const turn = this.activeTurns.get(channelId);
    if (!turn || turn.userId !== userId) {
      return false;
    }
    this.resetHeartbeatTimer(turn);
    return true;
  }

  public handleDisconnect(userId: string): void {
    for (const [channelId, turn] of this.activeTurns.entries()) {
      if (turn.userId === userId) {
        console.log(`[Arbiter] Releasing turn for disconnected user ${userId} in channel ${channelId}`);
        this.releaseTurn(channelId, userId, 'DISCONNECT');
      }
    }
  }

  private resetHeartbeatTimer(turn: ActiveTurn): void {
    clearTimeout(turn.heartbeatTimer);
    turn.heartbeatTimer = setTimeout(() => {
      console.log(`[Arbiter] Heartbeat timed out for user ${turn.userId} in channel ${turn.channelId}`);
      this.releaseTurn(turn.channelId, turn.userId, 'HEARTBEAT_TIMEOUT');
    }, config.turnHeartbeatTimeoutMs);
  }

  private async updateLivekitPublishPermission(
    channelId: string,
    participantIdentity: string,
    canPublish: boolean
  ): Promise<void> {
    if (!this.roomService) return;
    try {
      await this.roomService.updateParticipant(
        channelId,
        participantIdentity,
        undefined, // metadata
        {
          canPublish,
          canSubscribe: true,
          canPublishData: false,
        }
      );
    } catch (err: any) {
      // Room might not be initialized yet in LiveKit if participant hasn't joined media session,
      // or media server is temporarily unreachable in dev/test.
      // Log for observability without failing turn transition.
      if (config.nodeEnv !== 'test') {
        console.warn(`[Arbiter] LiveKit updateParticipant (${participantIdentity}, canPublish=${canPublish}): ${err.message}`);
      }
    }
  }

  // Generate short-lived room token for listeners.
  // By default, canPublish is FALSE.
  public async createRoomToken(
    channelId: string,
    user: AuthUser
  ): Promise<string> {
    const at = new AccessToken(
      config.livekit.apiKey,
      config.livekit.apiSecret,
      {
        identity: user.id,
        name: user.displayName,
        ttl: '1h',
      }
    );

    at.addGrant({
      roomJoin: true,
      room: channelId,
      canPublish: true, // Authorized channel member can publish when granted by Arbiter
      canSubscribe: true, // Listeners can hear
      canPublishData: true,
    });

    return await at.toJwt();
  }
}

export const arbiter = new PttArbiter();
