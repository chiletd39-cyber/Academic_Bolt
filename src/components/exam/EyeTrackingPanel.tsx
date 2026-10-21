import React, { useEffect, useRef, useState } from 'react';
import { Eye, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EyeTrackingPanelProps {
  onDeviationChange: (deviation: number) => void;
  onWarning: (message: string) => void;
  className?: string;
}

export const EyeTrackingPanel: React.FC<EyeTrackingPanelProps> = ({
  onDeviationChange,
  onWarning,
  className,
}) => {
  const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
  const [deviation, setDeviation] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const warningTriggeredRef = useRef(false);
  const deviationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sustainedDeviationStartRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      const deltaX = (e.clientX - centerX) / centerX;
      const deltaY = (e.clientY - centerY) / centerY;
      
      const clampedX = Math.max(-1, Math.min(1, deltaX));
      const clampedY = Math.max(-1, Math.min(1, deltaY));
      
      setEyePosition({ x: clampedX, y: clampedY });
      
      // Calculate deviation angle (0-90 degrees) — more sensitive mapping
      const rawDeviation = Math.sqrt(clampedX ** 2 + clampedY ** 2) * 90;
      const newDeviation = Math.min(90, rawDeviation);
      setDeviation(newDeviation);
      onDeviationChange(newDeviation);

      // Warnings handled by CursorDangerZone overlay; this panel only visualizes deviation.
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (deviationTimeoutRef.current) {
        clearTimeout(deviationTimeoutRef.current);
      }
    };
  }, [onDeviationChange, onWarning]);

  const getDeviationColor = () => {
    if (deviation < 25) return 'text-success';
    if (deviation < 45) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className={cn('p-4 rounded-lg bg-card border border-border', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Eye Tracking</span>
        </div>
        {warningCount > 0 && (
          <div className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-xs font-medium">{warningCount} warnings</span>
          </div>
        )}
      </div>
      
      {/* Eye visualization */}
      <div className="flex justify-center gap-4 mb-3">
        {[0, 1].map((eyeIndex) => (
          <div
            key={eyeIndex}
            className="relative w-12 h-12 rounded-full bg-card border-2 border-border overflow-hidden"
          >
            <div
              className="absolute w-6 h-6 rounded-full bg-foreground transition-all duration-75"
              style={{
                left: `calc(50% + ${eyePosition.x * 8}px - 12px)`,
                top: `calc(50% + ${eyePosition.y * 6}px - 12px)`,
              }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-background" />
            </div>
          </div>
        ))}
      </div>
      
      {/* Deviation meter with zone markers */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Deviation</span>
          <span className={cn(getDeviationColor(), 'font-medium')}>{Math.round(deviation)}°</span>
        </div>
        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-100',
              deviation < 25 ? 'bg-success' : deviation < 45 ? 'bg-warning' : 'bg-destructive'
            )}
            style={{ width: `${Math.min(100, (deviation / 90) * 100)}%` }}
          />
          {/* 45° marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-warning/70"
            style={{ left: '50%' }}
          />
          {/* 70° marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-destructive"
            style={{ left: `${(70 / 90) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>0°</span>
          <span className="text-warning">45° warn</span>
          <span className="text-destructive">70° alert</span>
          <span>90°</span>
        </div>
      </div>
    </div>
  );
};