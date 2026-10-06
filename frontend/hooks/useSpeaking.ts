import { useEffect, useState } from 'react';

let sharedContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    sharedContext = new Ctor();
  }
  return sharedContext;
}

/** True while the audio in `stream` is above a small loudness threshold. Cheap polling analyser. */
export function useSpeaking(stream: MediaStream | null, enabled: boolean): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !enabled || stream.getAudioTracks().length === 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    let source: MediaStreamAudioSourceNode;
    try {
      source = ctx.createMediaStreamSource(stream);
    } catch {
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const timer = setInterval(() => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      setSpeaking(sum / data.length > 12);
    }, 200);

    return () => {
      clearInterval(timer);
      source.disconnect();
    };
  }, [stream, enabled]);

  // Derived, so a muted/removed stream reads as "not speaking" without resetting state in the effect.
  return speaking && !!stream && enabled;
}
