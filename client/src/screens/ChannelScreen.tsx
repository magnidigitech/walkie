import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Share2,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Radio,
  Users,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Lock,
  WifiOff,
} from 'lucide-react';
import { Channel, ChannelMember, ChannelInvite, User } from '../types';
import { api } from '../services/api';
import { realtime } from '../services/realtime';
import { voice } from '../services/voice';
import { usePtt } from '../hooks/usePtt';

interface ChannelScreenProps {
  channel: Channel;
  currentUser: User;
  onBack: () => void;
}

export const ChannelScreen: React.FC<ChannelScreenProps> = ({
  channel,
  currentUser,
  onBack,
}) => {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set([currentUser.id]));
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invites, setInvites] = useState<ChannelInvite[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Initialize PTT state machine
  const {
    pttState,
    currentSpeaker,
    isHolding,
    micError,
    pressStart,
    pressEnd,
    resetMicError,
  } = usePtt({
    channelId: channel.id,
    currentUser,
  });

  // Load channel details & join realtime channel
  const loadChannelDetails = useCallback(async () => {
    try {
      const data = await api.getChannel(channel.id);
      setMembers(data.members);
    } catch (err) {
      console.error('Failed to load channel members:', err);
    }
  }, [channel.id]);

  // Connect to LiveKit room for audio transport
  const initVoiceMedia = useCallback(async () => {
    try {
      const { token, livekitUrl } = await api.getLiveKitToken(channel.id);
      await voice.connect(livekitUrl, token);
    } catch (err: any) {
      console.warn('Voice connection deferred or failed:', err.message);
    }
  }, [channel.id]);

  useEffect(() => {
    loadChannelDetails();
    initVoiceMedia();

    // Subscribe to voice state for audio autoplay blocks
    const unsubVoiceState = voice.subscribeState((state) => {
      setAudioBlocked(state.audioBlocked);
    });

    // Join channel on WebSocket
    realtime.joinChannel(channel.id);

    // Listen for presence updates
    const unsubPresence = realtime.on('PRESENCE_UPDATE', (data: any) => {
      if (data.channelId === channel.id && Array.isArray(data.onlineUsers)) {
        setOnlineUserIds(new Set(data.onlineUsers.map((u: any) => u.id)));
      }
    });

    const unsubChannelState = realtime.on('CHANNEL_STATE', (data: any) => {
      if (data.channelId === channel.id && Array.isArray(data.onlineUsers)) {
        setOnlineUserIds(new Set(data.onlineUsers.map((u: any) => u.id)));
      }
    });

    const unsubConn = realtime.on('connection', (data: any) => {
      if (data.status === 'connected') {
        setConnectionStatus('connected');
      } else if (data.status === 'reconnecting') {
        setConnectionStatus('reconnecting');
      } else {
        setConnectionStatus('disconnected');
      }
    });

    return () => {
      realtime.leaveChannel();
      voice.disconnect();
      unsubVoiceState();
      unsubPresence();
      unsubChannelState();
      unsubConn();
    };
  }, [channel.id, loadChannelDetails, initVoiceMedia]);

  // Invites logic
  const loadInvites = async () => {
    try {
      setInviteLoading(true);
      const list = await api.listInvites(channel.id);
      setInvites(list);
    } catch (err) {
      console.error('Failed to load invites:', err);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCreateInvite = async () => {
    try {
      setInviteLoading(true);
      const inv = await api.createInvite(channel.id);
      setInvites([inv, ...invites]);
      handleCopyInvite(inv.code);
    } catch (err) {
      console.error('Failed to create invite:', err);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await api.revokeInvite(channel.id, inviteId);
      setInvites(invites.filter((i) => i.id !== inviteId));
    } catch (err) {
      console.error('Failed to revoke invite:', err);
    }
  };

  const handleCopyInvite = (code: string) => {
    const inviteUrl = `${window.location.origin}?invite=${code}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Button interaction handlers (touch, mouse, keyboard)
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevents touch scrolling and context menu
    pressStart();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    pressEnd();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      pressStart();
    }
  };

  const handleMouseUp = () => {
    pressEnd();
  };

  const handleMouseLeave = () => {
    if (isHolding) {
      pressEnd();
    }
  };

  const isSomeoneElseSpeaking = currentSpeaker && currentSpeaker.id !== currentUser.id;
  const isMeSpeaking = pttState === 'TALKING';

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full h-full overflow-hidden bg-slate-950">
      {/* Top Navigation Bar */}
      <header className="px-4 py-3 pt-safe flex items-center justify-between border-b border-slate-800 bg-slate-900/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            aria-label="Back to channels"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white leading-tight truncate max-w-[180px]">
                {channel.name}
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <Users className="w-3 h-3 text-slate-500" />
              <span>{onlineUserIds.size} online</span>
              <span className="text-slate-600">•</span>
              <span>{members.length} total</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setShowInviteModal(true);
            loadInvites();
          }}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-slate-700/80 transition-all"
        >
          <Share2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Invite</span>
        </button>
      </header>

      {/* Warning & Recovery Banners */}
      {audioBlocked && (
        <div className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <VolumeX className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>Incoming audio requires browser permission.</span>
          </div>
          <button
            onClick={() => voice.enableAudio()}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg transition-all shadow-sm flex items-center gap-1"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Enable Audio
          </button>
        </div>
      )}

      {micError && (
        <div className="px-4 py-2.5 bg-red-500/15 border-b border-red-500/30 flex items-center justify-between gap-3 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <MicOff className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{micError}</span>
          </div>
          <button
            onClick={resetMicError}
            className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 font-semibold rounded-lg"
          >
            Dismiss
          </button>
        </div>
      )}

      {connectionStatus !== 'connected' && (
        <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-center gap-2 text-xs text-slate-400">
          <WifiOff className="w-3.5 h-3.5 text-amber-400" />
          <span>{connectionStatus === 'reconnecting' ? 'Reconnecting to network...' : 'Offline'}</span>
        </div>
      )}

      {/* Main Channel Area */}
      <div className="flex-1 flex flex-col justify-between p-4 overflow-hidden">
        {/* Members & Frequency HUD */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3.5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Channel Members</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Only 1 person talks at once
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {members.map((m) => {
              const isOnline = onlineUserIds.has(m.id);
              const isSpeaker = currentSpeaker?.id === m.id;

              return (
                <div
                  key={m.id}
                  className={`px-2.5 py-1 rounded-xl text-xs flex items-center gap-1.5 border transition-all ${
                    isSpeaker
                      ? 'bg-red-500/20 border-red-500/50 text-red-200 font-bold ring-2 ring-red-500/30 animate-pulse'
                      : isOnline
                      ? 'bg-slate-800/90 border-slate-700/80 text-slate-200'
                      : 'bg-slate-950/40 border-slate-800/50 text-slate-500'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSpeaker
                        ? 'bg-red-400'
                        : isOnline
                        ? 'bg-emerald-400'
                        : 'bg-slate-600'
                    }`}
                  />
                  <span>{m.display_name}</span>
                  {m.id === currentUser.id && <span className="text-[10px] text-slate-400">(You)</span>}
                  {isSpeaker && <Mic className="w-3 h-3 text-red-400 animate-bounce" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center Transmission Status Screen */}
        <div className="my-auto text-center py-4">
          {isMeSpeaking ? (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Live Audio Transmitting
              </div>
              <div className="text-3xl font-extrabold text-white tracking-wide">
                YOU ARE TALKING
              </div>
              <p className="text-xs text-red-300/80">Release button or Spacebar to listen</p>
            </div>
          ) : pttState === 'CONNECTING' ? (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-bold uppercase tracking-wider">
                <div className="w-2 h-2 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Requesting Server Turn...
              </div>
              <div className="text-2xl font-bold text-slate-200">
                Connecting…
              </div>
            </div>
          ) : isSomeoneElseSpeaking ? (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                <Mic className="w-3.5 h-3.5" />
                Channel Occupied
              </div>
              <div className="text-2xl font-bold text-amber-200">
                {currentSpeaker?.name} is talking
              </div>
              <p className="text-xs text-slate-400">Wait for them to release the channel</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-widest text-emerald-400 flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Channel Clear
              </div>
              <div className="text-xl font-bold text-slate-300">
                Ready to Transmit
              </div>
              <p className="text-xs text-slate-500">Press & hold button below or hit Spacebar</p>
            </div>
          )}
        </div>

        {/* Large Push-To-Talk Button HUD */}
        <div className="flex flex-col items-center justify-center pb-safe pt-2">
          <div className="relative flex items-center justify-center">
            {/* Pulsing Ripple Rings when talking */}
            {isMeSpeaking && (
              <>
                <div className="absolute w-56 h-56 rounded-full bg-red-500/20 animate-ping pointer-events-none" />
                <div className="absolute w-64 h-64 rounded-full border border-red-500/40 animate-pulse pointer-events-none" />
              </>
            )}

            {/* Glowing ring when someone else is talking */}
            {isSomeoneElseSpeaking && (
              <div className="absolute w-52 h-52 rounded-full border border-amber-500/30 animate-pulse pointer-events-none" />
            )}

            {/* Main PTT Button */}
            <button
              type="button"
              tabIndex={0}
              aria-label="Push to Talk"
              disabled={isSomeoneElseSpeaking || connectionStatus !== 'connected'}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              className={`relative z-10 w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all duration-150 select-none shadow-2xl focus:outline-none focus:ring-4 ${
                isMeSpeaking
                  ? 'bg-gradient-to-b from-red-500 to-red-600 text-white scale-105 shadow-red-500/40 ring-4 ring-red-400/50'
                  : pttState === 'CONNECTING'
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white scale-98 shadow-blue-500/30 ring-4 ring-blue-400/50'
                  : isSomeoneElseSpeaking
                  ? 'bg-slate-800 text-slate-500 border-2 border-slate-700/60 opacity-60 cursor-not-allowed shadow-none'
                  : connectionStatus !== 'connected'
                  ? 'bg-slate-900 text-slate-600 border border-slate-800 opacity-50 cursor-not-allowed'
                  : 'bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-slate-100 border-2 border-slate-700 active:scale-95 shadow-black/80 hover:border-emerald-500/50 focus:ring-emerald-500/30'
              }`}
            >
              {isMeSpeaking ? (
                <>
                  <Mic className="w-12 h-12 mb-1 animate-pulse" />
                  <span className="text-sm font-black tracking-wider uppercase">TALKING</span>
                  <span className="text-[10px] text-red-200 font-medium">Release to Stop</span>
                </>
              ) : pttState === 'CONNECTING' ? (
                <>
                  <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin mb-2" />
                  <span className="text-xs font-bold tracking-wider uppercase">CONNECTING...</span>
                </>
              ) : isSomeoneElseSpeaking ? (
                <>
                  <Lock className="w-10 h-10 mb-1 text-amber-500/80" />
                  <span className="text-xs font-bold tracking-wider uppercase text-amber-400">BUSY</span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                    {currentSpeaker?.name}
                  </span>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                    <Mic className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-black tracking-wider uppercase text-white">
                    HOLD TO TALK
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium mt-0.5">
                    or Hold Spacebar
                  </span>
                </>
              )}
            </button>
          </div>

          <div className="mt-3 text-[11px] text-slate-500 text-center">
            {isMeSpeaking
              ? 'Transmitting live WebRTC audio directly to channel listeners'
              : 'Hold down to speak • Release to listen'}
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-emerald-400" />
                Channel Invites
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Done
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Share an invite link or code to let friends or coworkers join this private channel.
            </p>

            <button
              onClick={handleCreateInvite}
              disabled={inviteLoading}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 mb-4 transition-all shadow-md shadow-emerald-500/15"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{inviteLoading ? 'Generating...' : 'Create New Invite Link'}</span>
            </button>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Active Links
              </div>
              {invites.length === 0 ? (
                <div className="text-xs text-slate-500 py-2 text-center bg-slate-950/50 rounded-xl">
                  No active invite links yet
                </div>
              ) : (
                invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2.5 bg-slate-950 border border-slate-800/80 rounded-xl flex items-center justify-between gap-2"
                  >
                    <div className="font-mono text-xs text-slate-300 truncate">
                      {inv.code}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleCopyInvite(inv.code)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center gap-1"
                        title="Copy link"
                      >
                        {copiedCode === inv.code ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[10px] text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[10px]">Copy</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg"
                        title="Revoke link"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
