import React, { useState, useEffect } from 'react';
import { User, Channel } from './types';
import { api } from './services/api';
import { realtime } from './services/realtime';
import { voice } from './services/voice';
import { SignInScreen } from './screens/SignInScreen';
import { ChannelsScreen } from './screens/ChannelsScreen';
import { ChannelScreen } from './screens/ChannelScreen';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  useEffect(() => {
    // Check if user came in via an invite link (e.g. ?invite=xyz)
    const urlParams = new URLSearchParams(window.location.search);
    const inviteParam = urlParams.get('invite');
    if (inviteParam) {
      setPendingInviteCode(inviteParam);
      // Clean query parameter from URL without page reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check existing authentication token
    const token = api.getToken();
    if (token) {
      api.me()
        .then((res) => {
          setCurrentUser(res.user);
          realtime.connect(token);
        })
        .catch(() => {
          api.logout();
          setCurrentUser(null);
        })
        .finally(() => {
          setIsCheckingAuth(false);
        });
    } else {
      setIsCheckingAuth(false);
    }
  }, []);

  // When user is authenticated and there is a pending invite link, join automatically
  useEffect(() => {
    if (currentUser && pendingInviteCode) {
      api.joinByInvite(pendingInviteCode)
        .then(async (res) => {
          setPendingInviteCode(null);
          const channels = await api.getChannels();
          const target = channels.find((c) => c.id === res.channelId);
          if (target) {
            setActiveChannel(target);
          }
        })
        .catch((err) => {
          console.warn('Auto-join invite failed:', err.message);
          setPendingInviteCode(null);
        });
    }
  }, [currentUser, pendingInviteCode]);

  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    const token = api.getToken();
    if (token) {
      realtime.connect(token);
    }
  };

  const handleLogout = () => {
    voice.disconnect();
    realtime.disconnect();
    api.logout();
    setCurrentUser(null);
    setActiveChannel(null);
  };

  if (isCheckingAuth) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-400">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-semibold">Initializing Walkie Talkie...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col w-full h-full bg-slate-950 select-none overflow-hidden">
      {!currentUser ? (
        <SignInScreen onSuccess={handleAuthSuccess} />
      ) : activeChannel ? (
        <ChannelScreen
          channel={activeChannel}
          currentUser={currentUser}
          onBack={() => setActiveChannel(null)}
        />
      ) : (
        <ChannelsScreen
          currentUser={currentUser}
          onSelectChannel={(ch) => setActiveChannel(ch)}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
};
