import { useState } from 'react';
import { Meeting } from '@/types';
import { useMediaStream } from '@/hooks/useMediaStream';
import { useWebRTC } from '@/hooks/useWebRTC';
import { VideoTile } from './VideoTile';
import { MeetingControls } from './MeetingControls';
import { ParticipantsPanel } from './ParticipantsPanel';
import { ChatPanel } from './ChatPanel';
import { Shield, MonitorUp, WifiOff } from 'lucide-react';

interface MeetingRoomProps {
  meeting: Meeting;
  media: ReturnType<typeof useMediaStream>;
  participantId: number;
  clientId: string;
  displayName: string;
  isHost: boolean;
  onLeave: () => void;
  onEndMeeting?: () => Promise<void>;
}

export function MeetingRoom({ meeting, media, participantId, clientId, displayName, isHost, onLeave, onEndMeeting }: MeetingRoomProps) {
  const [activePanel, setActivePanel] = useState<'participants' | 'chat' | null>(null);
  // Local screen share stream (what we are sharing)
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);

  const {
    remoteParticipants,
    remoteStreams,
    screenShareState,   // non-null when a remote peer is sharing their screen
    isConnected,
    sendMessage,
    startScreenShare,
    stopScreenShare,
    endMeetingForAll,
  } = useWebRTC({
    meetingId: meeting.meeting_id,
    clientId,
    participantId,
    displayName,
    isHost,
    localStream: media.stream,
    isAudioEnabled: media.isAudioEnabled,
    isVideoEnabled: media.isVideoEnabled,
    onMeetingEnded: onLeave,
    onEndMeeting,
  });

  const togglePanel = (panel: 'participants' | 'chat') => {
    setActivePanel(current => current === panel ? null : panel);
  };

  const handleToggleMic = () => {
    media.toggleAudio();
    sendMessage({
      type: 'participant_updated',
      participant: { id: participantId, is_muted: media.isAudioEnabled },
    });
  };

  const handleToggleCam = () => {
    media.toggleVideo();
    sendMessage({
      type: 'participant_updated',
      participant: { id: participantId, camera_enabled: !media.isVideoEnabled },
    });
  };

  const handleToggleScreenShare = async () => {
    if (localScreenStream) {
      // Stop sharing
      await stopScreenShare(localScreenStream);
      media.stopScreenShare();
      setLocalScreenStream(null);
    } else {
      // Start sharing — get screen stream from WebRTC hook (which does replaceTrack on all peers)
      const stream = await startScreenShare();
      if (stream) {
        setLocalScreenStream(stream);
        media.startScreenShare(); // just updates local UI state flag
        // When the OS stop-share button is clicked, stream's track fires 'ended'
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          stopScreenShare();
          media.stopScreenShare();
          setLocalScreenStream(null);
        });
      }
    }
  };

  const handleLeave = () => {
    sendMessage({ type: 'participant_left', participant_id: participantId });
    onLeave();
  };

  const handleEndForAll = () => {
    endMeetingForAll();
    // onLeave will be called via onMeetingEnded callback
  };

  // Determine what the main area should show
  const isSharingLocally = !!localScreenStream;
  const remoteIsSharing = !!screenShareState;
  const showScreenShareView = isSharingLocally || remoteIsSharing;

  const totalParticipants = 1 + remoteParticipants.length;
  const gridCols = totalParticipants === 1 ? 'grid-cols-1' :
                   totalParticipants === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                   totalParticipants <= 4 ? 'grid-cols-2' :
                   totalParticipants <= 6 ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-3 lg:grid-cols-4';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col overflow-hidden text-slate-200 font-sans">
      
      {/* Top Bar */}
      <header className="h-12 flex items-center justify-between px-4 z-20 absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-900/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-full backdrop-blur">
            <Shield className="w-4 h-4 text-green-400" />
            <span className="font-semibold text-sm">{meeting.title}</span>
          </div>
          <span className="px-2 py-1 bg-slate-800/80 rounded text-xs text-slate-400 font-mono backdrop-blur">
            {meeting.meeting_id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}
          </span>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          {!isConnected && (
            <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium border border-red-500/30 flex items-center gap-1 backdrop-blur">
              <WifiOff className="w-3 h-3" /> Reconnecting...
            </span>
          )}
          {isSharingLocally && (
            <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium border border-green-500/30 animate-pulse backdrop-blur">
              You are sharing screen
            </span>
          )}
          {remoteIsSharing && (
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-medium border border-blue-500/30 backdrop-blur">
              {screenShareState!.name} is sharing
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 relative transition-all duration-300 ${activePanel ? 'mr-0 sm:mr-80' : ''}`}>
        <div className="absolute inset-0 pb-20 pt-12 px-4 flex items-center justify-center overflow-y-auto">

          {/* ── Normal grid view (no screen share) ── */}
          {!showScreenShareView && (
            <div className={`w-full max-w-7xl grid gap-4 p-4 ${gridCols}`}>
              <div className="w-full aspect-video max-h-[80vh] min-h-[200px]">
                <VideoTile
                  stream={media.stream}
                  name={displayName}
                  isMuted={!media.isAudioEnabled}
                  isCameraOff={!media.isVideoEnabled}
                  isHost={isHost}
                  isLocal={true}
                  isActiveSpeaker={media.isAudioEnabled}
                />
              </div>
              {remoteParticipants.map(p => (
                <div key={p.client_id} className="w-full aspect-video max-h-[80vh] min-h-[200px]">
                  <VideoTile
                    stream={remoteStreams.get(p.client_id) ?? null}
                    name={p.display_name}
                    isMuted={p.is_muted}
                    isCameraOff={!p.camera_enabled}
                    isHost={p.is_host}
                    isLocal={false}
                    isActiveSpeaker={!p.is_muted}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Local screen share view ── */}
          {isSharingLocally && (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-4">
              {/* Screen preview */}
              <div className="w-full max-w-5xl rounded-2xl overflow-hidden border border-slate-700 shadow-2xl flex-1 max-h-[65vh]">
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={el => { if (el) el.srcObject = localScreenStream; }}
                  className="w-full h-full object-contain bg-slate-900"
                />
              </div>
              <div className="flex items-center gap-3">
                <MonitorUp className="w-5 h-5 text-green-400" />
                <span className="text-slate-300 text-sm font-medium">You are sharing your screen</span>
                <button
                  onClick={handleToggleScreenShare}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-white transition-colors border border-slate-600"
                >
                  Stop Sharing
                </button>
              </div>
              {/* Small self-cam pip */}
              <div className="absolute bottom-24 right-8 w-52 shadow-2xl rounded-xl overflow-hidden z-20 border border-slate-700">
                <VideoTile
                  stream={media.stream}
                  name={displayName}
                  isMuted={!media.isAudioEnabled}
                  isCameraOff={!media.isVideoEnabled}
                  isHost={isHost}
                  isLocal={true}
                />
              </div>
            </div>
          )}

          {/* ── Remote screen share view ── */}
          {remoteIsSharing && !isSharingLocally && (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-4">
              {/* Full-size remote screen */}
              <div className="w-full max-w-5xl rounded-2xl overflow-hidden border border-slate-700 shadow-2xl flex-1 max-h-[65vh]">
                <video
                  autoPlay
                  playsInline
                  ref={el => { if (el) el.srcObject = screenShareState!.stream; }}
                  className="w-full h-full object-contain bg-slate-900"
                />
              </div>
              <p className="text-sm text-slate-400">
                <span className="text-white font-medium">{screenShareState!.name}</span> is sharing their screen
              </p>
              {/* Strip of participant tiles */}
              <div className="flex gap-3 overflow-x-auto pb-1 w-full justify-center">
                <div className="w-40 aspect-video flex-shrink-0 rounded-xl overflow-hidden">
                  <VideoTile stream={media.stream} name={displayName} isMuted={!media.isAudioEnabled} isCameraOff={!media.isVideoEnabled} isHost={isHost} isLocal={true} />
                </div>
                {remoteParticipants.filter(p => !p.is_screen_sharing).map(p => (
                  <div key={p.client_id} className="w-40 aspect-video flex-shrink-0 rounded-xl overflow-hidden">
                    <VideoTile stream={remoteStreams.get(p.client_id) ?? null} name={p.display_name} isMuted={p.is_muted} isCameraOff={!p.camera_enabled} isHost={p.is_host} isLocal={false} />
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Side Panels */}
      {activePanel === 'participants' && (
        <ParticipantsPanel meetingId={meeting.meeting_id} isHost={isHost} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'chat' && (
        <ChatPanel onClose={() => setActivePanel(null)} localName={displayName} />
      )}

      {/* Bottom Controls */}
      <MeetingControls 
        isMicOn={media.isAudioEnabled}
        isCamOn={media.isVideoEnabled}
        isScreenSharing={isSharingLocally}
        isHost={isHost}
        toggleMic={handleToggleMic}
        toggleCam={handleToggleCam}
        toggleScreenShare={handleToggleScreenShare}
        activePanel={activePanel}
        togglePanel={togglePanel}
        onLeave={handleLeave}
        onEndForAll={handleEndForAll}
      />
    </div>
  );
}
