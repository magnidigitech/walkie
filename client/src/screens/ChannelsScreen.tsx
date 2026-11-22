import React, { useState, useEffect } from 'react';
import { Radio, Plus, KeyRound, LogOut, Users, ChevronRight, Shield, RefreshCw } from 'lucide-react';
import { Channel, User } from '../types';
import { api } from '../services/api';
import { InstallPrompt } from '../components/InstallPrompt';

interface ChannelsScreenProps {
  currentUser: User;
  onSelectChannel: (channel: Channel) => void;
  onLogout: () => void;
}

export const ChannelsScreen: React.FC<ChannelsScreenProps> = ({
  currentUser,
  onSelectChannel,
  onLogout,
}) => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchChannels = async () => {
    try {
      setLoading(true);
      const list = await api.getChannels();
      setChannels(list);
    } catch (err: any) {
      console.error('Failed to load channels:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setModalLoading(true);
    setModalError(null);
    try {
      const ch = await api.createChannel(newChannelName.trim());
      setShowCreateModal(false);
      setNewChannelName('');
      onSelectChannel(ch);
    } catch (err: any) {
      setModalError(err.message || 'Failed to create channel');
    } finally {
      setModalLoading(false);
    }
  };

  const handleJoinByInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await api.joinByInvite(inviteCode.trim());
      setShowJoinModal(false);
      setInviteCode('');
      // Refresh channels and enter joined channel
      const updated = await api.getChannels();
      setChannels(updated);
      const joined = updated.find((c) => c.id === res.channelId);
      if (joined) {
        onSelectChannel(joined);
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to join channel with invite code');
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full h-full overflow-hidden">
      {/* Top Header */}
      <header className="px-4 py-4 pt-safe flex items-center justify-between border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Walkie Talkie</h1>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              <span>{currentUser.displayName}</span>
              <span className="text-slate-600">(@{currentUser.username})</span>
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-xl transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* PWA Install Promotion Banner */}
        <InstallPrompt />

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/15"
          >
            <Plus className="w-4 h-4" />
            <span className="text-xs">New Channel</span>
          </button>
          <button
            onClick={() => setShowJoinModal(true)}
            className="p-3.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 font-semibold rounded-2xl flex items-center justify-center gap-2 border border-slate-700/80 transition-all"
          >
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <span className="text-xs">Join by Code</span>
          </button>
        </div>

        {/* Channels Section Header */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Your Private Channels</h2>
          <button
            onClick={fetchChannels}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Channel Cards */}
        {loading && channels.length === 0 ? (
          <div className="py-12 flex justify-center text-slate-500">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="py-12 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-6">
            <Radio className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-300">No channels yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Create a channel for your team or enter an invite code from someone to start talking.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => onSelectChannel(channel)}
                className="w-full text-left p-4 bg-slate-900 hover:bg-slate-800/80 active:scale-[0.99] border border-slate-800 hover:border-emerald-500/30 rounded-2xl flex items-center justify-between transition-all group shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 flex items-center justify-center font-bold text-base group-hover:border-emerald-500/40 transition-colors">
                    #
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm group-hover:text-emerald-400 transition-colors">
                      {channel.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-500" />
                        {channel.member_count} {channel.member_count === 1 ? 'member' : 'members'}
                      </span>
                      {channel.role === 'owner' && (
                        <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-semibold flex items-center gap-0.5">
                          <Shield className="w-2.5 h-2.5" />
                          Owner
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-slate-500 group-hover:text-emerald-400 transition-colors">
                  <span className="text-xs font-medium hidden sm:inline">Connect</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Create New Channel</h3>
            <p className="text-xs text-slate-400 mb-4">
              Private channels allow secure push-to-talk with invited members only.
            </p>

            {modalError && (
              <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateChannel} className="space-y-4">
              <input
                type="text"
                required
                autoFocus
                placeholder="Channel name (e.g. Operations)"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setModalError(null); }}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading || !newChannelName.trim()}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-xs rounded-xl"
                >
                  {modalLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join by Code Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Join Channel</h3>
            <p className="text-xs text-slate-400 mb-4">
              Paste an invite code or link provided by a channel member.
            </p>

            {modalError && (
              <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleJoinByInvite} className="space-y-4">
              <input
                type="text"
                required
                autoFocus
                placeholder="Invite Code (e.g. abcd1234ef)"
                value={inviteCode}
                onChange={(e) => {
                  let val = e.target.value.trim();
                  // Extract code if user pasted a full URL
                  if (val.includes('/join/')) {
                    val = val.split('/join/')[1].split(/[?#]/)[0];
                  } else if (val.includes('invite=')) {
                    val = new URL(val).searchParams.get('invite') || val;
                  }
                  setInviteCode(val);
                }}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowJoinModal(false); setModalError(null); }}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading || !inviteCode.trim()}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-xs rounded-xl"
                >
                  {modalLoading ? 'Joining...' : 'Join Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
