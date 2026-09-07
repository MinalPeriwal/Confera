import { useEffect, useRef } from 'react';
import { Mic, MicOff, VideoOff, Shield } from 'lucide-react';

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isHost?: boolean;
  isLocal?: boolean;
  isActiveSpeaker?: boolean;
}

export function VideoTile({ stream, name, isMuted, isCameraOff, isHost, isLocal, isActiveSpeaker }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.srcObject = stream || null;
    }
    return () => {
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [stream]);

  const initials = name.substring(0, 2).toUpperCase() || 'U';

  return (
    <div className={`relative bg-slate-800 rounded-2xl overflow-hidden shadow-lg w-full h-full flex items-center justify-center min-h-[200px] transition-all duration-300 ${isActiveSpeaker ? 'ring-4 ring-green-500 shadow-green-500/20 z-10' : 'border border-slate-700'}`}>
      {!isCameraOff && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg">
          {initials}
        </div>
      )}

      {/* Overlays */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
        <div className="bg-slate-900/70 backdrop-blur text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm max-w-[80%]">
          {isMuted ? (
            <MicOff className="w-4 h-4 text-red-400 flex-shrink-0" />
          ) : (
            <Mic className="w-4 h-4 text-green-400 flex-shrink-0" />
          )}
          <span className="truncate">{name} {isLocal ? '(You)' : ''}</span>
          {isHost && (
            <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-xs ml-1 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Host
            </span>
          )}
        </div>
      </div>

      {isCameraOff && (
        <div className="absolute top-3 right-3 bg-slate-900/70 backdrop-blur p-1.5 rounded-lg">
          <VideoOff className="w-4 h-4 text-red-400" />
        </div>
      )}
    </div>
  );
}
