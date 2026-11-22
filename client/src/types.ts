export interface User {
  id: string;
  username: string;
  displayName: string;
}

export interface Channel {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  role: 'owner' | 'member';
  member_count: number;
}

export interface ChannelMember {
  id: string;
  username: string;
  display_name: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface ChannelInvite {
  id: string;
  channel_id: string;
  code: string;
  created_at: string;
  expires_at: string | null;
  revoked: boolean;
}

export interface CurrentSpeaker {
  id: string;
  name: string;
  grantedAt?: number;
}

export type PttState =
  | 'IDLE'          // Ready to transmit
  | 'CONNECTING'    // Button held, waiting for server arbiter turn grant
  | 'TALKING'       // Turn granted by server, transmitting audio
  | 'BUSY'          // Channel held by another speaker
  | 'MIC_DENIED'    // Microphone permission denied by browser/OS
  | 'AUDIO_BLOCKED' // Playback blocked due to browser autoplay restriction
  | 'OFFLINE'       // Disconnected or offline
  | 'ERROR';        // General error
