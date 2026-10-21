import { useState, useRef, useCallback, useEffect } from 'react';

// COCO-SSD detected class names we care about
const THREAT_OBJECTS = ['cell phone', 'laptop', 'tv', 'remote', 'book'];
const PERSON_CLASS = 'person';

interface DetectedObject {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

interface ObjectDetectionState {
  isModelLoaded: boolean;
  isDetecting: boolean;
  threatDetected: boolean;
  detectedThreats: string[];
  multiplePersons: boolean;
  lastDetection: DetectedObject[];
}

interface UseObjectDetectionOptions {
  enabled: boolean;
  videoElement: HTMLVideoElement | null;
  onThreatDetected?: (threats: string[]) => void;
  detectionInterval?: number; // ms between detections
  confidenceThreshold?: number;
}

export const useObjectDetection = ({
  enabled,
  videoElement,
  onThreatDetected,
  detectionInterval = 2000,
  confidenceThreshold = 0.5,
}: UseObjectDetectionOptions) => {
  const [state, setState] = useState<ObjectDetectionState>({
    isModelLoaded: false,
    isDetecting: false,
    threatDetected: false,
    detectedThreats: [],
    multiplePersons: false,
    lastDetection: [],
  });

  const modelRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);
  const onThreatRef = useRef(onThreatDetected);
  onThreatRef.current = onThreatDetected;

  // Load model
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const loadModel = async () => {
      try {
        // Dynamic import to avoid loading heavy libs when not needed
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        await import('@tensorflow/tfjs');

        if (cancelled) return;

        const model = await cocoSsd.load({
          base: 'lite_mobilenet_v2', // Lightweight for browser
        });

        if (cancelled) return;

        modelRef.current = model;
        setState(prev => ({ ...prev, isModelLoaded: true }));
        console.log('[ObjectDetection] COCO-SSD model loaded');
      } catch (err) {
        console.error('[ObjectDetection] Failed to load model:', err);
      }
    };

    loadModel();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Run detection loop
  useEffect(() => {
    if (!enabled || !state.isModelLoaded || !videoElement || !modelRef.current) return;

    const detect = async () => {
      if (!modelRef.current || !videoElement || videoElement.readyState < 2) return;

      try {
        const predictions = await modelRef.current.detect(videoElement);
        
        const detected: DetectedObject[] = predictions
          .filter((p: any) => p.score >= confidenceThreshold)
          .map((p: any) => ({
            class: p.class,
            score: p.score,
            bbox: p.bbox,
          }));

        // Check for threat objects
        const threats = detected
          .filter(d => THREAT_OBJECTS.includes(d.class))
          .map(d => d.class);

        // Check for multiple persons
        const personCount = detected.filter(d => d.class === PERSON_CLASS).length;
        const multiplePersons = personCount > 1;

        if (multiplePersons) {
          threats.push(`${personCount} persons detected`);
        }

        const threatDetected = threats.length > 0;

        setState(prev => ({
          ...prev,
          isDetecting: true,
          threatDetected,
          detectedThreats: threats,
          multiplePersons,
          lastDetection: detected,
        }));

        if (threatDetected && onThreatRef.current) {
          onThreatRef.current(threats);
        }
      } catch (err) {
        // Silently handle detection errors (e.g., video not ready)
      }
    };

    // Initial detection
    detect();

    // Set interval
    intervalRef.current = window.setInterval(detect, detectionInterval);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, state.isModelLoaded, videoElement, detectionInterval, confidenceThreshold]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      modelRef.current = null;
    };
  }, []);

  const clearThreat = useCallback(() => {
    setState(prev => ({
      ...prev,
      threatDetected: false,
      detectedThreats: [],
    }));
  }, []);

  return { ...state, clearThreat };
};
