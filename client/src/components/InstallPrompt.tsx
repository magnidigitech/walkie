import React, { useState, useEffect } from 'react';
import { Download, Share2, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  if (isStandalone || dismissed) return null;

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  return (
    <div className="mb-4 p-3 bg-gradient-to-r from-slate-800 to-slate-900 border border-emerald-500/30 rounded-xl shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Install Walkie Talkie App</div>
            <div className="text-xs text-slate-400">Add to home screen for instant full-screen PTT</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {deferredPrompt ? (
            <button
              onClick={handleInstallClick}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20"
            >
              <Download className="w-3.5 h-3.5" />
              Install
            </button>
          ) : isIos ? (
            <button
              onClick={() => setShowIosGuide(!showIosGuide)}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              How to Install
            </button>
          ) : null}

          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-slate-400 hover:text-slate-200"
            aria-label="Dismiss install notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showIosGuide && (
        <div className="mt-3 pt-3 border-t border-slate-700/60 text-xs text-slate-300 space-y-1.5">
          <p className="font-medium text-emerald-400">To install on iPhone / iPad Safari:</p>
          <ol className="list-decimal pl-4 space-y-1 text-slate-400">
            <li>Tap the <span className="text-white font-semibold">Share button</span> at the bottom of Safari.</li>
            <li>Scroll down and tap <span className="text-white font-semibold">Add to Home Screen</span>.</li>
            <li>Tap <span className="text-white font-semibold">Add</span> in the top right.</li>
          </ol>
        </div>
      )}
    </div>
  );
};
