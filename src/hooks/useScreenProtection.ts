import { useState, useCallback, useEffect, useRef } from 'react';

export interface ScreenProtectionState {
  isExternalDisplayDetected: boolean;
  isScreenSharing: boolean;
  isPictureInPicture: boolean;
  displayCount: number;
  lastViolation: string | null;
  violations: Array<{
    type: 'external_display' | 'screen_share' | 'pip' | 'display_change';
    message: string;
    timestamp: Date;
  }>;
}

interface UseScreenProtectionOptions {
  enabled?: boolean;
  onViolation?: (type: string, message: string) => void;
}

export const useScreenProtection = (options: UseScreenProtectionOptions = {}) => {
  const { enabled = true, onViolation } = options;
  
  const [state, setState] = useState<ScreenProtectionState>({
    isExternalDisplayDetected: false,
    isScreenSharing: false,
    isPictureInPicture: false,
    displayCount: 1,
    lastViolation: null,
    violations: [],
  });

  const violationReportedRef = useRef<Set<string>>(new Set());

  // Add violation to state
  const addViolation = useCallback((type: ScreenProtectionState['violations'][0]['type'], message: string) => {
    const violationKey = `${type}-${message}`;
    
    // Prevent duplicate violations within short time
    if (violationReportedRef.current.has(violationKey)) {
      return;
    }
    
    violationReportedRef.current.add(violationKey);
    
    // Clear the key after 10 seconds to allow re-reporting
    setTimeout(() => {
      violationReportedRef.current.delete(violationKey);
    }, 10000);

    setState(prev => ({
      ...prev,
      lastViolation: message,
      violations: [...prev.violations, { type, message, timestamp: new Date() }],
    }));
    
    onViolation?.(type, message);
  }, [onViolation]);

  // Detect multiple displays using Screen API
  const checkDisplays = useCallback(async () => {
    if (!enabled) return;

    try {
      // Check if Screen API is available (modern browsers)
      if ('screen' in window && 'isExtended' in window.screen) {
        const isExtended = (window.screen as { isExtended?: boolean }).isExtended;
        
        if (isExtended) {
          setState(prev => ({ ...prev, isExternalDisplayDetected: true }));
          addViolation('external_display', 'Extended display detected! Please disconnect external monitors during exam.');
        }
      }

      // Use the experimental getScreenDetails API if available
      if ('getScreenDetails' in window) {
        try {
          const screenDetails = await (window as unknown as { getScreenDetails: () => Promise<{ screens: unknown[] }> }).getScreenDetails();
          const screenCount = screenDetails.screens?.length || 1;
          
          setState(prev => ({ ...prev, displayCount: screenCount }));
          
          if (screenCount > 1) {
            setState(prev => ({ ...prev, isExternalDisplayDetected: true }));
            addViolation('external_display', `Multiple displays (${screenCount}) detected! Disconnect external displays during exam.`);
          }
        } catch {
          // Permission denied or API not supported
          console.log('Screen details API not available or permission denied');
        }
      }

      // Check screen resolution changes that might indicate external display
      const checkResolutionChange = () => {
        const aspectRatio = window.screen.width / window.screen.height;
        const isUnusualRatio = aspectRatio > 2.5 || aspectRatio < 1; // Unusual for standard monitors
        
        if (isUnusualRatio && window.screen.width > 2560) {
          setState(prev => ({ ...prev, isExternalDisplayDetected: true }));
          addViolation('external_display', 'Unusual screen configuration detected. Please use only your primary display.');
        }
      };
      
      checkResolutionChange();
    } catch (error) {
      console.error('Error checking displays:', error);
    }
  }, [enabled, addViolation]);

  // Detect Picture-in-Picture mode
  const checkPictureInPicture = useCallback(() => {
    if (!enabled) return;

    if (document.pictureInPictureElement) {
      setState(prev => ({ ...prev, isPictureInPicture: true }));
      addViolation('pip', 'Picture-in-Picture mode detected! Please close any floating video windows.');
    }
  }, [enabled, addViolation]);

  // Monitor for screen sharing (check if display media is active)
  const monitorScreenSharing = useCallback(() => {
    if (!enabled) return;

    // Listen for display-capture permission changes
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'display-capture' as PermissionName })
        .then(status => {
          if (status.state === 'granted') {
            // User has granted screen capture permission - potential sharing
            setState(prev => ({ ...prev, isScreenSharing: true }));
            addViolation('screen_share', 'Screen sharing permission detected! Screen sharing is not allowed during exam.');
          }
          
          status.addEventListener('change', () => {
            if (status.state === 'granted') {
              setState(prev => ({ ...prev, isScreenSharing: true }));
              addViolation('screen_share', 'Screen sharing started! This is not allowed during exam.');
            }
          });
        })
        .catch(() => {
          // Permission API not supported for display-capture
        });
    }
  }, [enabled, addViolation]);

  // Detect if browser is being cast (Chromecast, AirPlay, etc.)
  const detectCasting = useCallback(() => {
    if (!enabled) return;

    // Check for Presentation API (used for casting)
    if ('presentation' in navigator) {
      const presentation = (navigator as unknown as { presentation: { defaultRequest?: unknown } }).presentation;
      
      if (presentation?.defaultRequest) {
        addViolation('screen_share', 'Casting/mirroring detected! Please disable screen casting during exam.');
      }
    }

    // Check for Remote Playback API
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      if ('remote' in video) {
        const remoteVideo = video as HTMLVideoElement & { remote: { state?: string } };
        if (remoteVideo.remote.state === 'connected' || remoteVideo.remote.state === 'connecting') {
          addViolation('screen_share', 'Remote video playback detected! Please disable casting.');
        }
      }
    });
  }, [enabled, addViolation]);

  // Block common screen capture shortcuts
  const blockCaptureShortcuts = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Block common screenshot/recording shortcuts
    const blockedCombinations = [
      { key: 'PrintScreen', ctrl: false, shift: false, alt: false },
      { key: 's', ctrl: true, shift: true, alt: false }, // Windows Game Bar
      { key: 'r', ctrl: true, shift: true, alt: false }, // Windows Game Bar record
      { key: '3', ctrl: false, shift: true, alt: false, meta: true }, // Mac screenshot
      { key: '4', ctrl: false, shift: true, alt: false, meta: true }, // Mac screenshot
      { key: '5', ctrl: false, shift: true, alt: false, meta: true }, // Mac recording
    ];

    for (const combo of blockedCombinations) {
      const matches = 
        e.key === combo.key &&
        e.ctrlKey === combo.ctrl &&
        e.shiftKey === combo.shift &&
        e.altKey === combo.alt &&
        (!('meta' in combo) || e.metaKey === combo.meta);
      
      if (matches) {
        e.preventDefault();
        e.stopPropagation();
        addViolation('screen_share', 'Screenshot/recording attempt blocked! This action is not allowed during exam.');
        return;
      }
    }

    // Block PrintScreen key specifically
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      addViolation('screen_share', 'Screenshot attempt blocked! Screenshots are not allowed during exam.');
    }
  }, [enabled, addViolation]);

  // Initialize protection
  useEffect(() => {
    if (!enabled) return;

    // Initial checks
    checkDisplays();
    checkPictureInPicture();
    monitorScreenSharing();
    detectCasting();

    // Set up event listeners
    window.addEventListener('keydown', blockCaptureShortcuts, true);
    window.addEventListener('keyup', blockCaptureShortcuts, true);
    
    // Listen for resize events (might indicate display changes)
    const handleResize = () => {
      setTimeout(checkDisplays, 500);
    };
    window.addEventListener('resize', handleResize);

    // Listen for PiP changes
    document.addEventListener('enterpictureinpicture', () => {
      setState(prev => ({ ...prev, isPictureInPicture: true }));
      addViolation('pip', 'Picture-in-Picture mode activated! Please exit PiP mode.');
    });
    
    document.addEventListener('leavepictureinpicture', () => {
      setState(prev => ({ ...prev, isPictureInPicture: false }));
    });

    // Monitor for display changes using matchMedia
    const displayChangeQuery = window.matchMedia('screen');
    const handleDisplayChange = () => {
      addViolation('display_change', 'Display configuration changed! Please maintain single display setup.');
      checkDisplays();
    };
    
    displayChangeQuery.addEventListener('change', handleDisplayChange);

    // Periodic checks
    const checkInterval = setInterval(() => {
      checkDisplays();
      checkPictureInPicture();
      detectCasting();
    }, 5000);

    return () => {
      window.removeEventListener('keydown', blockCaptureShortcuts, true);
      window.removeEventListener('keyup', blockCaptureShortcuts, true);
      window.removeEventListener('resize', handleResize);
      displayChangeQuery.removeEventListener('change', handleDisplayChange);
      clearInterval(checkInterval);
    };
  }, [enabled, checkDisplays, checkPictureInPicture, monitorScreenSharing, detectCasting, blockCaptureShortcuts, addViolation]);

  // Reset state
  const reset = useCallback(() => {
    setState({
      isExternalDisplayDetected: false,
      isScreenSharing: false,
      isPictureInPicture: false,
      displayCount: 1,
      lastViolation: null,
      violations: [],
    });
    violationReportedRef.current.clear();
  }, []);

  return {
    state,
    reset,
    checkDisplays,
    hasViolation: state.isExternalDisplayDetected || state.isScreenSharing || state.isPictureInPicture,
  };
};
