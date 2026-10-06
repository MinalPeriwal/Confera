import { useState, useCallback, useRef, useEffect } from 'react';
import { startBackgroundBlur, BlurPipeline } from '@/lib/backgroundBlur';
import { readPrefs, writePrefs, MeetingPrefs } from '@/lib/prefs';

export type MediaStatus = 'idle' | 'requesting' | 'ready' | 'unavailable';

export interface DeviceLists {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

interface MediaState {
  stream: MediaStream | null;
  status: MediaStatus;
  hasCamera: boolean;
  hasMic: boolean;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  error: string | null;
  devices: DeviceLists;
  cameraId: string;
  micId: string;
  speakerId: string;
  blur: 'off' | 'loading' | 'on';
}

const NO_DEVICES: DeviceLists = { cameras: [], mics: [], speakers: [] };

const INITIAL_STATE: MediaState = {
  stream: null,
  status: 'idle',
  hasCamera: false,
  hasMic: false,
  isVideoEnabled: false,
  isAudioEnabled: false,
  error: null,
  devices: NO_DEVICES,
  cameraId: '',
  micId: '',
  speakerId: '',
  blur: 'off',
};

type Prefs = MeetingPrefs;

function describeMediaError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera and microphone access was blocked. Allow access in your browser\'s site settings, then try again. You can still join without them.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera or microphone was found. You can still join and listen.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Your camera or microphone is being used by another application. Close it and try again, or join without them.';
    default:
      return 'Could not access your camera or microphone. You can still join the meeting.';
  }
}

const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/** getUserMedia with graceful degradation: video+audio -> audio only -> video only. */
async function acquireStream(prefs: Prefs): Promise<{ stream: MediaStream | null; error: unknown }> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      error: { name: 'SecurityError', message: 'Media devices require a secure (https) context' },
    };
  }
  const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  if (prefs.cameraId) video.deviceId = { ideal: prefs.cameraId };
  const audio: MediaTrackConstraints = { ...AUDIO_CONSTRAINTS };
  if (prefs.micId) audio.deviceId = { ideal: prefs.micId };

  const attempts: MediaStreamConstraints[] = [{ video, audio }, { audio }, { video }];
  let firstError: unknown = null;
  for (const constraints of attempts) {
    try {
      return { stream: await navigator.mediaDevices.getUserMedia(constraints), error: null };
    } catch (err) {
      firstError ??= err;
      // Permission was explicitly denied: retrying with fewer devices will not help.
      if ((err as { name?: string })?.name === 'NotAllowedError') break;
    }
  }
  return { stream: null, error: firstError };
}

async function listDevices(): Promise<DeviceLists> {
  if (!navigator.mediaDevices?.enumerateDevices) return NO_DEVICES;
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter(d => d.kind === 'videoinput'),
    mics: all.filter(d => d.kind === 'audioinput'),
    speakers: all.filter(d => d.kind === 'audiooutput'),
  };
}

export function useMediaStream() {
  const [state, setState] = useState<MediaState>(INITIAL_STATE);
  const streamRef = useRef<MediaStream | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const unmountedRef = useRef(false);
  // With background blur on, the stream carries the processed track; the raw camera lives here.
  const rawCameraRef = useRef<MediaStreamTrack | null>(null);
  const blurRef = useRef<BlurPipeline | null>(null);
  const setBlurRef = useRef<(on: boolean, remember?: boolean) => Promise<void>>(async () => {});

  const stopStream = useCallback(() => {
    blurRef.current?.stop();
    blurRef.current = null;
    rawCameraRef.current?.stop();
    rawCameraRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  /** Mark the matching "has device" flag false if a track dies mid-call (device unplugged). */
  const watchTracks = useCallback((stream: MediaStream) => {
    stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (streamRef.current !== stream || !stream.getTracks().includes(track)) return;
        setState(prev => track.kind === 'video'
          ? { ...prev, hasCamera: false, isVideoEnabled: false }
          : { ...prev, hasMic: false, isAudioEnabled: false });
      });
    });
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await listDevices();
      if (!unmountedRef.current) setState(prev => ({ ...prev, devices }));
    } catch { /* enumeration unsupported */ }
  }, []);

  const initializeMedia = useCallback((force = false) => {
    if (initPromiseRef.current && !force) return initPromiseRef.current;

    const run = (async () => {
      setState(prev => ({ ...prev, status: 'requesting', error: null }));
      const prefs = readPrefs();
      const { stream, error } = await acquireStream(prefs);
      if (unmountedRef.current) {
        stream?.getTracks().forEach(t => t.stop());
        return;
      }

      stopStream();
      const devices = await listDevices().catch(() => NO_DEVICES);
      if (!stream) {
        setState({ ...INITIAL_STATE, status: 'unavailable', error: describeMediaError(error), devices, speakerId: prefs.speakerId ?? '' });
        return;
      }

      streamRef.current = stream;
      watchTracks(stream);
      const hasCamera = stream.getVideoTracks().length > 0;
      const hasMic = stream.getAudioTracks().length > 0;
      // Honour the "join muted" / "join with camera off" preferences from Settings
      if (prefs.joinMuted) stream.getAudioTracks().forEach(t => { t.enabled = false; });
      if (prefs.joinCameraOff) stream.getVideoTracks().forEach(t => { t.enabled = false; });
      setState({
        stream,
        status: 'ready',
        hasCamera,
        hasMic,
        isVideoEnabled: hasCamera && !prefs.joinCameraOff,
        isAudioEnabled: hasMic && !prefs.joinMuted,
        error: hasCamera && hasMic
          ? null
          : hasMic
            ? 'No camera was found. You will join with audio only.'
            : 'No microphone was found. You will join without audio.',
        devices,
        cameraId: stream.getVideoTracks()[0]?.getSettings().deviceId ?? '',
        micId: stream.getAudioTracks()[0]?.getSettings().deviceId ?? '',
        speakerId: prefs.speakerId ?? '',
        blur: 'off',
      });
      if (prefs.blur && hasCamera) void setBlurRef.current(true, false); // restore the user's last choice
    })();

    initPromiseRef.current = run;
    return run;
  }, [stopStream, watchTracks]);

  const setAudioEnabled = useCallback((enabled: boolean) => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    tracks.forEach(t => { t.enabled = enabled; });
    setState(prev => ({ ...prev, isAudioEnabled: enabled }));
  }, []);

  const setVideoEnabled = useCallback((enabled: boolean) => {
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) return;
    tracks.forEach(t => { t.enabled = enabled; });
    setState(prev => ({ ...prev, isVideoEnabled: enabled }));
  }, []);

  const toggleAudio = useCallback(() => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) return false;
    const next = !tracks[0].enabled;
    setAudioEnabled(next);
    return next;
  }, [setAudioEnabled]);

  const toggleVideo = useCallback(() => {
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) return false;
    const next = !tracks[0].enabled;
    setVideoEnabled(next);
    return next;
  }, [setVideoEnabled]);

  /**
   * Switch camera or microphone mid-call. A NEW MediaStream is published so the WebRTC layer swaps
   * the track on every peer connection (replaceTrack): nobody has to rejoin.
   */
  const switchDevice = useCallback(async (kind: 'video' | 'audio', deviceId: string) => {
    const constraints: MediaStreamConstraints = kind === 'video'
      ? { video: { deviceId: { exact: deviceId } } }
      : { audio: { deviceId: { exact: deviceId }, ...AUDIO_CONSTRAINTS } };
    const fresh = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = fresh.getTracks()[0];
    if (unmountedRef.current) { newTrack.stop(); return; }

    const wasBlurred = kind === 'video' && !!blurRef.current;
    if (wasBlurred) {
      // The raw camera behind the blur is being replaced; the blur is re-applied to the new one below.
      blurRef.current?.stop();
      blurRef.current = null;
      rawCameraRef.current?.stop();
      rawCameraRef.current = null;
    }
    const old = streamRef.current;
    const oldOfKind = old?.getTracks().filter(t => t.kind === kind) ?? [];
    newTrack.enabled = oldOfKind.length ? oldOfKind[0].enabled : true; // keep the user's muted/camera-off choice
    oldOfKind.forEach(t => t.stop());

    const next = new MediaStream([...(old?.getTracks().filter(t => t.kind !== kind) ?? []), newTrack]);
    streamRef.current = next;
    watchTracks(next);
    writePrefs(kind === 'video' ? { cameraId: deviceId } : { micId: deviceId });
    setState(prev => ({
      ...prev,
      stream: next,
      status: 'ready',
      ...(kind === 'video'
        ? { hasCamera: true, isVideoEnabled: newTrack.enabled, cameraId: deviceId, blur: 'off' as const }
        : { hasMic: true, isAudioEnabled: newTrack.enabled, micId: deviceId }),
    }));
    void refreshDevices();
    if (wasBlurred) void setBlurRef.current(true, false);
  }, [watchTracks, refreshDevices]);

  /** Blur (or restore) the background. The processed track replaces the camera on every peer connection. */
  const setBlur = useCallback(async (on: boolean, remember = true) => {
    const current = streamRef.current;
    if (!current) return;
    if (on) {
      const camera = current.getVideoTracks()[0];
      if (!camera || blurRef.current) return;
      setState(prev => ({ ...prev, blur: 'loading' }));
      try {
        const pipeline = await startBackgroundBlur(camera);
        if (unmountedRef.current || streamRef.current !== current) { pipeline.stop(); return; }
        pipeline.track.enabled = camera.enabled;
        blurRef.current = pipeline;
        rawCameraRef.current = camera;
        camera.addEventListener('ended', () => {
          if (rawCameraRef.current === camera) setState(prev => ({ ...prev, hasCamera: false, isVideoEnabled: false }));
        });
        const next = new MediaStream([...current.getAudioTracks(), pipeline.track]);
        streamRef.current = next;
        if (remember) writePrefs({ blur: true });
        setState(prev => ({ ...prev, stream: next, blur: 'on' }));
      } catch (err) {
        console.warn('Background blur unavailable', err);
        setState(prev => ({ ...prev, blur: 'off' }));
        throw err;
      }
    } else {
      const raw = rawCameraRef.current;
      const pipeline = blurRef.current;
      if (remember) writePrefs({ blur: false });
      if (!raw || !pipeline) { setState(prev => ({ ...prev, blur: 'off' })); return; }
      raw.enabled = pipeline.track.enabled;
      pipeline.stop();
      blurRef.current = null;
      rawCameraRef.current = null;
      const next = new MediaStream([...current.getAudioTracks(), raw]);
      streamRef.current = next;
      setState(prev => ({ ...prev, stream: next, blur: 'off' }));
    }
  }, []);
  useEffect(() => { setBlurRef.current = (on, remember) => setBlur(on, remember).catch(() => {}); }, [setBlur]);

  const setSpeaker = useCallback((deviceId: string) => {
    writePrefs({ speakerId: deviceId });
    setState(prev => ({ ...prev, speakerId: deviceId }));
  }, []);

  const cleanup = useCallback(() => {
    stopStream();
    initPromiseRef.current = null;
    setState(prev => ({ ...INITIAL_STATE, devices: prev.devices, speakerId: prev.speakerId }));
  }, [stopStream]);

  useEffect(() => {
    unmountedRef.current = false;
    const onDeviceChange = () => { void refreshDevices(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      unmountedRef.current = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      stopStream();
    };
  }, [stopStream, refreshDevices]);

  return {
    ...state,
    initializeMedia,
    retry: () => initializeMedia(true),
    setAudioEnabled,
    setVideoEnabled,
    toggleAudio,
    toggleVideo,
    switchDevice,
    setSpeaker,
    setBlur,
    cleanup,
  };
}

export type MediaController = ReturnType<typeof useMediaStream>;
