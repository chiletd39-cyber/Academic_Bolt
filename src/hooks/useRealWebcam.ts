import { useState, useRef, useCallback, useEffect } from 'react';

interface WebcamState {
  isActive: boolean;
  stream: MediaStream | null;
  error: string | null;
}

export const useRealWebcam = () => {
  const [state, setState] = useState<WebcamState>({
    isActive: false,
    stream: null,
    error: null,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });
      
      setState({ isActive: true, stream, error: null });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      return stream;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to access webcam';
      setState({ isActive: false, stream: null, error });
      throw err;
    }
  }, []);

  const stopWebcam = useCallback(() => {
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
    }
    setState({ isActive: false, stream: null, error: null });
  }, [state.stream]);

  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (element && state.stream) {
      element.srcObject = state.stream;
    }
  }, [state.stream]);

  useEffect(() => {
    return () => {
      if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    ...state,
    videoRef,
    setVideoRef,
    startWebcam,
    stopWebcam,
  };
};
