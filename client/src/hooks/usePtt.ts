import { useState, useEffect, useRef, useCallback } from 'react';
import { CurrentSpeaker, PttState, User } from '../types';
import { realtime } from '../services/realtime';
import { voice } from '../services/voice';

interface UsePttOptions {
  channelId: string;
  currentUser: User;
  onAudioBlocked?: () => void;
}

export function usePtt({ channelId, currentUser }: UsePttOptions) {
  const [pttState, setPttState] = useState<PttState>('IDLE');
  const [currentSpeaker, setCurrentSpeaker] = useState<CurrentSpeaker | null>(null);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);

  const isHoldingRef = useRef<boolean>(false);
  const pttStateRef = useRef<PttState>('IDLE');
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync for event listeners
  isHoldingRef.current = isHolding;
  pttStateRef.current = pttState;

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatIntervalRef.current = setInterval(() => {
      realtime.sendHeartbeat(channelId);
    }, 1500); // 1.5s interval (well within 3.5s watchdog)
  }, [channelId, stopHeartbeat]);

  // Halts transmission and informs backend
  const stopTalkingAndRelease = useCallback(async () => {
    stopHeartbeat();
    await voice.stopTransmitting();
    realtime.releaseSpeak(channelId);
  }, [channelId, stopHeartbeat]);

  // Press down handler (touch, mouse, keydown)
  const pressStart = useCallback(async () => {
    // If not online, busy, or already holding, ignore
    if (!navigator.onLine) {
      setPttState('OFFLINE');
      return;
    }

    if (currentSpeaker && currentSpeaker.id !== currentUser.id) {
      // Channel currently held by someone else
      setPttState('BUSY');
      return;
    }

    if (isHoldingRef.current) return;

    setIsHolding(true);
    setPttState('CONNECTING');
    setMicError(null);

    // Request speaking turn from server arbiter
    realtime.requestSpeak(channelId);
  }, [channelId, currentSpeaker, currentUser.id]);

  // Release handler (touchend, mouseup, keyup, blur, cancel)
  const pressEnd = useCallback(async () => {
    if (!isHoldingRef.current) return;

    setIsHolding(false);

    // If we were currently transmitting or waiting for server grant
    await stopTalkingAndRelease();

    if (currentSpeaker && currentSpeaker.id !== currentUser.id) {
      setPttState('BUSY');
    } else {
      setPttState('IDLE');
    }
  }, [stopTalkingAndRelease, currentSpeaker, currentUser.id]);

  // Handle incoming realtime arbiter events
  useEffect(() => {
    const unsubSpeaker = realtime.on('CURRENT_SPEAKER_CHANGE', (data: any) => {
      if (data.channelId !== channelId) return;
      const speaker: CurrentSpeaker | null = data.speaker;
      setCurrentSpeaker(speaker);

      if (speaker) {
        if (speaker.id !== currentUser.id) {
          setPttState('BUSY');
          // If another speaker was granted, ensure we are not holding
          if (isHoldingRef.current) {
            setIsHolding(false);
            stopTalkingAndRelease();
          }
        } else {
          setPttState('TALKING');
        }
      } else {
        // Channel is now free
        if (!isHoldingRef.current) {
          setPttState('IDLE');
        }
      }
    });

    const unsubGrant = realtime.on('GRANT_SPEAK', async (data: any) => {
      if (data.channelId !== channelId) return;

      // If user is still holding the button
      if (isHoldingRef.current) {
        const result = await voice.startTransmitting();
        if (result.success) {
          setPttState('TALKING');
          startHeartbeat();
        } else {
          // Transmission failure (voice room not connected or mic permission denied)
          setIsHolding(false);
          setPttState('MIC_DENIED');
          setMicError(result.error || 'Voice error. Tap to retry.');
          await stopTalkingAndRelease();
        }
      } else {
        // User already released before server responded (quick press-and-release race)
        console.log('[PTT] Quick press released before server grant; releasing immediately');
        await stopTalkingAndRelease();
        setPttState('IDLE');
      }
    });

    const unsubDeny = realtime.on('DENY_SPEAK', (data: any) => {
      if (data.channelId !== channelId) return;
      setIsHolding(false);
      stopHeartbeat();
      if (data.currentSpeaker) {
        setCurrentSpeaker(data.currentSpeaker);
        setPttState('BUSY');
      } else {
        setPttState('IDLE');
      }
    });

    const unsubRevoke = realtime.on('REVOKE_SPEAK', async (data: any) => {
      if (data.channelId !== channelId) return;
      console.log('[PTT] Speaking turn revoked by server (timeout or preempted):', data.reason);
      setIsHolding(false);
      stopHeartbeat();
      await voice.stopTransmitting();
      setPttState('IDLE');
    });

    const unsubState = realtime.on('CHANNEL_STATE', (data: any) => {
      if (data.channelId !== channelId) return;
      setCurrentSpeaker(data.currentSpeaker);
      if (data.currentSpeaker && data.currentSpeaker.id !== currentUser.id) {
        setPttState('BUSY');
      } else {
        setPttState('IDLE');
      }
    });

    return () => {
      unsubSpeaker();
      unsubGrant();
      unsubDeny();
      unsubRevoke();
      unsubState();
    };
  }, [channelId, currentUser.id, startHeartbeat, stopTalkingAndRelease, stopHeartbeat]);

  // Window blur, visibility change, and network change listeners
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isHoldingRef.current) {
        console.log('[PTT] Visibility hidden (app minimized/backgrounded); stopping transmission immediately');
        pressEnd();
      }
    };

    const handleWindowBlur = () => {
      if (isHoldingRef.current) {
        console.log('[PTT] Window lost focus; stopping transmission immediately');
        pressEnd();
      }
    };

    const handleOffline = () => {
      console.log('[PTT] Network offline');
      if (isHoldingRef.current) {
        pressEnd();
      }
      setPttState('OFFLINE');
    };

    const handleOnline = () => {
      console.log('[PTT] Network reconnected; requiring user to press again');
      // Do not auto-resume! User must press button again.
      setIsHolding(false);
      setPttState('IDLE');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [pressEnd]);

  // Global Spacebar shortcut listener for desktop users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (!isInput && !e.repeat) {
          e.preventDefault();
          pressStart();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (!isInput) {
          e.preventDefault();
          pressEnd();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pressStart, pressEnd]);

  return {
    pttState,
    currentSpeaker,
    isHolding,
    micError,
    pressStart,
    pressEnd,
    resetMicError: () => setMicError(null),
  };
}
