import { useEffect, useRef } from 'react';
import { Mic, MicOff, VideoOff, Shield, MonitorUp, Pin, PinOff, Hand } from 'lucide-react';
import { useSpeaking } from '@/hooks/useSpeaking';

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isHost?: boolean;
  isCohost?: boolean;
  isLocal?: boolean;
  handRaised?: boolean;
  /** Show the stream full-frame (screen content) instead of cropped/mirrored camera video. */
  isScreen?: boolean;
  compact?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
  /** Output device for remote audio (empty = system default). */
  sinkId?: string;
}

export function VideoTile({
  stream, name, isMuted, isCameraOff, isHost, isCohost, isLocal, handRaised, isScreen, compact,
  pinned, onTogglePin, onSpeakingChange, sinkId,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSpeaking = useSpeaking(stream, !isMuted);

  useEffect(() => { onSpeakingChange?.(isSpeaking); }, [isSpeaking, onSpeakingChange]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    // Autoplay can be rejected until the user interacts; they just clicked "Join", so retry quietly.
    el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [stream]);

  // Route remote audio to the chosen speaker where the browser supports it
  useEffect(() => {
    const el = videoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el?.setSinkId || isLocal) return;
    el.setSinkId(sinkId ?? '').catch(() => {});
  }, [sinkId, isLocal]);

  const initials = name.trim().substring(0, 2).toUpperCase() || 'U';
  const showVideo = !!stream && (isScreen || !isCameraOff);

  return (
    <div
      data-testid={isLocal ? 'tile-local' : 'tile-remote'}
      data-name={name}
      data-muted={isMuted}
      data-camera-off={isCameraOff}
      data-screen={!!isScreen}
      data-hand={!!handRaised}
      data-pinned={!!pinned}
      className={`group relative bg-slate-800 rounded-2xl overflow-hidden shadow-lg w-full h-full flex items-center justify-center transition-shadow duration-200 ${
        isSpeaking ? 'ring-4 ring-green-500' : pinned ? 'ring-2 ring-blue-500' : 'border border-slate-700'
      } ${compact ? 'min-h-[96px]' : 'min-h-[160px]'}`}
    >
      {/* Always mounted, even with the camera off: this element is what plays remote AUDIO. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`absolute inset-0 w-full h-full ${isScreen ? 'object-contain bg-black' : 'object-cover'} ${
          isLocal && !isScreen ? 'scale-x-[-1]' : ''
        } ${showVideo ? '' : 'invisible'}`}
      />
      {!showVideo && (
        <div className={`${compact ? 'w-12 h-12 text-lg' : 'w-20 h-20 sm:w-24 sm:h-24 text-2xl sm:text-3xl'} bg-blue-600 rounded-full flex items-center justify-center font-bold text-white shadow-lg z-[1]`}>
          {initials}
        </div>
      )}

      <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3 flex items-end justify-between z-[2]">
        <div className="bg-slate-900/70 backdrop-blur text-white px-2.5 py-1 rounded-lg flex items-center gap-2 text-xs sm:text-sm max-w-[85%]">
          {isMuted ? (
            <MicOff className="w-4 h-4 text-red-400 flex-shrink-0" />
          ) : (
            <Mic className="w-4 h-4 text-green-400 flex-shrink-0" />
          )}
          <span className="truncate">{name}{isLocal ? ' (You)' : ''}</span>
          {isScreen && <MonitorUp className="w-3.5 h-3.5 text-blue-300 flex-shrink-0" />}
          {(isHost || isCohost) && (
            <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-xs ml-1 hidden sm:flex items-center gap-1">
              <Shield className="w-3 h-3" />
              {isHost ? 'Host' : 'Co-host'}
            </span>
          )}
        </div>
      </div>

      {handRaised && (
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-amber-400 text-slate-900 p-1.5 rounded-lg z-[2] animate-bounce" title="Hand raised" data-testid="tile-hand">
          <Hand className="w-4 h-4" />
        </div>
      )}

      {isCameraOff && !isScreen && (
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-slate-900/70 backdrop-blur p-1.5 rounded-lg z-[2]">
          <VideoOff className="w-4 h-4 text-red-400" />
        </div>
      )}

      {onTogglePin && (
        <button
          onClick={onTogglePin}
          data-testid="pin-button"
          aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
          className={`absolute top-2 sm:top-3 ${isCameraOff && !isScreen ? 'right-12 sm:right-14' : 'right-2 sm:right-3'} z-[3] p-1.5 rounded-lg bg-slate-900/70 backdrop-blur text-white hover:bg-slate-700 transition-opacity ${
            pinned ? 'opacity-100' : 'opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
