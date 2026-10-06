import { useEffect, useRef } from 'react';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const captionsSupported = () => getCtor() !== null;

/**
 * Live captions via the browser's speech recognition (Chrome, Edge, Safari). Each participant transcribes
 * their OWN microphone and shares the text, so no audio is ever sent to our servers.
 * `active` should be false while muted.
 */
export function useCaptions(active: boolean, onText: (text: string, final: boolean) => void, onUnavailable?: () => void) {
  const onTextRef = useRef(onText);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onTextRef.current = onText;
    onUnavailableRef.current = onUnavailable;
  });

  useEffect(() => {
    const Ctor = getCtor();
    if (!active || !Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    let stopped = false;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        if (text) onTextRef.current(text, e.results[i].isFinal);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true;
        onUnavailableRef.current?.();
      }
    };
    // Recognition ends on its own after silence; keep it going while captions are on.
    rec.onend = () => { if (!stopped) { try { rec.start(); } catch { /* already started */ } } };
    try { rec.start(); } catch { /* ignore */ }

    return () => {
      stopped = true;
      rec.onend = null;
      try { rec.stop(); } catch { /* ignore */ }
    };
  }, [active]);
}
