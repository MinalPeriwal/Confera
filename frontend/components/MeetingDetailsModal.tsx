"use client";

import { Meeting } from '@/types';
import { X, Calendar, Clock, Users, Video, Copy, Play, CheckCircle, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useState } from 'react';

interface MeetingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  meeting: Meeting | null;
  onJoin?: (meetingId: string) => void;
}

export function MeetingDetailsModal({ isOpen, onClose, meeting, onJoin }: MeetingDetailsModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !meeting) return null;

  const parseUTC = (dateString: string) => {
    if (!dateString.endsWith('Z') && !dateString.includes('+')) {
      return new Date(dateString + 'Z');
    }
    return new Date(dateString);
  };

  const dateObj = meeting.scheduled_at ? parseUTC(meeting.scheduled_at) : parseUTC(meeting.created_at);
  const formattedDate = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formattedTime = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const participantCount = meeting.participants?.length ?? 0;
  const formatId = (id: string) => id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');

  const copyLink = () => {
    const url = meeting.join_url || `${window.location.origin}/meeting/${meeting.meeting_id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Invite link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const getHostInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const statusConfig = {
    active: { label: 'Live Now', dot: 'bg-green-500 animate-pulse', badge: 'bg-green-50 text-green-700 border-green-200' },
    scheduled: { label: 'Scheduled', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
    ended: { label: 'Ended', dot: 'bg-slate-400', badge: 'bg-slate-50 text-slate-600 border-slate-200' },
  };
  const status = statusConfig[meeting.status] ?? statusConfig.ended;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">

        {/* Colored top accent */}
        <div className={`h-1.5 w-full ${meeting.status === 'active' ? 'bg-gradient-to-r from-green-400 to-emerald-500' : meeting.status === 'scheduled' ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-gradient-to-r from-slate-300 to-slate-400'}`} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${status.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Title & host */}
          <div>
            <h2 className="text-2xl font-bold text-slate-900 leading-tight mb-2">
              {meeting.title || 'Untitled Meeting'}
            </h2>
            {meeting.description && (
              <p className="text-slate-500 text-sm leading-relaxed">{meeting.description}</p>
            )}
          </div>

          {/* Host card */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {getHostInitials(meeting.host_name || 'U')}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{meeting.host_name || 'Unknown'}</p>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Meeting Host
              </p>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Date</p>
                <p className="text-sm font-semibold text-slate-800">{formattedDate}</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Time & Duration</p>
                <p className="text-sm font-semibold text-slate-800">{formattedTime}</p>
                <p className="text-xs text-slate-400">{meeting.duration_minutes} minutes</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-start gap-2.5">
              <Video className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Meeting ID</p>
                <p className="text-sm font-semibold text-slate-800 font-mono tracking-widest">{formatId(meeting.meeting_id)}</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-start gap-2.5">
              <Users className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Participants</p>
                <p className="text-sm font-semibold text-slate-800">
                  {participantCount > 0 ? `${participantCount} joined` : 'No data'}
                </p>
              </div>
            </div>
          </div>

          {/* Participants list if available */}
          {meeting.participants && meeting.participants.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Attendees</p>
              <div className="flex flex-wrap gap-2">
                {meeting.participants.map(p => (
                  <span key={p.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1 text-xs font-medium text-slate-700">
                    <span className={`w-2 h-2 rounded-full ${p.is_host ? 'bg-blue-500' : 'bg-slate-300'}`} />
                    {p.display_name}
                    {p.is_host && <span className="text-blue-500 text-[10px]">(Host)</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-2 flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Invite Link'}
          </button>
          {meeting.status !== 'ended' && onJoin && (
            <button
              onClick={() => { onJoin(meeting.meeting_id); onClose(); }}
              className={`flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${
                meeting.status === 'active' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Play className="w-4 h-4" />
              {meeting.status === 'active' ? 'Join Now' : 'Join Meeting'}
            </button>
          )}
          {meeting.status === 'ended' && (
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
