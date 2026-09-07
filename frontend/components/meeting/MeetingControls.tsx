import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Users, MessageSquare, MonitorUp, PhoneOff, ChevronUp } from 'lucide-react';

interface MeetingControlsProps {
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  isHost: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleScreenShare: () => void;
  activePanel: 'participants' | 'chat' | null;
  togglePanel: (panel: 'participants' | 'chat') => void;
  onLeave: () => void;
  onEndForAll: () => void;
}

export function MeetingControls({ 
  isMicOn, isCamOn, isScreenSharing, isHost,
  toggleMic, toggleCam, toggleScreenShare,
  activePanel, togglePanel, onLeave, onEndForAll,
}: MeetingControlsProps) {
  const [showLeaveMenu, setShowLeaveMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showLeaveMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowLeaveMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLeaveMenu]);

  return (
    <div className="h-20 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-4 sm:px-6 fixed bottom-0 left-0 right-0 z-40">
      {/* Left: Mic + Cam */}
      <div className="flex-1 flex items-center gap-2 sm:gap-4 justify-start">
        <div className="flex flex-col items-center">
          <button 
            onClick={toggleMic}
            className={`p-3 rounded-xl transition-colors ${isMicOn ? 'hover:bg-slate-800 text-slate-300' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}`}
          >
            {isMicOn ? <Mic className="w-5 h-5 sm:w-6 sm:h-6" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
          <span className="text-[10px] sm:text-xs text-slate-400 mt-1">{isMicOn ? 'Mute' : 'Unmute'}</span>
        </div>

        <div className="flex flex-col items-center">
          <button 
            onClick={toggleCam}
            className={`p-3 rounded-xl transition-colors ${isCamOn ? 'hover:bg-slate-800 text-slate-300' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}`}
          >
            {isCamOn ? <Video className="w-5 h-5 sm:w-6 sm:h-6" /> : <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
          <span className="text-[10px] sm:text-xs text-slate-400 mt-1">{isCamOn ? 'Stop Video' : 'Start Video'}</span>
        </div>
      </div>

      {/* Center: Panels + Screen Share */}
      <div className="flex items-center gap-2 sm:gap-4 justify-center">
        <div className="flex flex-col items-center">
          <button 
            onClick={() => togglePanel('participants')}
            className={`p-3 rounded-xl transition-colors ${activePanel === 'participants' ? 'bg-slate-800 text-blue-400' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <span className="text-[10px] sm:text-xs text-slate-400 mt-1 hidden sm:block">Participants</span>
        </div>

        <div className="flex flex-col items-center">
          <button 
            onClick={() => togglePanel('chat')}
            className={`p-3 rounded-xl transition-colors ${activePanel === 'chat' ? 'bg-slate-800 text-blue-400' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <span className="text-[10px] sm:text-xs text-slate-400 mt-1 hidden sm:block">Chat</span>
        </div>

        <div className="flex flex-col items-center">
          <button 
            onClick={toggleScreenShare}
            className={`p-3 rounded-xl transition-colors ${isScreenSharing ? 'bg-green-500/20 text-green-400' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <MonitorUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <span className="text-[10px] sm:text-xs text-slate-400 mt-1 hidden sm:block">
            {isScreenSharing ? 'Stop Share' : 'Share Screen'}
          </span>
        </div>
      </div>

      {/* Right: Leave / End for All */}
      <div className="flex-1 flex items-center justify-end">
        {isHost ? (
          <div ref={menuRef} className="relative">
            {/* Popover menu */}
            {showLeaveMenu && (
              <div className="absolute bottom-14 right-0 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[200px] animate-in fade-in slide-in-from-bottom-2">
                <button
                  onClick={() => { setShowLeaveMenu(false); onLeave(); }}
                  className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-3"
                >
                  <PhoneOff className="w-4 h-4 text-slate-400" />
                  Leave meeting
                </button>
                <div className="border-t border-slate-700" />
                <button
                  onClick={() => { setShowLeaveMenu(false); onEndForAll(); }}
                  className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3 font-medium"
                >
                  <PhoneOff className="w-4 h-4" />
                  End meeting for all
                </button>
              </div>
            )}

            <button
              onClick={() => setShowLeaveMenu(v => !v)}
              className="px-4 py-2 sm:px-5 sm:py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors flex items-center gap-2"
            >
              <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Leave</span>
              <ChevronUp className={`w-4 h-4 transition-transform ${showLeaveMenu ? 'rotate-180' : ''}`} />
            </button>
          </div>
        ) : (
          <button 
            onClick={onLeave}
            className="px-4 py-2 sm:px-6 sm:py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors flex items-center gap-2"
          >
            <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        )}
      </div>
    </div>
  );
}
