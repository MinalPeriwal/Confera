import { X, Mic, MicOff, Video, VideoOff, Shield, Link2, Hand, Pin, PinOff, MicOff as MuteIcon, UserX, MessageSquare, ShieldPlus, ShieldMinus, Lock, Unlock, DoorOpen } from 'lucide-react';
import { RemoteParticipant, RoomState, WaitingGuest } from '@/hooks/useWebRTC';

interface ParticipantsPanelProps {
  localParticipant: RemoteParticipant;
  remoteParticipants: RemoteParticipant[];
  /** Host or co-host */
  isModerator: boolean;
  /** The real host (can appoint co-hosts) */
  isHost: boolean;
  waitingList: WaitingGuest[];
  roomState: RoomState;
  pinnedId: string | null;
  onClose: () => void;
  onPin: (clientId: string) => void;
  onMessage: (clientId: string) => void;
  onCopyLink: () => void;
  moderation: {
    admit: (id: string) => void;
    deny: (id: string) => void;
    admitAll: () => void;
    mutePeer: (id: string) => void;
    muteAll: () => void;
    remove: (id: string) => void;
    lowerHand: (id: string) => void;
    setLock: (locked: boolean) => void;
    setWaitingRoom: (enabled: boolean) => void;
    makeCohost: (id: string, value: boolean) => void;
  };
}

function IconButton({ label, onClick, children, danger, testId }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; testId?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      data-testid={testId}
      className={`p-1.5 rounded-lg transition-colors ${danger ? 'text-red-400 hover:bg-red-400/10' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700'}`}
    >
      {children}
    </button>
  );
}

function Toggle({ label, checked, onChange, testId, icon }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId: string; icon: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
      <span className="flex items-center gap-2 text-sm text-slate-200">{icon}{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
    </label>
  );
}

export function ParticipantsPanel({
  localParticipant, remoteParticipants, isModerator, isHost, waitingList, roomState, pinnedId,
  onClose, onPin, onMessage, onCopyLink, moderation,
}: ParticipantsPanelProps) {
  const participants = [localParticipant, ...remoteParticipants];

  return (
    <div className="w-full sm:w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-[calc(100dvh-5rem)] fixed right-0 top-0 z-30 shadow-2xl" data-testid="participants-panel">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
        <h2 className="text-slate-100 font-medium">Participants ({participants.length})</h2>
        <button onClick={onClose} aria-label="Close participants" className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isModerator && waitingList.length > 0 && (
          <div className="m-2 p-3 rounded-xl bg-amber-400/10 border border-amber-400/30" data-testid="waiting-list">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-amber-300">Waiting room ({waitingList.length})</h3>
              <button onClick={moderation.admitAll} data-testid="admit-all" className="text-xs font-medium text-amber-300 hover:text-amber-100">Admit all</button>
            </div>
            <ul className="space-y-1.5">
              {waitingList.map(g => (
                <li key={g.client_id} className="flex items-center justify-between gap-2" data-testid="waiting-guest">
                  <span className="text-sm text-slate-100 truncate">{g.display_name}</span>
                  <span className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => moderation.admit(g.client_id)} data-testid="admit"
                      className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md">Admit</button>
                    <button onClick={() => moderation.deny(g.client_id)} data-testid="deny"
                      className="px-2.5 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-md">Deny</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="p-2 space-y-1">
          {participants.map(p => {
            const isLocal = p.client_id === localParticipant.client_id;
            const pinned = pinnedId === p.client_id;
            return (
              <div key={p.client_id} data-testid="participant-row" data-name={p.display_name} className="flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-slate-800 transition-colors group">
                <div className="flex items-center gap-3 overflow-hidden min-w-0">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {p.display_name.substring(0, 2).toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-slate-200 text-sm font-medium flex items-center gap-1 min-w-0">
                      <span className="truncate">{p.display_name}</span>
                      {p.is_host && <span title="Host"><Shield className="w-3 h-3 text-blue-400 flex-shrink-0" /></span>}
                    </span>
                    {(p.is_host || p.is_cohost) && <span className="text-[11px] text-slate-500">{p.is_host ? 'Host' : 'Co-host'}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {p.hand_raised && <Hand className="w-4 h-4 text-amber-400 mr-1" aria-label="Hand raised" />}
                  {p.is_muted ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4 text-slate-500" />}
                  {p.camera_enabled ? <Video className="w-4 h-4 text-slate-500 ml-1" /> : <VideoOff className="w-4 h-4 text-red-400 ml-1" />}

                  <span className="flex items-center sm:hidden sm:group-hover:flex group-focus-within:flex ml-1">
                    <IconButton label={pinned ? 'Unpin' : 'Pin to stage'} onClick={() => onPin(p.client_id)}>
                      {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </IconButton>
                    {!isLocal && (
                      <IconButton label={`Message ${p.display_name} privately`} onClick={() => onMessage(p.client_id)}>
                        <MessageSquare className="w-4 h-4" />
                      </IconButton>
                    )}
                    {isModerator && !isLocal && p.hand_raised && (
                      <IconButton label="Lower hand" testId="lower-hand" onClick={() => moderation.lowerHand(p.client_id)}><Hand className="w-4 h-4" /></IconButton>
                    )}
                    {isModerator && !isLocal && !p.is_host && !p.is_cohost && !p.is_muted && (
                      <IconButton label="Mute" onClick={() => moderation.mutePeer(p.client_id)} testId="mute-peer"><MuteIcon className="w-4 h-4" /></IconButton>
                    )}
                    {isHost && !isLocal && !p.is_host && (
                      <IconButton label={p.is_cohost ? 'Remove co-host' : 'Make co-host'} onClick={() => moderation.makeCohost(p.client_id, !p.is_cohost)} testId="make-cohost">
                        {p.is_cohost ? <ShieldMinus className="w-4 h-4" /> : <ShieldPlus className="w-4 h-4" />}
                      </IconButton>
                    )}
                    {isModerator && !isLocal && !p.is_host && (
                      <IconButton label="Remove from meeting" danger testId="remove-peer" onClick={() => {
                        if (window.confirm(`Remove ${p.display_name} from the meeting?`)) moderation.remove(p.client_id);
                      }}>
                        <UserX className="w-4 h-4" />
                      </IconButton>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50 space-y-1 flex-shrink-0">
        {isModerator && (
          <div className="pb-2 mb-2 border-b border-slate-800">
            <Toggle label="Lock meeting" checked={roomState.locked} onChange={moderation.setLock} testId="toggle-lock"
              icon={roomState.locked ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-slate-400" />} />
            <Toggle label="Waiting room" checked={roomState.waiting_room} onChange={moderation.setWaitingRoom} testId="toggle-waiting-room"
              icon={<DoorOpen className="w-4 h-4 text-slate-400" />} />
            <button onClick={moderation.muteAll} data-testid="mute-all"
              className="w-full mt-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-colors text-sm">
              Mute all
            </button>
          </div>
        )}
        <button
          onClick={onCopyLink}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
        >
          <Link2 className="w-4 h-4" /> Copy invite link
        </button>
      </div>
    </div>
  );
}
