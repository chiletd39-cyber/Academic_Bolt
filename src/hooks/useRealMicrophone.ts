import { useState, useRef, useCallback, useEffect } from 'react';

interface MicrophoneState {
  isActive: boolean;
  soundLevel: number;
  error: string | null;
}

export const useRealMicrophone = (onHighSound?: (level: number) => void) => {
  const [state, setState] = useState<MicrophoneState>({
    isActive: false,
    soundLevel: 0,
    error: null,
  });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>(0);

  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      setState(prev => ({ ...prev, isActive: true, error: null }));
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(average / 128 * 7, 7); // Scale to 0-7
        
        setState(prev => ({ ...prev, soundLevel: normalizedLevel }));
        
        if (normalizedLevel > 3.5 && onHighSound) {
          onHighSound(normalizedLevel);
        }
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
      return stream;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to access microphone';
      setState({ isActive: false, soundLevel: 0, error });
      throw err;
    }
  }, [onHighSound]);

  const stopMicrophone = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    analyserRef.current = null;
    setState({ isActive: false, soundLevel: 0, error: null });
  }, []);

  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, []);

  return {
    ...state,
    startMicrophone,
    stopMicrophone,
  };
};
