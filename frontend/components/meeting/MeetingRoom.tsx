import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Meeting } from '@/types';
import { MediaController } from '@/hooks/useMediaStream';
import { useWebRTC, EndReason, ChatEvent } from '@/hooks/useWebRTC';
import { useCaptions, captionsSupported } from '@/hooks/useCaptions';
import { uploadMeetingFile } from '@/lib/api';
import { buildMeetingLink, copyToClipboard, formatMeetingId } from '@/lib/links';
import { VideoTile } from './VideoTile';
import { MeetingControls, ViewMode } from './MeetingControls';
import { ParticipantsPanel } from './ParticipantsPanel';
import { ChatPanel, ChatEntry } from './ChatPanel';
import { DeviceSettings } from './DeviceSettings';
import { ReactionLayer, CaptionsOverlay, FloatingReaction, CaptionLine } from './Overlays';
import { Shield, MonitorUp, WifiOff, Link2, Check, Lock, Loader2, DoorOpen } from 'lucide-react';

interface MeetingRoomProps {
  meeting: Meeting;
  media: MediaController;
  participantId: number;
  clientId: string;
  displayName: string;
  /** Signed join credential from the REST join call */
  ticket: string;
  /** The meeting's real host (decided by the server): may end the meeting for everyone. */
  isHost: boolean;
  /** User chose to leave (or finished ending the meeting). */
  onLeave: () => void;
  /** Meeting was closed from outside: ended by host, removed, denied, or no longer exists. */
  onClosed: (reason: EndReason) => void;
  onEndMeeting?: () => Promise<void>;
}

const MAX_FILE_MB = 10;

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/** A tile that reports "this person is speaking" upward (for speaker view). */
function ParticipantTile({
  id, onSpeaking, onPin, pinnedId, ...rest
}: { id: string; onSpeaking: (id: string) => void; onPin: (id: string) => void; pinnedId: string | null } & React.ComponentProps<typeof VideoTile>) {
  const handleSpeaking = useCallback((speaking: boolean) => { if (speaking) onSpeaking(id); }, [id, onSpeaking]);
  const handlePin = useCallback(() => onPin(id), [id, onPin]);
  return <VideoTile {...rest} pinned={pinnedId === id} onTogglePin={handlePin} onSpeakingChange={handleSpeaking} />;
}

export function MeetingRoom({ meeting, media, participantId, clientId, displayName, ticket, isHost, onLeave, onClosed, onEndMeeting }: MeetingRoomProps) {
  const [activePanel, setActivePanel] = useState<'participants' | 'chat' | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [chatRecipient, setChatRecipient] = useState<string | null>(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captionMap, setCaptionMap] = useState<Record<string, CaptionLine & { at: number }>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activePanelRef = useRef(activePanel);
  useEffect(() => { activePanelRef.current = activePanel; }, [activePanel]);
  const namesRef = useRef<Record<string, string>>({});
  const moderatorRef = useRef(false);

  // Local recording (screen capture saved as a .webm download)
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const toEntry = useCallback((m: ChatEvent): ChatEntry => ({
    id: m.id,
    from: m.from,
    sender: m.sender,
    text: m.text,
    timestamp: formatTime(m.timestamp),
    isLocal: m.from === clientId,
    private: m.private,
    attachment: m.attachment,
  }), [clientId]);

  const rtc = useWebRTC({
    meetingId: meeting.meeting_id,
    clientId,
    ticket,
    localStream: media.stream,
    isAudioEnabled: media.isAudioEnabled,
    isVideoEnabled: media.isVideoEnabled,
    onMeetingEnded: onClosed,
    onForceMute: () => {
      media.setAudioEnabled(false);
      toast('A host muted you', { icon: '🔇' });
    },
    onChatMessage: (msg) => {
      setChatMessages(prev => [...prev, toEntry(msg)]);
      if (activePanelRef.current !== 'chat') setUnreadChat(n => n + 1);
      if (msg.private) toast(`Private message from ${msg.sender}`, { icon: '🔒' });
    },
    onChatHistory: (history) => {
      // Server history is authoritative for public messages; keep our private ones.
      setChatMessages(prev => {
        const serverIds = new Set(history.map(h => h.id));
        const keptPrivate = prev.filter(m => m.private && !serverIds.has(m.id));
        return [...history.map(toEntry), ...keptPrivate];
      });
    },
    onReaction: (id, emoji) => {
      const reaction: FloatingReaction = {
        id: `${id}-${Date.now()}-${Math.random()}`,
        name: id === clientId ? 'You' : namesRef.current[id] ?? 'Someone',
        emoji,
        offset: Math.random(),
      };
      setReactions(prev => [...prev.slice(-12), reaction]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== reaction.id)), 3300);
    },
    onCaption: (id, sender, text) => {
      setCaptionMap(prev => ({ ...prev, [id]: { clientId: id, name: sender, text, at: Date.now() } }));
    },
    onWaitingGuest: (guest) => {
      if (moderatorRef.current) {
        toast(`${guest.display_name} is waiting to join`, { icon: '🚪', id: `wait-${guest.client_id}` });
        setActivePanel(cur => cur ?? 'participants');
      }
    },
  });

  const {
    remoteParticipants, remoteStreams, screenSharer, localScreenStream, status, startScreenShare, stopScreenShare,
    sendChat, leave, roomState, waitingList, self, handRaised, setHandRaised, sendReaction, sendCaption, moderation,
  } = rtc;
  const isModerator = self.is_host || self.is_cohost;
  useEffect(() => { moderatorRef.current = isModerator; }, [isModerator]);
  useEffect(() => {
    const names: Record<string, string> = {};
    remoteParticipants.forEach(p => { names[p.client_id] = p.display_name; });
    namesRef.current = names;
  }, [remoteParticipants]);

  // Captions: transcribe our own mic while unmuted, share the text with everyone.
  const handleOwnCaption = useCallback((text: string, final: boolean) => {
    sendCaption(text, final);
    setCaptionMap(prev => ({ ...prev, [clientId]: { clientId, name: 'You', text, at: Date.now() } }));
  }, [sendCaption, clientId]);
  useCaptions(captionsOn && media.isAudioEnabled && status === 'connected', handleOwnCaption, () => {
    setCaptionsOn(false);
    toast.error('Captions need microphone/speech permission in this browser');
  });
  useEffect(() => {
    if (Object.keys(captionMap).length === 0) return;
    const timer = setInterval(() => {
      setCaptionMap(prev => {
        const fresh = Object.fromEntries(Object.entries(prev).filter(([, c]) => Date.now() - c.at < 5000));
        return Object.keys(fresh).length === Object.keys(prev).length ? prev : fresh;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [captionMap]);
  const captionLines = useMemo(() => (captionsOn ? Object.values(captionMap).slice(-2) : []), [captionsOn, captionMap]);

  useEffect(() => () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  }, []);

  // ── chat ────────────────────────────────────────────────────────────────
  const recipientName = chatRecipient ? namesRef.current[chatRecipient] : undefined;

  const handleSendMessage = (text: string) => {
    if (!sendChat(text, chatRecipient ? { to: chatRecipient } : undefined)) {
      toast.error('Not connected. Your message was not sent.');
      return;
    }
    setChatMessages(prev => [...prev, {
      id: `local-${Date.now()}-${Math.random()}`, from: clientId, sender: displayName, text,
      timestamp: formatTime(new Date().toISOString()), isLocal: true, private: !!chatRecipient, toName: recipientName,
    }]);
  };

  const handleAttach = async (file: File) => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) { toast.error(`Files can be at most ${MAX_FILE_MB} MB`); return; }
    try {
      const uploaded = await uploadMeetingFile(meeting.meeting_id, ticket, file);
      const attachment = { name: uploaded.name, size: uploaded.size, url: uploaded.url };
      if (!sendChat('', { attachment, ...(chatRecipient ? { to: chatRecipient } : {}) })) {
        toast.error('Not connected. The file was uploaded but not shared.');
        return;
      }
      setChatMessages(prev => [...prev, {
        id: `local-${Date.now()}-${Math.random()}`, from: clientId, sender: displayName, text: '', attachment,
        timestamp: formatTime(new Date().toISOString()), isLocal: true, private: !!chatRecipient, toName: recipientName,
      }]);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Could not upload the file');
    }
  };

  const togglePanel = (panel: 'participants' | 'chat') => {
    setActivePanel(current => (current === panel ? null : panel));
    if (panel === 'chat') setUnreadChat(0);
  };

  const messagePrivately = (id: string) => {
    setChatRecipient(id);
    setActivePanel('chat');
    setUnreadChat(0);
  };

  // ── media controls ──────────────────────────────────────────────────────
  const handleToggleMic = () => {
    if (!media.hasMic) { toast.error('No microphone available'); return; }
    media.toggleAudio();
  };
  const handleToggleCam = () => {
    if (!media.hasCamera) { toast.error('No camera available'); return; }
    media.toggleVideo();
  };
  const handleToggleScreenShare = async () => {
    if (localScreenStream) { await stopScreenShare(); return; }
    const result = await startScreenShare();
    if (!result.ok && result.error) toast.error(result.error);
  };

  const handleToggleRecording = async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `Meeting_Recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        recordedChunksRef.current = [];
        setIsRecording(false);
        stream.getTracks().forEach(t => t.stop());
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (recorder.state === 'recording') recorder.stop(); });
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      if ((err as { name?: string })?.name !== 'NotAllowedError') toast.error('Recording is not supported on this browser');
    }
  };

  const handleLeave = () => { leave(); onLeave(); };

  const handleEndForAll = async () => {
    try {
      await onEndMeeting?.();
      onLeave();
    } catch {
      toast.error('Could not end the meeting. Please try again.');
    }
  };

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(buildMeetingLink(meeting.meeting_id));
    if (ok) {
      setLinkCopied(true);
      toast.success('Meeting link copied');
      setTimeout(() => setLinkCopied(false), 2000);
    } else {
      toast.error('Could not copy the link');
    }
  };

  // ── layout ──────────────────────────────────────────────────────────────
  const isSharingLocally = !!localScreenStream;
  const showScreenShareView = isSharingLocally || !!screenSharer;
  const sharerStream = screenSharer ? remoteStreams.get(screenSharer.client_id) ?? null : null;
  const total = 1 + remoteParticipants.length;

  const handlePin = useCallback((id: string) => setPinnedId(cur => (cur === id ? null : id)), []);
  const handleSpeaking = useCallback((id: string) => setActiveSpeakerId(id), []);

  // Drop a pin when that person leaves
  const effectivePinned = pinnedId && (pinnedId === clientId || remoteParticipants.some(p => p.client_id === pinnedId)) ? pinnedId : null;
  const speakerFocus = viewMode === 'speaker'
    ? (activeSpeakerId && (activeSpeakerId === clientId || remoteParticipants.some(p => p.client_id === activeSpeakerId))
        ? activeSpeakerId
        : remoteParticipants[0]?.client_id ?? clientId)
    : null;
  const focusId = effectivePinned ?? speakerFocus;
  const spotlight = !showScreenShareView && total > 1 && focusId !== null;

  const gridCols =
    total === 1 ? 'grid-cols-1 max-w-3xl' :
    total === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-6xl' :
    total <= 4 ? 'grid-cols-2 max-w-6xl' :
    total <= 6 ? 'grid-cols-2 lg:grid-cols-3 max-w-7xl' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-w-7xl';

  const tileProps = (id: string) => {
    if (id === clientId) {
      return {
        id, stream: media.stream, name: displayName, isMuted: !media.isAudioEnabled, isCameraOff: !media.isVideoEnabled,
        isHost: self.is_host, isCohost: self.is_cohost, isLocal: true, handRaised,
      };
    }
    const p = remoteParticipants.find(r => r.client_id === id)!;
    return {
      id, stream: remoteStreams.get(id) ?? null, name: p.display_name, isMuted: p.is_muted, isCameraOff: !p.camera_enabled,
      isHost: p.is_host, isCohost: p.is_cohost, handRaised: p.hand_raised, sinkId: media.speakerId,
    };
  };
  const renderTile = (id: string, compact = false) => (
    <ParticipantTile key={id} {...tileProps(id)} compact={compact} onSpeaking={handleSpeaking} onPin={handlePin} pinnedId={effectivePinned} />
  );
  const allIds = [clientId, ...remoteParticipants.map(p => p.client_id)];

  const people = remoteParticipants.map(p => ({ client_id: p.client_id, display_name: p.display_name }));

  // ── waiting room ────────────────────────────────────────────────────────
  if (status === 'waiting') {
    return (
      <div className="min-h-dvh bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-6 text-center gap-6" data-testid="waiting-screen" data-status="waiting">
        <div className="w-16 h-16 rounded-full bg-amber-400/15 text-amber-300 flex items-center justify-center">
          <DoorOpen className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">Please wait, the host will let you in soon</h1>
          <p className="text-slate-400 mt-2">{meeting.title}</p>
        </div>
        <div className="w-56 aspect-video">
          <VideoTile stream={media.stream} name={displayName} isMuted={!media.isAudioEnabled} isCameraOff={!media.isVideoEnabled} isLocal />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Waiting for admission…</div>
        <button onClick={handleLeave} data-testid="leave" className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl font-medium">
          Leave
        </button>
      </div>
    );
  }

  return (
    <div className="h-dvh bg-slate-950 flex flex-col overflow-hidden text-slate-200 font-sans" data-testid="meeting-room" data-status={status} data-participant={participantId}>
      <header className="h-12 flex items-center justify-between px-3 sm:px-4 z-20 absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-900/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto min-w-0">
          <div className="flex items-center gap-2 bg-slate-900/60 px-3 py-1 rounded-full backdrop-blur min-w-0">
            <Shield className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="font-semibold text-sm truncate max-w-[34vw] sm:max-w-xs">{meeting.title}</span>
          </div>
          <button
            onClick={handleCopyLink}
            title="Copy meeting link"
            data-testid="copy-link"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 rounded-full text-xs text-slate-300 font-mono backdrop-blur transition-colors"
          >
            {linkCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>{formatMeetingId(meeting.meeting_id)}</span>
          </button>
          {roomState.locked && (
            <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/15 text-amber-300 rounded-full text-xs border border-amber-500/30" data-testid="locked-chip">
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          {status !== 'connected' && (
            <span className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-xs font-medium border border-amber-500/30 flex items-center gap-1 backdrop-blur" role="status">
              <WifiOff className="w-3 h-3" /> {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </span>
          )}
          {isSharingLocally && (
            <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium border border-green-500/30 animate-pulse backdrop-blur">You are sharing</span>
          )}
          {isRecording && (
            <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium border border-red-500/30 animate-pulse flex items-center gap-1 backdrop-blur">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Recording
            </span>
          )}
        </div>
      </header>

      <main className={`flex-1 relative transition-all duration-300 ${activePanel ? 'sm:mr-80' : ''}`}>
        <div className="absolute inset-0 pb-20 pt-12 px-2 sm:px-4 flex items-center justify-center overflow-y-auto">
          {/* Gallery */}
          {!showScreenShareView && !spotlight && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4" data-testid="gallery">
              {total === 1 && status === 'connected' && (
                <p className="text-sm text-slate-400 text-center px-4" data-testid="empty-room">
                  You&apos;re the only one here. Share the link to invite people.
                </p>
              )}
              <div className={`w-full grid gap-2 sm:gap-4 p-1 sm:p-4 ${gridCols}`}>
                {allIds.map(id => <div key={id} className="w-full aspect-video max-h-[70vh]">{renderTile(id)}</div>)}
              </div>
            </div>
          )}

          {/* Spotlight: pinned person or active speaker, everyone else in a strip */}
          {spotlight && (
            <div className="w-full h-full flex flex-col items-center gap-3 p-1 sm:p-4" data-testid="spotlight" data-focus={focusId}>
              <div className="w-full max-w-6xl flex-1 min-h-0">{renderTile(focusId!)}</div>
              <div className="flex gap-2 sm:gap-3 overflow-x-auto w-full justify-start sm:justify-center pb-1 flex-shrink-0">
                {allIds.filter(id => id !== focusId).map(id => <div key={id} className="w-32 sm:w-40 aspect-video flex-shrink-0">{renderTile(id, true)}</div>)}
              </div>
            </div>
          )}

          {/* Screen share stage */}
          {showScreenShareView && (
            <div className="w-full h-full flex flex-col items-center gap-3 p-1 sm:p-4">
              <div className="w-full max-w-6xl flex-1 min-h-0 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl bg-black" data-testid="screen-stage">
                {isSharingLocally ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <video
                      autoPlay playsInline muted
                      ref={el => { if (el && el.srcObject !== localScreenStream) el.srcObject = localScreenStream; }}
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/80 backdrop-blur px-4 py-2 rounded-xl">
                      <MonitorUp className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-slate-200">You are sharing your screen</span>
                      <button onClick={handleToggleScreenShare} className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-sm text-white transition-colors">Stop</button>
                    </div>
                  </div>
                ) : (
                  <VideoTile stream={sharerStream} name={`${screenSharer!.display_name}'s screen`} isMuted={screenSharer!.is_muted} isCameraOff={false} isScreen sinkId={media.speakerId} />
                )}
              </div>
              <div className="flex gap-2 sm:gap-3 overflow-x-auto w-full justify-start sm:justify-center pb-1 flex-shrink-0">
                {allIds.map(id => (
                  <div key={id} className="w-32 sm:w-40 aspect-video flex-shrink-0">
                    {id !== clientId && remoteParticipants.find(p => p.client_id === id)?.is_screen_sharing
                      ? <VideoTile stream={null} name={remoteParticipants.find(p => p.client_id === id)!.display_name} isMuted={remoteParticipants.find(p => p.client_id === id)!.is_muted} isCameraOff compact />
                      : renderTile(id, true)}
                  </div>
                ))}
              </div>
              {/* The sharer's strip tile has no stream, so play their microphone audio separately */}
              {remoteParticipants.filter(p => p.is_screen_sharing).map(p => (
                <audio key={p.client_id} autoPlay ref={el => { const s = remoteStreams.get(p.client_id) ?? null; if (el && el.srcObject !== s) el.srcObject = s; }} />
              ))}
            </div>
          )}
        </div>
      </main>

      <ReactionLayer reactions={reactions} />
      <CaptionsOverlay lines={captionLines} />

      {activePanel === 'participants' && (
        <ParticipantsPanel
          localParticipant={{
            id: participantId, client_id: clientId, display_name: `${displayName} (You)`, is_host: self.is_host,
            is_cohost: self.is_cohost, is_muted: !media.isAudioEnabled, camera_enabled: media.isVideoEnabled, hand_raised: handRaised,
          }}
          remoteParticipants={remoteParticipants}
          isModerator={isModerator}
          isHost={self.is_host}
          waitingList={waitingList}
          roomState={roomState}
          pinnedId={effectivePinned}
          onClose={() => setActivePanel(null)}
          onPin={handlePin}
          onMessage={messagePrivately}
          onCopyLink={handleCopyLink}
          moderation={moderation}
        />
      )}
      {activePanel === 'chat' && (
        <ChatPanel
          onClose={() => setActivePanel(null)}
          messages={chatMessages}
          people={people}
          recipient={chatRecipient}
          onRecipientChange={setChatRecipient}
          onSendMessage={handleSendMessage}
          onAttach={handleAttach}
          maxFileMb={MAX_FILE_MB}
        />
      )}

      {settingsOpen && <DeviceSettings media={media} onClose={() => setSettingsOpen(false)} dark />}

      <MeetingControls
        isMicOn={media.isAudioEnabled}
        isCamOn={media.isVideoEnabled}
        micAvailable={media.hasMic}
        camAvailable={media.hasCamera}
        isScreenSharing={isSharingLocally}
        screenShareSupported={typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia}
        isRecording={isRecording}
        isHost={isHost}
        participantCount={total}
        waitingCount={isModerator ? waitingList.length : 0}
        unreadChat={unreadChat}
        handRaised={handRaised}
        captionsOn={captionsOn}
        captionsSupported={captionsSupported()}
        viewMode={viewMode}
        toggleMic={handleToggleMic}
        toggleCam={handleToggleCam}
        toggleScreenShare={handleToggleScreenShare}
        toggleRecording={handleToggleRecording}
        toggleHand={() => setHandRaised(!handRaised)}
        toggleCaptions={() => setCaptionsOn(v => !v)}
        sendReaction={sendReaction}
        openSettings={() => setSettingsOpen(true)}
        setViewMode={(m) => { setViewMode(m); setPinnedId(null); }}
        activePanel={activePanel}
        togglePanel={togglePanel}
        onLeave={handleLeave}
        onEndForAll={handleEndForAll}
      />
    </div>
  );
}
