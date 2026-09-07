import { useState, useEffect } from 'react';
import { Meeting } from '@/types';
import { VideoTile } from './VideoTile';
import { Mic, MicOff, Video, VideoOff, ArrowLeft } from 'lucide-react';
import { useMediaStream } from '@/hooks/useMediaStream';

interface PreJoinScreenProps {
  meeting: Meeting;
  media: ReturnType<typeof useMediaStream>;
  onJoin: (displayName: string) => void;
  onCancel: () => void;
  joining: boolean;
}

import { useUser } from '@clerk/nextjs';

export function PreJoinScreen({ meeting, media, onJoin, onCancel, joining }: PreJoinScreenProps) {
  const { user } = useUser();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (user && !displayName) {
      setDisplayName(user.fullName || 'User');
    }
  }, [user, displayName]);

  useEffect(() => {
    media.initializeMedia();
    // Intentionally omitting cleanup here, so the stream survives transitioning into the meeting
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="p-6">
        <div className="max-w-6xl mx-auto flex items-center gap-2 text-blue-600 font-bold text-2xl tracking-tight">
          <Video className="w-8 h-8" />
          <span>Confera</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-5xl grid lg:grid-cols-3 gap-8 items-center">
          
          <div className="lg:col-span-2 space-y-6">
            <h1 className="text-3xl font-semibold text-slate-900">{meeting.title}</h1>
            
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video shadow-xl border border-slate-200">
              {media.error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                  <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-4">
                    {displayName.substring(0, 2).toUpperCase() || 'U'}
                  </div>
                  <p>{media.error}</p>
                </div>
              ) : (
                <VideoTile 
                  stream={media.stream}
                  name={displayName}
                  isMuted={!media.isAudioEnabled}
                  isCameraOff={!media.isVideoEnabled}
                  isLocal={true}
                />
              )}
              
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/80 backdrop-blur p-2 rounded-2xl z-10">
                <button 
                  onClick={media.toggleAudio}
                  disabled={!media.hasMicPermission}
                  className={`p-4 rounded-xl flex items-center justify-center transition-colors ${
                    media.isAudioEnabled ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                  } disabled:opacity-50`}
                >
                  {media.isAudioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button 
                  onClick={media.toggleVideo}
                  disabled={!media.hasCameraPermission}
                  className={`p-4 rounded-xl flex items-center justify-center transition-colors ${
                    media.isVideoEnabled ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                  } disabled:opacity-50`}
                >
                  {media.isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 h-full flex flex-col justify-center">
            <h2 className="text-2xl font-semibold text-slate-800 mb-2">Ready to join?</h2>
            <div className="text-slate-500 mb-8 space-y-1">
              <p>Meeting ID: <span className="font-mono text-slate-700">{meeting.meeting_id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</span></p>
              <p>Host: <span className="text-slate-700 font-medium">{meeting.host_name}</span></p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Display Name</label>
                <input 
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg transition-all"
                  placeholder="Enter your name"
                />
              </div>

              <button 
                onClick={() => onJoin(displayName || 'User')}
                disabled={joining || !displayName.trim()}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {joining ? 'Joining...' : 'Join Meeting'}
              </button>

              <button 
                onClick={onCancel}
                className="w-full py-4 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
