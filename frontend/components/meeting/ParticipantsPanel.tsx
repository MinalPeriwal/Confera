import { useEffect, useState } from 'react';
import { Participant } from '@/types';
import { api } from '@/lib/api';
import { X, Mic, MicOff, Video, VideoOff, Shield, ShieldAlert } from 'lucide-react';

interface ParticipantsPanelProps {
  meetingId: string;
  isHost: boolean;
  onClose: () => void;
}

export function ParticipantsPanel({ meetingId, isHost, onClose }: ParticipantsPanelProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchParticipants = async () => {
    try {
      const data = await api.getParticipants(meetingId) as Participant[];
      setParticipants(data);
    } catch (err) {
      console.error('Failed to fetch participants', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParticipants();
    const interval = setInterval(fetchParticipants, 5000);
    return () => clearInterval(interval);
  }, [meetingId]);

  const handleMuteAll = async () => {
    try {
      await api.muteAll(meetingId);
      fetchParticipants();
    } catch (err) {
      console.error('Failed to mute all', err);
    }
  };

  const handleRemove = async (participantId: number) => {
    if (!window.confirm('Are you sure you want to remove this participant?')) return;
    try {
      await api.removeParticipant(meetingId, participantId);
      fetchParticipants();
    } catch (err) {
      console.error('Failed to remove participant', err);
    }
  };

  return (
    <div className="w-full sm:w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-[calc(100vh-5rem)] fixed right-0 top-0 z-30 shadow-2xl">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4">
        <h2 className="text-slate-100 font-medium">Participants ({participants.length})</h2>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && participants.length === 0 ? (
          <div className="flex justify-center p-4"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>
        ) : (
          <div className="space-y-1">
            {participants.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800 transition-colors group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {p.display_name.substring(0, 2).toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-slate-200 text-sm font-medium flex items-center gap-1">
                      {p.display_name}
                      {p.is_host && <Shield className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {p.is_muted ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4 text-slate-400" />}
                  {p.camera_enabled ? <Video className="w-4 h-4 text-slate-400" /> : <VideoOff className="w-4 h-4 text-red-400" />}
                  
                  {isHost && !p.is_host && (
                    <button 
                      onClick={() => handleRemove(p.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:bg-red-400/10 rounded transition-all ml-1"
                      title="Remove Participant"
                    >
                      <ShieldAlert className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isHost && (
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <button 
            onClick={handleMuteAll}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-colors text-sm"
          >
            Mute All
          </button>
        </div>
      )}
    </div>
  );
}
