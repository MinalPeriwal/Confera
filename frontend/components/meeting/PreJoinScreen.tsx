import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import toast from 'react-hot-toast';
import { Meeting } from '@/types';
import { MediaController } from '@/hooks/useMediaStream';
import { buildMeetingLink, copyToClipboard, formatMeetingId } from '@/lib/links';
import { VideoTile } from './VideoTile';
import { Mic, MicOff, Video, VideoOff, ArrowLeft, Link2, Check, AlertTriangle, RefreshCw, Loader2, Settings, KeyRound, DoorOpen, Lock } from 'lucide-react';
import { DeviceSettings } from './DeviceSettings';
import { useAudioLevel } from '@/hooks/useAudioLevel';

interface PreJoinScreenProps {
  meeting: Meeting;
  media: MediaController;
  onJoin: (displayName: string, passcode?: string) => void;
  onCancel: () => void;
  joining: boolean;
  /** Server rejection to show above the join button (wrong passcode, locked meeting...) */
  joinError?: string | null;
}

const NAME_KEY = 'confera:display-name';

export function PreJoinScreen({ meeting, media, onJoin, onCancel, joining, joinError }: PreJoinScreenProps) {
  const { user, isLoaded } = useUser();
  // Guests get their last used name prefilled; signed-in users always use their account name.
  const [typedName, setTypedName] = useState<string>(() => {
    try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } // storage may be unavailable
  });
  const [copied, setCopied] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const level = useAudioLevel(media.stream, media.isAudioEnabled);
  const isMeetingHost = !!(user && meeting.host_clerk_id && user.id === meeting.host_clerk_id);
  const needsPasscode = meeting.has_passcode && !isMeetingHost;
  const accountName = user
    ? user.fullName || user.username || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'User'
    : null;
  const displayName = accountName ?? typedName;

  useEffect(() => {
    void media.initializeMedia();
    // No cleanup on purpose: the stream must survive the transition into the meeting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = () => {
    const name = displayName.trim();
    if (!name) return;
    if (!user) {
      try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
    }
    onJoin(name, needsPasscode ? passcode.trim() : undefined);
  };

  const handleCopy = async () => {
    if (await copyToClipboard(buildMeetingLink(meeting.meeting_id))) {
      setCopied(true);
      toast.success('Meeting link copied');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy the link');
    }
  };

  const requesting = media.status === 'requesting' || media.status === 'idle';
  const canJoin = !!displayName.trim() && !joining && isLoaded && !requesting && (!needsPasscode || passcode.trim().length > 0);

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      <header className="p-4 sm:p-6">
        <div className="max-w-6xl mx-auto flex items-center gap-2 text-blue-600 font-bold text-2xl tracking-tight">
          <Video className="w-8 h-8" />
          <span>Confera</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-5xl grid lg:grid-cols-3 gap-6 lg:gap-8 items-center">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 break-words">{meeting.title}</h1>

            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video shadow-xl border border-slate-200">
              {requesting ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-3" data-testid="media-requesting">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm">Allow camera and microphone access to continue…</p>
                </div>
              ) : (
                <VideoTile
                  stream={media.stream}
                  name={displayName || 'You'}
                  isMuted={!media.isAudioEnabled}
                  isCameraOff={!media.isVideoEnabled}
                  isLocal
                />
              )}

              <div className="absolute bottom-14 sm:bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/80 backdrop-blur p-2 rounded-2xl z-10">
                <button
                  onClick={media.toggleAudio}
                  disabled={!media.hasMic}
                  aria-label={media.isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  data-testid="prejoin-mic"
                  className={`p-3 rounded-xl flex items-center justify-center transition-colors ${
                    media.isAudioEnabled ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {media.isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button
                  onClick={media.toggleVideo}
                  disabled={!media.hasCamera}
                  aria-label={media.isVideoEnabled ? 'Turn camera off' : 'Turn camera on'}
                  data-testid="prejoin-cam"
                  className={`p-3 rounded-xl flex items-center justify-center transition-colors ${
                    media.isVideoEnabled ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {media.isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden" aria-label="Microphone level">
                <div className="h-full bg-green-500 transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} data-testid="prejoin-level" />
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                data-testid="prejoin-settings"
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                <Settings className="w-4 h-4" /> Audio &amp; video settings
              </button>
            </div>

            {media.error && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm" role="alert" data-testid="media-error">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="flex-1">{media.error}</p>
                <button
                  onClick={() => void media.retry()}
                  className="flex items-center gap-1.5 font-medium text-amber-800 hover:text-amber-950 whitespace-nowrap"
                >
                  <RefreshCw className="w-4 h-4" /> Try again
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sm:p-8 flex flex-col justify-center">
            <h2 className="text-2xl font-semibold text-slate-800 mb-2">Ready to join?</h2>
            <div className="text-slate-500 mb-6 space-y-1 text-sm sm:text-base">
              <p>Meeting ID: <span className="font-mono text-slate-700">{formatMeetingId(meeting.meeting_id)}</span></p>
              <p>Host: <span className="text-slate-700 font-medium">{meeting.host_name}</span></p>
            </div>

            <div className="space-y-4 sm:space-y-5">
              <div>
                <label htmlFor="display-name" className="block text-sm font-medium text-slate-700 mb-2">Your name</label>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  maxLength={60}
                  onChange={(e) => setTypedName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canJoin) handleJoin(); }}
                  disabled={!!user}
                  className={`w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg transition-all ${user ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'}`}
                  placeholder="Enter your name"
                  autoComplete="name"
                />
                {user && <p className="text-xs text-blue-600 mt-2 font-medium">Using your account name</p>}
              </div>

              {needsPasscode && (
                <div>
                  <label htmlFor="meeting-passcode" className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                    <KeyRound className="w-4 h-4" /> Meeting passcode
                  </label>
                  <input
                    id="meeting-passcode"
                    type="password"
                    value={passcode}
                    maxLength={16}
                    onChange={(e) => setPasscode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && canJoin) handleJoin(); }}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                    placeholder="Enter passcode"
                    autoComplete="off"
                  />
                </div>
              )}

              {meeting.waiting_room && !isMeetingHost && (
                <p className="flex items-start gap-2 text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <DoorOpen className="w-4 h-4 mt-0.5 flex-shrink-0" /> The host will need to let you in after you join.
                </p>
              )}
              {meeting.locked && !isMeetingHost && (
                <p className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" /> This meeting is locked. You may not be able to join.
                </p>
              )}
              {joinError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert" data-testid="join-error">{joinError}</p>
              )}

              <button
                onClick={handleJoin}
                disabled={!canJoin}
                data-testid="join-button"
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-lg flex items-center justify-center gap-2"
              >
                {joining && <Loader2 className="w-5 h-5 animate-spin" />}
                {joining ? 'Joining…' : 'Join meeting'}
              </button>

              <button
                onClick={handleCopy}
                className="w-full py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Link2 className="w-4 h-4" />}
                Copy invite link
              </button>

              <button
                onClick={onCancel}
                className="w-full py-3 text-slate-500 hover:text-slate-800 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                {user ? 'Back to dashboard' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      </main>
      {settingsOpen && <DeviceSettings media={media} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
