import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { Shield, Clock, AlertTriangle, User, Monitor, Wifi, Cast } from 'lucide-react';
import { WebcamMonitor, WebcamMonitorHandle } from './WebcamMonitor';
import { EyeTrackingPanel } from './EyeTrackingPanel';
import { SoundAnalyzer } from './SoundAnalyzer';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface ScreenProtectionState {
  isExternalDisplayDetected: boolean;
  isScreenSharing: boolean;
  isPictureInPicture: boolean;
  displayCount: number;
}

interface SecuritySidebarProps {
  warningCount: number;
  maxWarnings: number;
  remainingTime: number;
  studentToken: string;
  screenProtection?: ScreenProtectionState;
  onHeadMovement: (x: number, y: number) => void;
  onEyeDeviation: (deviation: number) => void;
  onSoundLevel: (level: number) => void;
  onWarning: (type: 'head' | 'eye' | 'sound', message: string) => void;
}

export interface SecuritySidebarHandle {
  getVideoElement: () => HTMLVideoElement | null;
}

export const SecuritySidebar = forwardRef<SecuritySidebarHandle, SecuritySidebarProps>(({
  warningCount,
  maxWarnings,
  remainingTime,
  studentToken,
  screenProtection,
  onHeadMovement,
  onEyeDeviation,
  onSoundLevel,
  onWarning,
}, ref) => {
  const webcamRef = useRef<WebcamMonitorHandle>(null);

  useImperativeHandle(ref, () => ({
    getVideoElement: () => webcamRef.current?.getVideoElement() || null,
  }));
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getWarningColor = () => {
    if (warningCount === 0) return 'bg-success';
    if (warningCount < maxWarnings - 1) return 'bg-warning';
    return 'bg-destructive';
  };

  const hasScreenViolation = screenProtection && (
    screenProtection.isExternalDisplayDetected ||
    screenProtection.isScreenSharing ||
    screenProtection.isPictureInPicture
  );

  return (
    <div className="w-80 h-full bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Exam Security</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          All activities are being monitored
        </p>
      </div>

      {/* Timer & Token */}
      <div className="p-4 space-y-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Time Remaining</span>
          </div>
          <span className={cn(
            'font-mono text-lg font-semibold',
            remainingTime < 300 ? 'text-destructive' : 'text-foreground'
          )}>
            {formatTime(remainingTime)}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Token</span>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            {studentToken}
          </Badge>
        </div>
      </div>

      {/* Screen Protection Status */}
      {screenProtection && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Screen Protection</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-2 h-2 rounded-full',
                hasScreenViolation ? 'bg-destructive animate-pulse' : 'bg-success'
              )} />
              <span className="text-xs font-medium">
                {hasScreenViolation ? 'VIOLATION' : 'SECURE'}
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className={cn(
              'flex flex-col items-center p-2 rounded-lg border text-center',
              screenProtection.isExternalDisplayDetected 
                ? 'border-destructive/50 bg-destructive/10' 
                : 'border-border bg-muted/30'
            )}>
              <Cast className={cn(
                'w-4 h-4 mb-1',
                screenProtection.isExternalDisplayDetected ? 'text-destructive' : 'text-muted-foreground'
              )} />
              <span className="text-[10px] leading-tight">External Display</span>
              <span className={cn(
                'text-[10px] font-semibold mt-0.5',
                screenProtection.isExternalDisplayDetected ? 'text-destructive' : 'text-success'
              )}>
                {screenProtection.displayCount > 1 ? `${screenProtection.displayCount} found` : 'None'}
              </span>
            </div>
            
            <div className={cn(
              'flex flex-col items-center p-2 rounded-lg border text-center',
              screenProtection.isScreenSharing 
                ? 'border-destructive/50 bg-destructive/10' 
                : 'border-border bg-muted/30'
            )}>
              <Wifi className={cn(
                'w-4 h-4 mb-1',
                screenProtection.isScreenSharing ? 'text-destructive' : 'text-muted-foreground'
              )} />
              <span className="text-[10px] leading-tight">Screen Share</span>
              <span className={cn(
                'text-[10px] font-semibold mt-0.5',
                screenProtection.isScreenSharing ? 'text-destructive' : 'text-success'
              )}>
                {screenProtection.isScreenSharing ? 'Active' : 'None'}
              </span>
            </div>
            
            <div className={cn(
              'flex flex-col items-center p-2 rounded-lg border text-center',
              screenProtection.isPictureInPicture 
                ? 'border-destructive/50 bg-destructive/10' 
                : 'border-border bg-muted/30'
            )}>
              <Monitor className={cn(
                'w-4 h-4 mb-1',
                screenProtection.isPictureInPicture ? 'text-destructive' : 'text-muted-foreground'
              )} />
              <span className="text-[10px] leading-tight">PiP Mode</span>
              <span className={cn(
                'text-[10px] font-semibold mt-0.5',
                screenProtection.isPictureInPicture ? 'text-destructive' : 'text-success'
              )}>
                {screenProtection.isPictureInPicture ? 'Active' : 'None'}
              </span>
            </div>
          </div>
          
          {hasScreenViolation && (
            <p className="text-xs text-destructive mt-2 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>Screen protection violation detected! Please disable external displays, screen sharing, and PiP mode.</span>
            </p>
          )}
        </div>
      )}

      {/* Warnings */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Warnings</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full', getWarningColor())} />
            <span className="text-sm font-medium">
              {warningCount} / {maxWarnings}
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: maxWarnings }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 h-1.5 rounded-full',
                i < warningCount ? 'bg-destructive' : 'bg-muted'
              )}
            />
          ))}
        </div>
        {warningCount >= maxWarnings - 1 && warningCount < maxWarnings && (
          <p className="text-xs text-destructive mt-2">
            ⚠️ One more warning will force submit your exam
          </p>
        )}
      </div>

      {/* Monitoring Components */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Webcam */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Head & Webcam Analysis
          </h4>
          <WebcamMonitor
            ref={webcamRef}
            className="h-40"
            onHeadMovement={onHeadMovement}
            onWarning={(msg) => onWarning('head', msg)}
          />
        </div>

        <Separator />

        {/* Eye Tracking */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Eye Tracking Panel
          </h4>
          <EyeTrackingPanel
            onDeviationChange={onEyeDeviation}
            onWarning={(msg) => onWarning('eye', msg)}
          />
        </div>

        <Separator />

        {/* Sound Analysis */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Sound Analysis Engine
          </h4>
          <SoundAnalyzer
            onSoundLevel={onSoundLevel}
            onWarning={(msg) => onWarning('sound', msg)}
            threshold={2}
          />
        </div>
      </div>
    </div>
  );
});
SecuritySidebar.displayName = 'SecuritySidebar';
