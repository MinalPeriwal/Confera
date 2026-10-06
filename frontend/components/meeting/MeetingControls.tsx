import { useState, useRef, useEffect, ReactNode } from 'react';
import {
  Mic, MicOff, Video, VideoOff, Users, MessageSquare, MonitorUp, PhoneOff, ChevronUp, Hand, Smile,
  MoreHorizontal, Captions, Circle, LayoutGrid, Presentation, Settings,
} from 'lucide-react';

export type ViewMode = 'gallery' | 'speaker';
export const REACTION_EMOJIS = ['👍', '👏', '❤️', '😂', '😮', '🎉'];

interface MeetingControlsProps {
  isMicOn: boolean;
  isCamOn: boolean;
  micAvailable: boolean;
  camAvailable: boolean;
  isScreenSharing: boolean;
  screenShareSupported: boolean;
  isRecording: boolean;
  /** The real meeting host: may end the meeting for everyone. */
  isHost: boolean;
  participantCount: number;
  waitingCount: number;
  unreadChat: number;
  handRaised: boolean;
  captionsOn: boolean;
  captionsSupported: boolean;
  viewMode: ViewMode;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleScreenShare: () => void;
  toggleRecording: () => void;
  toggleHand: () => void;
  toggleCaptions: () => void;
  sendReaction: (emoji: string) => void;
  openSettings: () => void;
  setViewMode: (mode: ViewMode) => void;
  activePanel: 'participants' | 'chat' | null;
  togglePanel: (panel: 'participants' | 'chat') => void;
  onLeave: () => void;
  onEndForAll: () => void;
}

/** Small popover that closes on outside click / Escape. Opens upwards (the bar sits at the bottom). */
function Popover({ open, onClose, children, align = 'center' }: { open: boolean; onClose: () => void; children: ReactNode; align?: 'center' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`absolute bottom-16 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden ${align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
      {children}
    </div>
  );
}

function ControlButton({
  label, onClick, active, danger, testId, children, badge, hideOnMobile, disabled,
}: {
  label: string; onClick: () => void; active?: boolean; danger?: boolean; testId?: string; children: ReactNode;
  badge?: ReactNode; hideOnMobile?: boolean; disabled?: boolean;
}) {
  return (
    <div className={`${hideOnMobile ? 'hidden sm:flex' : 'flex'} flex-col items-center`}>
      <button
        onClick={onClick}
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        className={`relative p-2.5 sm:p-3 rounded-xl transition-colors disabled:opacity-40 ${
          danger ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
          : active ? 'bg-slate-800 text-blue-400' : 'hover:bg-slate-800 text-slate-300'
        }`}
      >
        {children}
        {badge}
      </button>
      <span className="text-[10px] sm:text-xs text-slate-400 mt-1 hidden sm:block whitespace-nowrap">{label}</span>
    </div>
  );
}

const icon = 'w-5 h-5 sm:w-6 sm:h-6';

export function MeetingControls(p: MeetingControlsProps) {
  const [menu, setMenu] = useState<'leave' | 'reactions' | 'more' | null>(null);
  const close = () => setMenu(null);
  const toggle = (m: 'leave' | 'reactions' | 'more') => setMenu(cur => (cur === m ? null : m));

  const item = 'w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-3 whitespace-nowrap';

  return (
    <div className="h-20 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-2 sm:px-6 fixed bottom-0 left-0 right-0 z-40">
      {/* Left: mic + camera */}
      <div className="flex-1 flex items-center gap-0.5 sm:gap-3 justify-start">
        <ControlButton label={p.isMicOn ? 'Mute' : 'Unmute'} onClick={p.toggleMic} danger={!p.isMicOn} testId="toggle-mic">
          {p.isMicOn ? <Mic className={icon} /> : <MicOff className={icon} />}
        </ControlButton>
        <ControlButton label={p.isCamOn ? 'Stop video' : 'Start video'} onClick={p.toggleCam} danger={!p.isCamOn} testId="toggle-cam">
          {p.isCamOn ? <Video className={icon} /> : <VideoOff className={icon} />}
        </ControlButton>
      </div>

      {/* Center */}
      <div className="flex items-center gap-0.5 sm:gap-2 justify-center">
        <ControlButton label="Participants" onClick={() => p.togglePanel('participants')} active={p.activePanel === 'participants'} testId="toggle-participants"
          badge={
            <>
              <span className="absolute top-0.5 right-0 min-w-4 h-4 px-1 rounded-full bg-slate-700 text-[10px] leading-4 text-slate-200 text-center" data-testid="participant-count">{p.participantCount}</span>
              {p.waitingCount > 0 && (
                <span className="absolute -top-0.5 -left-0.5 min-w-4 h-4 px-1 rounded-full bg-amber-400 text-[10px] leading-4 text-slate-900 font-bold text-center" data-testid="waiting-badge">{p.waitingCount}</span>
              )}
            </>
          }>
          <Users className={icon} />
        </ControlButton>

        <ControlButton label="Chat" onClick={() => p.togglePanel('chat')} active={p.activePanel === 'chat'} testId="toggle-chat"
          badge={p.unreadChat > 0 ? <span className="absolute top-0.5 right-0 min-w-4 h-4 px-1 rounded-full bg-red-500 text-[10px] leading-4 text-white text-center">{p.unreadChat}</span> : null}>
          <MessageSquare className={icon} />
        </ControlButton>

        <ControlButton label={p.isScreenSharing ? 'Stop share' : 'Share screen'} onClick={p.toggleScreenShare} active={p.isScreenSharing}
          testId="toggle-screenshare" hideOnMobile disabled={!p.screenShareSupported}>
          <MonitorUp className={icon} />
        </ControlButton>

        <div className="relative hidden sm:block">
          <ControlButton label="Reactions" onClick={() => toggle('reactions')} active={menu === 'reactions'} testId="toggle-reactions">
            <Smile className={icon} />
          </ControlButton>
          <Popover open={menu === 'reactions'} onClose={close}>
            <div className="flex gap-1 p-2" data-testid="reaction-picker">
              {REACTION_EMOJIS.map(e => (
                <button key={e} onClick={() => { p.sendReaction(e); close(); }} data-testid={`reaction-${e}`}
                  className="text-2xl p-1.5 rounded-lg hover:bg-slate-700 hover:scale-110 transition-transform">{e}</button>
              ))}
            </div>
          </Popover>
        </div>

        <ControlButton label={p.handRaised ? 'Lower hand' : 'Raise hand'} onClick={p.toggleHand} active={p.handRaised} testId="toggle-hand">
          <Hand className={`${icon} ${p.handRaised ? 'text-amber-400' : ''}`} />
        </ControlButton>

        <div className="relative">
          <ControlButton label="More" onClick={() => toggle('more')} active={menu === 'more'} testId="toggle-more">
            <MoreHorizontal className={icon} />
          </ControlButton>
          <Popover open={menu === 'more'} onClose={close}>
            <div className="min-w-[220px] py-1" data-testid="more-menu">
              {/* On phones these two live here to keep the bar uncluttered */}
              {p.screenShareSupported && (
                <button className={`${item} sm:hidden`} onClick={() => { close(); p.toggleScreenShare(); }}>
                  <MonitorUp className="w-4 h-4 text-slate-400" /> {p.isScreenSharing ? 'Stop sharing' : 'Share screen'}
                </button>
              )}
              <div className="sm:hidden flex gap-1 px-3 py-2 border-b border-slate-700">
                {REACTION_EMOJIS.map(e => (
                  <button key={e} onClick={() => { p.sendReaction(e); close(); }} className="text-xl p-1 rounded hover:bg-slate-700">{e}</button>
                ))}
              </div>
              <button className={item} data-testid="toggle-captions" disabled={!p.captionsSupported}
                onClick={() => { close(); p.toggleCaptions(); }}>
                <Captions className={`w-4 h-4 ${p.captionsOn ? 'text-blue-400' : 'text-slate-400'}`} />
                {p.captionsSupported ? (p.captionsOn ? 'Turn off captions' : 'Turn on captions') : 'Captions not supported here'}
              </button>
              <button className={item} data-testid="toggle-view"
                onClick={() => { close(); p.setViewMode(p.viewMode === 'gallery' ? 'speaker' : 'gallery'); }}>
                {p.viewMode === 'gallery' ? <Presentation className="w-4 h-4 text-slate-400" /> : <LayoutGrid className="w-4 h-4 text-slate-400" />}
                {p.viewMode === 'gallery' ? 'Speaker view' : 'Gallery view'}
              </button>
              {p.screenShareSupported && (
                <button className={`${item} hidden sm:flex`} onClick={() => { close(); p.toggleRecording(); }}>
                  <Circle className={`w-4 h-4 ${p.isRecording ? 'text-red-500 fill-red-500' : 'text-slate-400'}`} />
                  {p.isRecording ? 'Stop recording' : 'Record (this device)'}
                </button>
              )}
              <button className={item} data-testid="open-settings" onClick={() => { close(); p.openSettings(); }}>
                <Settings className="w-4 h-4 text-slate-400" /> Audio &amp; video settings
              </button>
            </div>
          </Popover>
        </div>
      </div>

      {/* Right: leave / end for all */}
      <div className="flex-1 flex items-center justify-end">
        {p.isHost ? (
          <div className="relative">
            <Popover open={menu === 'leave'} onClose={close} align="right">
              <div className="min-w-[200px]">
                <button onClick={() => { close(); p.onLeave(); }} data-testid="leave" className={item}>
                  <PhoneOff className="w-4 h-4 text-slate-400" /> Leave meeting
                </button>
                <div className="border-t border-slate-700" />
                <button onClick={() => { close(); p.onEndForAll(); }} data-testid="end-for-all"
                  className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3 font-medium">
                  <PhoneOff className="w-4 h-4" /> End meeting for all
                </button>
              </div>
            </Popover>
            <button onClick={() => toggle('leave')} data-testid="leave-menu"
              className="px-3 py-2 sm:px-5 sm:py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors flex items-center gap-2">
              <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Leave</span>
              <ChevronUp className={`w-4 h-4 transition-transform ${menu === 'leave' ? 'rotate-180' : ''}`} />
            </button>
          </div>
        ) : (
          <button onClick={p.onLeave} data-testid="leave"
            className="px-3 py-2 sm:px-6 sm:py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors flex items-center gap-2">
            <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        )}
      </div>
    </div>
  );
}
