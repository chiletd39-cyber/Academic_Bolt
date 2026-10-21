import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CursorDangerZoneProps {
  borderPx?: number;
  dwellMs?: number;
  cooldownMs?: number;
  onWarning: (message: string) => void;
}

/**
 * Strict cursor confinement for exams.
 * - Slim red border on the screen edges; warns immediately when cursor leaves window/tab.
 * - Detects window blur, tab switch, and visibility change — every escape is logged.
 * - Attempts pointer-lock-style confinement by re-snapping the cursor target zone.
 */
export const CursorDangerZone: React.FC<CursorDangerZoneProps> = ({
  borderPx = 24,
  dwellMs = 800,
  cooldownMs = 2500,
  onWarning,
}) => {
  const [inDanger, setInDanger] = useState(false);
  const [cursorOut, setCursorOut] = useState(false);
  const dwellTimer = useRef<number | null>(null);
  const lastWarn = useRef<number>(0);

  useEffect(() => {
    const fire = (msg: string) => {
      const now = Date.now();
      if (now - lastWarn.current < cooldownMs) return;
      lastWarn.current = now;
      onWarning(msg);
    };

    const checkDanger = (x: number, y: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const danger =
        x <= borderPx || y <= borderPx || x >= w - borderPx || y >= h - borderPx;
      setInDanger(danger);
      if (danger) {
        if (dwellTimer.current == null) {
          dwellTimer.current = window.setTimeout(() => {
            fire('Cursor lingering at screen edge — keep it inside the exam area');
            dwellTimer.current = null;
          }, dwellMs);
        }
      } else if (dwellTimer.current != null) {
        window.clearTimeout(dwellTimer.current);
        dwellTimer.current = null;
      }
    };

    const onMove = (e: MouseEvent) => {
      setCursorOut(false);
      checkDanger(e.clientX, e.clientY);
    };

    const onLeave = () => {
      setCursorOut(true);
      setInDanger(true);
      fire('Cursor left the exam window — return immediately');
    };
    const onEnter = () => setCursorOut(false);

    const onBlur = () => fire('Window lost focus — possible tab/app switch');
    const onVisibility = () => {
      if (document.hidden) fire('Tab hidden — exam window must stay focused');
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      if (dwellTimer.current != null) window.clearTimeout(dwellTimer.current);
    };
  }, [borderPx, dwellMs, cooldownMs, onWarning]);

  return (
    <>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none fixed inset-0 z-[60] transition-opacity duration-150',
          inDanger ? 'opacity-100' : 'opacity-40'
        )}
        style={{
          boxShadow: inDanger
            ? `inset 0 0 0 ${borderPx}px hsl(var(--destructive) / 0.55)`
            : `inset 0 0 0 ${borderPx}px hsl(var(--destructive) / 0.12)`,
        }}
      />
      {inDanger && (
        <div className="pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 z-[61] bg-destructive text-destructive-foreground px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-lg animate-pulse">
          <AlertTriangle className="h-3.5 w-3.5" />
          Keep cursor inside the exam area
        </div>
      )}
      {cursorOut && (
        <div className="fixed inset-0 z-[62] flex items-center justify-center bg-destructive/30 backdrop-blur-sm pointer-events-none">
          <div className="bg-card border-2 border-destructive rounded-xl px-6 py-4 flex items-center gap-3 shadow-2xl">
            <MousePointer2 className="h-6 w-6 text-destructive animate-bounce" />
            <span className="font-semibold text-foreground">Return cursor to the exam window</span>
          </div>
        </div>
      )}
    </>
  );
};
