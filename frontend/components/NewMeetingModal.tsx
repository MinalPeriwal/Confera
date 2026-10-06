"use client";

import { useState } from 'react';
import { X, Copy, CheckCircle, Video, Users, ShieldCheck, KeyRound } from 'lucide-react';
import { Meeting, MeetingSettingsPayload } from '@/types';
import { toast } from 'react-hot-toast';
import { buildMeetingLink, copyToClipboard, formatMeetingId } from '@/lib/links';

interface NewMeetingModalProps {
  meeting: Meeting;
  onStart: () => void;
  onClose: () => void;
  /** Persist security options chosen by the host (waiting room, passcode) */
  onUpdateSettings?: (settings: MeetingSettingsPayload) => Promise<void>;
}

export function NewMeetingModal({ meeting, onStart, onClose, onUpdateSettings }: NewMeetingModalProps) {
  const [copied, setCopied] = useState(false);
  const [waitingRoom, setWaitingRoom] = useState(meeting.waiting_room);
  const [passcode, setPasscode] = useState('');
  const [hasPasscode, setHasPasscode] = useState(meeting.has_passcode);
  const [saving, setSaving] = useState(false);

  const save = async (settings: MeetingSettingsPayload, onOk?: () => void) => {
    if (!onUpdateSettings) return;
    setSaving(true);
    try {
      await onUpdateSettings(settings);
      onOk?.();
    } catch {
      toast.error('Could not update the meeting settings');
    } finally {
      setSaving(false);
    }
  };
  const savePasscode = () => {
    const value = passcode.trim();
    if (value.length < 4) { toast.error('A passcode needs 4 to 16 characters'); return; }
    void save({ passcode: value }, () => { setHasPasscode(true); setPasscode(''); toast.success('Passcode set. Share it with your guests.'); });
  };

  const joinUrl = buildMeetingLink(meeting.meeting_id);
  const formatId = formatMeetingId;

  const copyLink = async () => {
    if (!(await copyToClipboard(joinUrl))) {
      toast.error('Could not copy. Select the link and copy it manually.');
      return;
    }
    setCopied(true);
    toast.success('Invite link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">Meeting Ready</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl p-4">
            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Video className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">{meeting.title}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <Users className="w-3 h-3" /> Share the link below to invite others
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Meeting ID</p>
            <p className="text-2xl font-mono font-bold text-slate-900 tracking-widest">
              {formatId(meeting.meeting_id)}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Invite Link</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <span className="text-sm text-slate-600 truncate flex-1 font-mono">{joinUrl}</span>
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 flex-shrink-0 transition-colors"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {onUpdateSettings && (
          <div className="px-6 pb-5 space-y-3" data-testid="security-options">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-700"><ShieldCheck className="w-4 h-4" /> Security</p>
            <label className="flex items-center justify-between gap-3 text-sm text-slate-700 cursor-pointer">
              <span>Waiting room <span className="text-slate-400">(you admit each guest)</span></span>
              <input
                type="checkbox"
                data-testid="opt-waiting-room"
                checked={waitingRoom}
                disabled={saving}
                onChange={(e) => { const v = e.target.checked; void save({ waiting_room: v }, () => setWaitingRoom(v)); }}
                className="w-5 h-5 accent-blue-600"
              />
            </label>
            <div>
              <p className="flex items-center gap-2 text-sm text-slate-700 mb-1.5"><KeyRound className="w-4 h-4" /> Passcode {hasPasscode && <span className="text-green-600 text-xs font-medium">(set)</span>}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  data-testid="opt-passcode"
                  value={passcode}
                  maxLength={16}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder={hasPasscode ? 'Enter a new passcode to change it' : 'Optional, 4-16 characters'}
                  className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={savePasscode} disabled={saving || !passcode.trim()} data-testid="opt-passcode-save"
                  className="px-3 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50">Set</button>
                {hasPasscode && (
                  <button onClick={() => void save({ clear_passcode: true }, () => setHasPasscode(false))} disabled={saving}
                    className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">Remove</button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onStart}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Video className="w-4 h-4" />
            Start Meeting
          </button>
        </div>
      </div>
    </div>
  );
}
