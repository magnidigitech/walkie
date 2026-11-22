import { CurrentSpeaker } from '../types';

export type RealtimeEventHandler = (data: any) => void;

class RealtimeService {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private currentChannelId: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private isExplicitDisconnect = false;
  private listeners = new Map<string, Set<RealtimeEventHandler>>();

  connect(token: string) {
    this.token = token;
    this.isExplicitDisconnect = false;
    this.initSocket();
  }

  private initSocket() {
    if (!this.token || this.isExplicitDisconnect) return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const isCapacitor = typeof (window as any).Capacitor !== 'undefined' || window.location.protocol === 'capacitor:';
    const protocol = isCapacitor ? 'wss:' : (window.location.protocol === 'https:' ? 'wss:' : 'ws:');
    const host = isCapacitor ? 'talk.magnidigitech.com' : window.location.host;
    const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(this.token)}`;

    this.emit('connection', { status: 'connecting' });

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Realtime] WebSocket connected');
        this.reconnectAttempts = 0;
        this.emit('connection', { status: 'connected' });

        // If we were already in a channel prior to reconnect, rejoin it
        if (this.currentChannelId) {
          this.joinChannel(this.currentChannelId);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (err) {
          console.error('[Realtime] Failed to parse ws message:', err);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`[Realtime] WebSocket closed (code: ${event.code})`);
        this.emit('connection', { status: 'disconnected', code: event.code });
        if (!this.isExplicitDisconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error('[Realtime] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[Realtime] Connection initialization failed:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isExplicitDisconnect) return;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    console.log(`[Realtime] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    this.emit('connection', { status: 'reconnecting', attempt: this.reconnectAttempts + 1 });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.initSocket();
    }, delay);
  }

  private handleMessage(msg: any) {
    if (msg.type) {
      this.emit(msg.type, msg);
    }
  }

  joinChannel(channelId: string) {
    this.currentChannelId = channelId;
    this.send({ type: 'JOIN_CHANNEL', channelId });
  }

  leaveChannel() {
    if (this.currentChannelId) {
      this.send({ type: 'LEAVE_CHANNEL', channelId: this.currentChannelId });
      this.currentChannelId = null;
    }
  }

  requestSpeak(channelId: string) {
    this.send({ type: 'REQUEST_SPEAK', channelId });
  }

  releaseSpeak(channelId: string) {
    this.send({ type: 'RELEASE_SPEAK', channelId });
  }

  sendHeartbeat(channelId: string) {
    this.send({ type: 'HEARTBEAT_SPEAK', channelId });
  }

  disconnect() {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  on(event: string, handler: RealtimeEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data: any) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(data);
        } catch (e) {
          console.error(`[Realtime] Listener error on '${event}':`, e);
        }
      });
    }
  }
}

export const realtime = new RealtimeService();
