import { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff, Wifi, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NetworkStatusBanner = () => {
  const { online, offlineSince, graceExpired } = useNetworkStatus();
  const [showRecovered, setShowRecovered] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const handler = () => {
      setShowRecovered(true);
      window.setTimeout(() => setShowRecovered(false), 2500);
    };
    window.addEventListener('network:recovered', handler);
    return () => window.removeEventListener('network:recovered', handler);
  }, []);

  useEffect(() => {
    if (!offlineSince) { setElapsed(0); return; }
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - offlineSince) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [offlineSince]);

  if (online && !showRecovered) return null;

  if (online && showRecovered) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/90 text-white shadow-lg backdrop-blur">
          <Wifi className="w-4 h-4" />
          <span className="text-sm font-medium">Back online — restoring session…</span>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, 120 - elapsed);
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in">
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-2 rounded-full shadow-lg backdrop-blur text-white',
          graceExpired ? 'bg-destructive/95' : 'bg-amber-500/95'
        )}
        role="alert"
      >
        {graceExpired ? <AlertTriangle className="w-4 h-4" /> : <WifiOff className="w-4 h-4 animate-pulse" />}
        <span className="text-sm font-medium">
          {graceExpired
            ? 'Still offline — your unsaved drafts may expire soon.'
            : `Connection lost — your work is saved for ${remaining}s while we retry…`}
        </span>
      </div>
    </div>
  );
};
