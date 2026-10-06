import { useEffect, useState } from 'react';
import { getAudioContext } from './useSpeaking';

/** Smoothed microphone loudness in the range 0..1, for level meters. */
export function useAudioLevel(stream: MediaStream | null, enabled = true): number {
  const [level, setLevel] = useState(0);

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
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const timer = setInterval(() => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      setLevel(prev => prev * 0.5 + Math.min(1, sum / data.length / 80) * 0.5);
    }, 100);
    return () => { clearInterval(timer); source.disconnect(); };
  }, [stream, enabled]);

  return stream && enabled ? level : 0;
}
