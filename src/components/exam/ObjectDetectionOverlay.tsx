import React from 'react';
import { ShieldAlert, Smartphone, Monitor, Users } from 'lucide-react';

interface ObjectDetectionOverlayProps {
  threats: string[];
  visible: boolean;
}

export const ObjectDetectionOverlay: React.FC<ObjectDetectionOverlayProps> = ({ threats, visible }) => {
  if (!visible) return null;

  const getThreatIcon = (threat: string) => {
    if (threat.includes('cell phone')) return <Smartphone className="w-6 h-6" />;
    if (threat.includes('tv') || threat.includes('laptop') || threat.includes('monitor'))
      return <Monitor className="w-6 h-6" />;
    if (threat.includes('persons')) return <Users className="w-6 h-6" />;
    return <ShieldAlert className="w-6 h-6" />;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-xl bg-destructive/20 pointer-events-auto">
      <div className="bg-card border border-destructive rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-destructive mb-2">Security Threat Detected</h2>
        <p className="text-muted-foreground mb-4">
          Prohibited objects have been detected. The exam page is blurred until the threat is removed.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {threats.map((threat, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20"
            >
              {getThreatIcon(threat)}
              {threat}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Remove the detected object(s) from camera view to continue.
        </p>
      </div>
    </div>
  );
};
