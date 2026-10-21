import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SecurityPolicy {
  blocked_shortcuts: string[];
  prohibited_apps: string[];
  allow_secondary_monitor: boolean;
  block_clipboard: boolean;
  force_fullscreen: boolean;
}

const DEFAULT_POLICY: SecurityPolicy = {
  blocked_shortcuts: [],
  prohibited_apps: [],
  allow_secondary_monitor: false,
  block_clipboard: true,
  force_fullscreen: true,
};

function parseShortcut(s: string) {
  const parts = s.split('+').map(p => p.trim().toLowerCase());
  return {
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('win'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    key: parts[parts.length - 1],
  };
}

function logViolation(type: string, message: string, taskId?: string) {
  try {
    (supabase as any).rpc('log_audit', {
      _action_type: 'create',
      _resource_type: 'exam',
      _resource_id: taskId ?? null,
      _target_label: 'Security violation',
      _metadata: { type, message, ts: new Date().toISOString() },
      _device_info: { ua: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight}` },
    });
  } catch {}
}

export interface SecurityWarning {
  id: string;
  type: 'head' | 'eye' | 'sound' | 'tab';
  message: string;
  timestamp: Date;
}

export interface ExamSecurityState {
  isFullscreen: boolean;
  warnings: SecurityWarning[];
  warningCount: number;
  maxWarnings: number;
  isForceSubmitted: boolean;
  headPosition: { x: number; y: number };
  eyeDeviation: number;
  soundLevel: number;
  remainingTime: number;
  studentToken: string;
  isTimerRunning: boolean;
}

export const useExamSecurity = (maxWarnings = 3) => {
  const [state, setState] = useState<ExamSecurityState>({
    isFullscreen: false,
    warnings: [],
    warningCount: 0,
    maxWarnings,
    isForceSubmitted: false,
    headPosition: { x: 0, y: 0 },
    eyeDeviation: 0,
    soundLevel: 0,
    remainingTime: 3600,
    studentToken: `STU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    isTimerRunning: false,
  });

  const timerRef = useRef<number | null>(null);
  const fullscreenRetryRef = useRef<number | null>(null);
  const policyRef = useRef<SecurityPolicy>(DEFAULT_POLICY);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('exam_security_config').select('*').limit(1).maybeSingle();
        if (data) policyRef.current = {
          blocked_shortcuts: data.blocked_shortcuts ?? [],
          prohibited_apps: data.prohibited_apps ?? [],
          allow_secondary_monitor: !!data.allow_secondary_monitor,
          block_clipboard: data.block_clipboard !== false,
          force_fullscreen: data.force_fullscreen !== false,
        };
      } catch {}
    })();
  }, []);

  const addWarning = useCallback((type: SecurityWarning['type'], message: string) => {
    setState((prev) => {
      const newWarning: SecurityWarning = {
        id: crypto.randomUUID(),
        type,
        message,
        timestamp: new Date(),
      };
      const newWarnings = [...prev.warnings, newWarning];
      const newCount = prev.warningCount + 1;

      if (newCount >= prev.maxWarnings) {
        return {
          ...prev,
          warnings: newWarnings,
          warningCount: newCount,
          isForceSubmitted: true,
          isTimerRunning: false,
        };
      }

      return {
        ...prev,
        warnings: newWarnings,
        warningCount: newCount,
      };
    });
  }, []);

  const updateHeadPosition = useCallback((x: number, y: number) => {
    setState((prev) => ({
      ...prev,
      headPosition: { x, y },
    }));
  }, []);

  const updateEyeDeviation = useCallback((deviation: number) => {
    setState((prev) => ({
      ...prev,
      eyeDeviation: deviation,
    }));
  }, []);

  const updateSoundLevel = useCallback((level: number) => {
    setState((prev) => ({
      ...prev,
      soundLevel: level,
    }));
  }, []);

  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setState((prev) => ({ ...prev, isFullscreen: true }));
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    setState((prev) => ({ ...prev, isFullscreen: false }));
  }, []);

  const startTimer = useCallback((durationSeconds: number) => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
    }

    setState((prev) => ({ 
      ...prev, 
      remainingTime: durationSeconds,
      isTimerRunning: true,
    }));
    
    timerRef.current = window.setInterval(() => {
      setState((prev) => {
        if (prev.remainingTime <= 1) {
          if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return { 
            ...prev, 
            remainingTime: 0, 
            isForceSubmitted: true,
            isTimerRunning: false,
          };
        }
        return { ...prev, remainingTime: prev.remainingTime - 1 };
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState((prev) => ({ ...prev, isTimerRunning: false }));
  }, []);

  const resetSecurity = useCallback(() => {
    stopTimer();
    setState({
      isFullscreen: false,
      warnings: [],
      warningCount: 0,
      maxWarnings,
      isForceSubmitted: false,
      headPosition: { x: 0, y: 0 },
      eyeDeviation: 0,
      soundLevel: 0,
      remainingTime: 3600,
      studentToken: `STU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      isTimerRunning: false,
    });
  }, [maxWarnings, stopTimer]);

  const setMaxWarnings = useCallback((newMax: number) => {
    setState((prev) => ({ ...prev, maxWarnings: newMax }));
  }, []);

  // STRICT fullscreen: warn on every exit AND auto re-enter immediately.
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setState((prev) => {
        if (!isFs && prev.isTimerRunning && !prev.isForceSubmitted) {
          const msg = 'Fullscreen exited — re-entering. Repeated attempts will force submit.';
          logViolation('fullscreen_exit', msg);
          const newWarning: SecurityWarning = {
            id: crypto.randomUUID(), type: 'tab', message: msg, timestamp: new Date(),
          };
          const newWarnings = [...prev.warnings, newWarning];
          const newCount = prev.warningCount + 1;

          if (policyRef.current.force_fullscreen) {
            if (fullscreenRetryRef.current) window.clearTimeout(fullscreenRetryRef.current);
            fullscreenRetryRef.current = window.setTimeout(async () => {
              try { await document.documentElement.requestFullscreen(); } catch {}
            }, 150);
          }

          if (newCount >= prev.maxWarnings) {
            return { ...prev, warnings: newWarnings, warningCount: newCount, isFullscreen: false, isForceSubmitted: true, isTimerRunning: false };
          }
          return { ...prev, warnings: newWarnings, warningCount: newCount, isFullscreen: false };
        }
        return { ...prev, isFullscreen: isFs };
      });
    };

    // Built-in always-blocked shortcuts + admin-policy shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      const lower = k.toLowerCase();
      const isFKey = /^F([1-9]|1[0-2])$/.test(k);
      const isBlockedSingle = k === 'Escape' || k === 'F11' || k === 'F12' || isFKey ||
                              k === 'ContextMenu' || k === 'PrintScreen';
      const ctrlBlocked = (e.ctrlKey || e.metaKey) && [
        'w','t','n','r','p','s','u','o','f','g','h','j','k','l','d','b'
      ].includes(lower);
      const ctrlShiftBlocked = (e.ctrlKey || e.metaKey) && e.shiftKey && ['i','j','c','n','t','p','k'].includes(lower);
      const altBlocked = e.altKey && (k === 'Tab' || k === 'F4' || k === 'Escape' || lower === 'd' || lower === 'home');
      const metaTab = e.metaKey && (k === 'Tab' || lower === 'd');

      // Admin policy
      const policyMatch = policyRef.current.blocked_shortcuts.some(s => {
        const p = parseShortcut(s);
        return p.key === lower &&
          p.ctrl === !!e.ctrlKey && p.meta === !!e.metaKey &&
          p.alt === !!e.altKey && p.shift === !!e.shiftKey;
      });

      if (isBlockedSingle || ctrlBlocked || ctrlShiftBlocked || altBlocked || metaTab || policyMatch) {
        setState(prev => {
          if (prev.isTimerRunning && !prev.isForceSubmitted) {
            e.preventDefault();
            e.stopPropagation();
            logViolation('blocked_shortcut', `Blocked key: ${[e.ctrlKey&&'Ctrl',e.metaKey&&'Meta',e.altKey&&'Alt',e.shiftKey&&'Shift',k].filter(Boolean).join('+')}`);
          }
          return prev;
        });
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      setState(prev => {
        if (prev.isTimerRunning && !prev.isForceSubmitted) e.preventDefault();
        return prev;
      });
    };
    const handleCopyPaste = (e: ClipboardEvent) => {
      if (!policyRef.current.block_clipboard) return;
      setState(prev => {
        if (prev.isTimerRunning && !prev.isForceSubmitted) {
          e.preventDefault();
          logViolation('clipboard', `Clipboard ${e.type} blocked`);
        }
        return prev;
      });
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.isTimerRunning && !state.isForceSubmitted) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const handleVisibility = () => {
      if (document.hidden) {
        setState(prev => {
          if (!prev.isTimerRunning || prev.isForceSubmitted) return prev;
          logViolation('tab_hidden', 'Tab/window hidden during exam');
          return prev;
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('copy', handleCopyPaste, true);
    document.addEventListener('cut', handleCopyPaste, true);
    document.addEventListener('paste', handleCopyPaste, true);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Multi-monitor detection (respect allow_secondary_monitor policy)
    const checkMultiMonitor = () => {
      if (policyRef.current.allow_secondary_monitor) return;
      const isExtended = (window.screen as any).isExtended;
      if (isExtended) {
        setState(prev => {
          if (!prev.isTimerRunning || prev.isForceSubmitted) return prev;
          const msg = 'Multi-monitor setup detected — disconnect external display';
          logViolation('multi_monitor', msg);
          const w: SecurityWarning = { id: crypto.randomUUID(), type: 'tab', message: msg, timestamp: new Date() };
          return { ...prev, warnings: [...prev.warnings, w], warningCount: prev.warningCount + 1 };
        });
      }
    };
    const mmInterval = window.setInterval(checkMultiMonitor, 5000);
    checkMultiMonitor();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('copy', handleCopyPaste, true);
      document.removeEventListener('cut', handleCopyPaste, true);
      document.removeEventListener('paste', handleCopyPaste, true);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.clearInterval(mmInterval);
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (fullscreenRetryRef.current) window.clearTimeout(fullscreenRetryRef.current);
    };
  }, []);

  return {
    state,
    addWarning,
    updateHeadPosition,
    updateEyeDeviation,
    updateSoundLevel,
    enterFullscreen,
    exitFullscreen,
    startTimer,
    stopTimer,
    resetSecurity,
    setMaxWarnings,
  };
};
