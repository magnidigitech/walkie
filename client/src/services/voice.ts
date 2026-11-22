import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  LocalAudioTrack,
  createLocalAudioTrack,
  Track,
} from 'livekit-client';

export type VoiceStateListener = (state: {
  connected: boolean;
  audioBlocked: boolean;
  micDenied: boolean;
  error?: string;
}) => void;

class VoiceService {
  private room: Room | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
  private audioBlocked = false;
  private micDenied = false;
  private stateListeners = new Set<VoiceStateListener>();

  constructor() {
    // Modular audio service
  }

  public subscribeState(listener: VoiceStateListener): () => void {
    this.stateListeners.add(listener);
    this.notifyState();
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private notifyState(error?: string) {
    const state = {
      connected: this.room?.state === 'connected',
      audioBlocked: this.audioBlocked,
      micDenied: this.micDenied,
      error,
    };
    this.stateListeners.forEach((l) => l(state));
  }

  /**
   * Connect to the LiveKit audio room with a short-lived listener token.
   */
  public async connect(url: string, token: string): Promise<void> {
    await this.disconnect();

    this.audioBlocked = false;
    this.micDenied = false;

    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          console.log(`[Voice] Subscribed to audio track from ${participant.identity}`);
          const element = track.attach();
          if (track.sid) {
            this.remoteAudioElements.set(track.sid, element);
          }
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => el.remove());
          if (track.sid) {
            this.remoteAudioElements.delete(track.sid);
          }
        }
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (this.room && !this.room.canPlaybackAudio) {
          console.warn('[Voice] Audio playback blocked by browser autoplay policy');
          this.audioBlocked = true;
          this.notifyState();
        } else {
          this.audioBlocked = false;
          this.notifyState();
        }
      })
      .on(RoomEvent.Disconnected, () => {
        console.log('[Voice] Disconnected from room');
        this.cleanupTracks();
        this.notifyState();
      });

    try {
      await this.room.connect(url, token);
      console.log('[Voice] Connected to LiveKit room as listener');

      // Check if browser requires user gesture to play incoming audio
      if (!this.room.canPlaybackAudio) {
        this.audioBlocked = true;
      }
      this.notifyState();
    } catch (err: any) {
      console.error('[Voice] Connection failed:', err);
      this.notifyState(err.message || 'Failed to connect to media server');
      throw err;
    }
  }

  /**
   * Explicit action to unlock browser audio playback on user gesture.
   */
  public async enableAudio(): Promise<boolean> {
    if (!this.room) return false;
    try {
      await this.room.startAudio();
      this.audioBlocked = false;
      this.notifyState();
      console.log('[Voice] Audio playback enabled successfully');
      return true;
    } catch (err: any) {
      console.error('[Voice] Failed to start audio playback:', err);
      return false;
    }
  }

  /**
   * Start transmitting voice: requests microphone access and publishes local audio track.
   * Only called when server arbiter has granted the turn.
   */
  public async startTransmitting(): Promise<{ success: boolean; error?: string }> {
    if (!this.room || this.room.state !== 'connected') {
      console.warn('[Voice] Cannot transmit: media room not connected (state: ' + (this.room?.state || 'null') + ')');
      return { success: false, error: 'Connecting to voice media server... please wait' };
    }

    try {
      // 1. Capture microphone audio with noise/echo cancellation
      if (!this.localAudioTrack) {
        this.localAudioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
      }

      this.micDenied = false;

      // 2. Publish track to media room
      await this.room.localParticipant.publishTrack(this.localAudioTrack);
      console.log('[Voice] Microphone track published (transmitting)');
      this.notifyState();
      return { success: true };
    } catch (err: any) {
      console.error('[Voice] Failed to start transmitting:', err);
      let errMsg = 'Microphone capture failed';
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        err.message?.includes('Permission denied')
      ) {
        this.micDenied = true;
        errMsg = 'Microphone permission denied. Tap to retry.';
      } else if (err.message) {
        errMsg = err.message;
      }
      this.notifyState(errMsg);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Stop transmitting voice immediately: unpublishes and stops local audio track.
   */
  public async stopTransmitting(): Promise<void> {
    if (this.localAudioTrack) {
      try {
        if (this.room && this.room.state === 'connected') {
          await this.room.localParticipant.unpublishTrack(this.localAudioTrack);
        }
      } catch (err) {
        console.warn('[Voice] Error unpublishing track:', err);
      } finally {
        this.localAudioTrack.stop();
        this.localAudioTrack = null;
        console.log('[Voice] Local track stopped (transmission halted)');
      }
    }
    this.notifyState();
  }

  private cleanupTracks() {
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
    this.remoteAudioElements.forEach((el) => el.remove());
    this.remoteAudioElements.clear();
  }

  public async disconnect(): Promise<void> {
    this.cleanupTracks();
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch (err) {
        console.warn('[Voice] Disconnect notice:', err);
      }
      this.room = null;
    }
    this.notifyState();
  }
}

export const voice = new VoiceService();
