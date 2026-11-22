import { Capacitor } from '@capacitor/core';
import { Channel, ChannelInvite, ChannelMember, User } from '../types';

const isNative = Capacitor.isNativePlatform();
const isLocalhostApp = typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port !== '5173';
export const API_BASE = (isNative || isLocalhostApp || (typeof window !== 'undefined' && window.location.protocol === 'capacitor:'))
  ? 'https://talk.magnidigitech.com/api'
  : '/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('wt_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('wt_token', token);
    } else {
      localStorage.removeItem('wt_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data as T;
  }

  // Auth Endpoints
  async register(username: string, displayName: string, password: string): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password }),
    });
    this.setToken(res.token);
    return res;
  }

  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setToken(res.token);
    return res;
  }

  async me(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // Channel Endpoints
  async getChannels(): Promise<Channel[]> {
    const res = await this.request<{ channels: Channel[] }>('/channels');
    return res.channels;
  }

  async createChannel(name: string): Promise<Channel> {
    const res = await this.request<{ channel: Channel }>('/channels', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return res.channel;
  }

  async getChannel(id: string): Promise<{
    channel: Channel;
    userRole: 'owner' | 'member';
    members: ChannelMember[];
    currentSpeaker: { id: string; name: string } | null;
  }> {
    return this.request(`/channels/${id}`);
  }

  async createInvite(channelId: string, expiresInHours: number = 168): Promise<ChannelInvite> {
    const res = await this.request<{ invite: ChannelInvite }>(`/channels/${channelId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ expiresInHours }),
    });
    return res.invite;
  }

  async listInvites(channelId: string): Promise<ChannelInvite[]> {
    const res = await this.request<{ invites: ChannelInvite[] }>(`/channels/${channelId}/invites`);
    return res.invites;
  }

  async revokeInvite(channelId: string, inviteId: string): Promise<void> {
    await this.request(`/channels/${channelId}/invites/${inviteId}`, {
      method: 'DELETE',
    });
  }

  async joinByInvite(code: string): Promise<{ success: boolean; channelId: string; channelName: string; alreadyMember?: boolean }> {
    return this.request('/channels/join-by-invite', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async getLiveKitToken(channelId: string): Promise<{ token: string; livekitUrl: string; channelId: string }> {
    return this.request(`/channels/${channelId}/livekit-token`);
  }
}

export const api = new ApiClient();
