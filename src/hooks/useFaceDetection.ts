import { useState, useRef, useCallback, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';

interface FaceDetectionState {
  isLoading: boolean;
  isDetecting: boolean;
  headRotation: { yaw: number; pitch: number };
  eyeGaze: { x: number; y: number; deviation: number };
  faceDetected: boolean;
  error: string | null;
}

export const useFaceDetection = (
  videoElement: HTMLVideoElement | null,
  onHeadWarning?: () => void,
  onEyeWarning?: () => void
) => {
  const [state, setState] = useState<FaceDetectionState>({
    isLoading: true,
    isDetecting: false,
    headRotation: { yaw: 0, pitch: 0 },
    eyeGaze: { x: 0, y: 0, deviation: 0 },
    faceDetected: false,
    error: null,
  });

  const animationFrameRef = useRef<number>(0);
  const lastHeadWarningRef = useRef<number>(0);
  const lastEyeWarningRef = useRef<number>(0);
  const headTurnStartRef = useRef<number | null>(null);
  const eyeDeviationStartRef = useRef<number | null>(null);

  const initTensorFlow = useCallback(async () => {
    try {
      await tf.ready();
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Failed to initialize face detection' 
      }));
    }
  }, []);

  const startDetection = useCallback(() => {
    if (!videoElement || state.isLoading) return;

    setState(prev => ({ ...prev, isDetecting: true }));

    const detect = () => {
      if (!videoElement || videoElement.readyState !== 4) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      // Simulated face detection with realistic behavior
      // In production, use @tensorflow-models/face-landmarks-detection
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(videoElement, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Simple face presence detection based on skin tone pixels
        let skinPixels = 0;
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Simple skin tone detection
          if (r > 95 && g > 40 && b > 20 && 
              r > g && r > b && 
              Math.abs(r - g) > 15) {
            skinPixels++;
          }
        }
        
        const totalPixels = (canvas.width * canvas.height) / 16;
        const skinRatio = skinPixels / totalPixels;
        const faceDetected = skinRatio > 0.05;
        
        // Calculate center of mass for head position estimation
        let centerX = 0, centerY = 0, count = 0;
        for (let y = 0; y < canvas.height; y += 8) {
          for (let x = 0; x < canvas.width; x += 8) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            if (r > 95 && g > 40 && b > 20 && r > g && r > b) {
              centerX += x;
              centerY += y;
              count++;
            }
          }
        }
        
        if (count > 0) {
          centerX /= count;
          centerY /= count;
        }
        
        // Convert to rotation angles
        const yaw = ((centerX - canvas.width / 2) / (canvas.width / 2)) * 45;
        const pitch = ((centerY - canvas.height / 2) / (canvas.height / 2)) * 30;
        
        // Eye gaze estimation (simplified)
        const eyeDeviation = Math.abs(yaw) + Math.abs(pitch) * 0.5;
        
        const now = Date.now();
        
        // Head rotation warning logic
        if (Math.abs(yaw) > 25 || Math.abs(pitch) > 20) {
          if (!headTurnStartRef.current) {
            headTurnStartRef.current = now;
          } else if (now - headTurnStartRef.current > 3000 && now - lastHeadWarningRef.current > 5000) {
            onHeadWarning?.();
            lastHeadWarningRef.current = now;
            headTurnStartRef.current = null;
          }
        } else {
          headTurnStartRef.current = null;
        }
        
        // Eye gaze warning logic
        if (eyeDeviation > 35) {
          if (!eyeDeviationStartRef.current) {
            eyeDeviationStartRef.current = now;
          } else if (now - eyeDeviationStartRef.current > 1500 && now - lastEyeWarningRef.current > 5000) {
            onEyeWarning?.();
            lastEyeWarningRef.current = now;
            eyeDeviationStartRef.current = null;
          }
        } else {
          eyeDeviationStartRef.current = null;
        }
        
        setState(prev => ({
          ...prev,
          faceDetected,
          headRotation: { yaw, pitch },
          eyeGaze: { x: yaw, y: pitch, deviation: eyeDeviation },
        }));
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    detect();
  }, [videoElement, state.isLoading, onHeadWarning, onEyeWarning]);

  const stopDetection = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setState(prev => ({ ...prev, isDetecting: false }));
  }, []);

  useEffect(() => {
    initTensorFlow();
  }, [initTensorFlow]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startDetection,
    stopDetection,
  };
};
