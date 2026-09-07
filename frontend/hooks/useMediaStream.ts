import { useState, useCallback, useRef, useEffect } from 'react';

interface MediaState {
  stream: MediaStream | null;
  hasCameraPermission: boolean;
  hasMicPermission: boolean;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
  error: string | null;
}

export function useMediaStream() {
  const [state, setState] = useState<MediaState>({
    stream: null,
    hasCameraPermission: true,
    hasMicPermission: true,
    isVideoEnabled: true,
    isAudioEnabled: true,
    isScreenSharing: false,
    error: null,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const initializeMedia = useCallback(async () => {
    try {
      // Clean up existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      streamRef.current = mediaStream;

      setState(prev => ({
        ...prev,
        stream: mediaStream,
        hasCameraPermission: true,
        hasMicPermission: true,
        isVideoEnabled: true,
        isAudioEnabled: true,
        error: null,
      }));
    } catch (err: any) {
      console.warn('Media permission error:', err);
      
      setState(prev => ({
        ...prev,
        stream: null,
        hasCameraPermission: false,
        hasMicPermission: false,
        isVideoEnabled: false,
        isAudioEnabled: false,
        error: 'Camera or Microphone access denied. You can still join the meeting.',
      }));
    }
  }, []);

  const toggleVideo = useCallback(() => {
    setState(prev => {
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach(track => {
          track.enabled = !prev.isVideoEnabled;
        });
      }
      return { ...prev, isVideoEnabled: !prev.isVideoEnabled };
    });
  }, []);

  const toggleAudio = useCallback(() => {
    setState(prev => {
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(track => {
          track.enabled = !prev.isAudioEnabled;
        });
      }
      return { ...prev, isAudioEnabled: !prev.isAudioEnabled };
    });
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      screenStreamRef.current = screenStream;

      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      setState(prev => ({ ...prev, isScreenSharing: true }));
      return screenStream;
    } catch (err) {
      console.error('Screen share error:', err);
      return null;
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setState(prev => ({ ...prev, isScreenSharing: false }));
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        // Disconnect from video elements
        track.dispatchEvent(new Event('ended'));
      });
      streamRef.current = null;
    }
    stopScreenShare();
    setState(prev => ({ ...prev, stream: null }));
  }, [stopScreenShare]);

  useEffect(() => {
    return () => {
      // Automatic cleanup when the hook unmounts (e.g., navigating away, back button)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
    };
  }, []);

  return {
    ...state,
    initializeMedia,
    toggleVideo,
    toggleAudio,
    startScreenShare,
    stopScreenShare,
    cleanup,
  };
}
