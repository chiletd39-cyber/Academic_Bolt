import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Camera, CameraOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WebcamMonitorProps {
  onHeadMovement: (x: number, y: number) => void;
  onWarning: (message: string) => void;
  className?: string;
}

export interface WebcamMonitorHandle {
  getVideoElement: () => HTMLVideoElement | null;
}

export const WebcamMonitor = forwardRef<WebcamMonitorHandle, WebcamMonitorProps>(({
  onHeadMovement,
  onWarning,
  className,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [headWarnings, setHeadWarnings] = useState(0);
  const lastWarningTimeRef = useRef<number>(0);
  const sustainedTurnStartRef = useRef<number | null>(null);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
  }));

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsActive(true);
      }
    } catch (error) {
      console.error('Failed to start webcam:', error);
    }
  }, []);

  const stopWebcam = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setIsActive(false);
    }
  }, []);

  useEffect(() => {
    if (!isActive || !videoRef.current) return;
    let animFrameId: number;

    const analyzeFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== 4) {
        animFrameId = requestAnimationFrame(analyzeFrame);
        return;
      }
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) { animFrameId = requestAnimationFrame(analyzeFrame); return; }

      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let cx = 0, cy = 0, count = 0;
      for (let y = 0; y < canvas.height; y += 4) {
        for (let x = 0; x < canvas.width; x += 4) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
            cx += x; cy += y; count++;
          }
        }
      }
      if (count > 0) {
        cx /= count; cy /= count;
        const yaw = ((cx - canvas.width / 2) / (canvas.width / 2)) * 45;
        const pitch = ((cy - canvas.height / 2) / (canvas.height / 2)) * 30;
        lastPositionRef.current = { x: yaw, y: pitch };
        onHeadMovement(yaw, pitch);
        const now = Date.now();
        if (Math.abs(yaw) > 20 || Math.abs(pitch) > 15) {
          if (!sustainedTurnStartRef.current) {
            sustainedTurnStartRef.current = now;
          } else if (now - sustainedTurnStartRef.current > 2000 && now - lastWarningTimeRef.current > 4000) {
            lastWarningTimeRef.current = now;
            sustainedTurnStartRef.current = null;
            setHeadWarnings(prev => prev + 1);
            onWarning(`Head turned away from screen (yaw: ${Math.round(yaw)}°, pitch: ${Math.round(pitch)}°)`);
          }
        } else {
          sustainedTurnStartRef.current = null;
        }
      }
      setTimeout(() => { animFrameId = requestAnimationFrame(analyzeFrame); }, 200);
    };
    animFrameId = requestAnimationFrame(analyzeFrame);
    return () => { cancelAnimationFrame(animFrameId); };
  }, [isActive, onHeadMovement, onWarning]);

  useEffect(() => {
    startWebcam();
    return () => stopWebcam();
  }, [startWebcam, stopWebcam]);

  return (
    <div className={cn('relative rounded-lg overflow-hidden bg-muted', className)}>
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        {isActive ? (
          <><div className="w-2 h-2 rounded-full bg-success animate-pulse" /><Camera className="w-4 h-4 text-success" /></>
        ) : (
          <><div className="w-2 h-2 rounded-full bg-destructive" /><CameraOff className="w-4 h-4 text-destructive" /></>
        )}
      </div>
      {headWarnings > 0 && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-destructive/80 text-destructive-foreground px-1.5 py-0.5 rounded text-[10px]">
          <AlertTriangle className="w-3 h-3" />{headWarnings}
        </div>
      )}
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
          <p className="text-sm text-muted-foreground">Camera disabled</p>
        </div>
      )}
    </div>
  );
});
WebcamMonitor.displayName = 'WebcamMonitor';
