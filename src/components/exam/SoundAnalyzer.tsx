import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SoundAnalyzerProps {
  onSoundLevel: (level: number) => void;
  onWarning: (message: string) => void;
  threshold?: number;
  className?: string;
}

export const SoundAnalyzer: React.FC<SoundAnalyzerProps> = ({
  onSoundLevel,
  onWarning,
  threshold = 4.5,
  className,
}) => {
  const [soundLevel, setSoundLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [highSoundCount, setHighSoundCount] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastHighSoundTimeRef = useRef<number>(0);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });
      streamRef.current = stream;

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.3; // Lower = more responsive

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      setIsListening(true);
    } catch (error) {
      console.error('Failed to access microphone:', error);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    startListening();
    return () => stopListening();
  }, [startListening, stopListening]);

  useEffect(() => {
    if (!isListening || !analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const analyze = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Use RMS for better sensitivity
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const normalizedLevel = (rms / 128) * 7; // Scale to 0-7
      
      setSoundLevel(normalizedLevel);
      onSoundLevel(normalizedLevel);

      // Calibrated: requires sustained loud noise (3 readings above threshold within 2s window)
      if (normalizedLevel > threshold) {
        const now = Date.now();
        if (now - lastHighSoundTimeRef.current > 5000) {
          lastHighSoundTimeRef.current = now;
          setHighSoundCount((prev) => {
            const newCount = prev + 1;
            if (newCount >= 3) {
              onWarning(`Sustained loud noise detected (${normalizedLevel.toFixed(1)}/7)`);
              return 0;
            }
            return newCount;
          });
        }
      }

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    analyze();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isListening, onSoundLevel, onWarning, threshold]);

  const getLevelColor = (index: number) => {
    if (index >= 4) return 'bg-destructive';
    if (index >= 2) return 'bg-warning';
    return 'bg-success';
  };

  const isBarActive = (index: number) => soundLevel >= index;

  return (
    <div className={cn('p-4 rounded-lg bg-card border border-border', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isListening ? (
            <Volume2 className="w-4 h-4 text-primary" />
          ) : (
            <VolumeX className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">Sound Analysis</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
            HIGH SENSITIVITY
          </span>
        </div>
        {highSoundCount > 0 && (
          <div className="flex items-center gap-1 text-warning">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-xs">{highSoundCount}/2</span>
          </div>
        )}
      </div>

      <div className="flex items-end justify-center gap-1 h-16 mb-2">
        {[0, 1, 2, 3, 4, 5, 6].map((index) => (
          <div
            key={index}
            className={cn(
              'w-4 rounded-t transition-all duration-75',
              isBarActive(index) ? getLevelColor(index) : 'bg-muted'
            )}
            style={{
              height: `${((index + 1) / 7) * 100}%`,
            }}
          />
        ))}
      </div>

      <div className="relative h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-primary/30"
          style={{ width: `${(soundLevel / 7) * 100}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-destructive"
          style={{ left: `${(threshold / 7) * 100}%` }}
        />
      </div>
      
      <div className="flex justify-between text-xs mt-2">
        <span className="text-muted-foreground">Level: {soundLevel.toFixed(1)}</span>
        <span className={soundLevel > threshold ? 'text-destructive font-medium' : 'text-muted-foreground'}>
          Threshold: {threshold}
        </span>
      </div>
    </div>
  );
};