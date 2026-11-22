import React, { useState } from 'react';
import { Radio, Lock, User as UserIcon, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { User } from '../types';

interface SignInScreenProps {
  onSuccess: (user: User) => void;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ onSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!displayName.trim()) {
          setError('Display name is required');
          setLoading(false);
          return;
        }
        const res = await api.register(username.trim(), displayName.trim(), password);
        onSuccess(res.user);
      } else {
        const res = await api.login(username.trim(), password);
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-8 max-w-md mx-auto w-full">
      {/* Brand Logo & Title */}
      <div className="text-center mb-8">
        <div className="inline-flex p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4 shadow-xl shadow-emerald-500/10">
          <Radio className="w-12 h-12" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Walkie Talkie</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time Push-to-Talk voice channels</p>
      </div>

      {/* Auth Card */}
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
        {/* Tab Switcher */}
        <div className="flex bg-slate-950 p-1 rounded-xl mb-6 border border-slate-800/80">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(null); }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              !isRegister
                ? 'bg-emerald-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(null); }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              isRegister
                ? 'bg-emerald-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Username</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <UserIcon className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="e.g. alex24"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Display Name (Call Sign)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex (Base Alpha)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{isRegister ? 'Register & Enter' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
