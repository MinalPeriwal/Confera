"use client";

import { Meeting } from '@/types';
import { Calendar, Clock, Video, Users, Copy, Play, ExternalLink, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useState } from 'react';
import { buildMeetingLink, copyToClipboard } from '@/lib/links';

interface MeetingCardProps {
  meeting: Meeting;
  type: 'upcoming' | 'recent';
  onJoin?: (meetingId: string) => void;
  onViewDetails?: (meeting: Meeting) => void;
}

const STATUS_CONFIG = {
  active: {
    label: 'Live Now',
    dot: 'bg-green-500 animate-pulse',
    badge: 'bg-green-50 text-green-700 border-green-200',
    accent: 'border-l-green-500',
  },
  scheduled: {
    label: 'Scheduled',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    accent: 'border-l-blue-500',
  },
  ended: {
    label: 'Ended',
    dot: 'bg-slate-400',
    badge: 'bg-slate-50 text-slate-600 border-slate-200',
    accent: 'border-l-slate-300',
  },
};

function parseUTC(dateString: string) {
  if (!dateString.endsWith('Z') && !dateString.includes('+')) {
    return new Date(dateString + 'Z');
  }
  return new Date(dateString);
}

function getTimeDisplay(meeting: Meeting) {
  const ref = meeting.scheduled_at ? parseUTC(meeting.scheduled_at) : parseUTC(meeting.created_at);
  const now = new Date();
  const diffMs = ref.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  const date = ref.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = ref.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (meeting.status === 'active') return { primary: 'In progress', secondary: `Started at ${time}` };
  if (meeting.status === 'ended') {
    const ago = parseUTC(meeting.created_at);
    const agoMs = now.getTime() - ago.getTime();
    const agoHrs = Math.round(agoMs / 3600000);
    const agoLabel = agoHrs < 1 ? 'Less than an hour ago' : agoHrs < 24 ? `${agoHrs}h ago` : date;
    return { primary: date, secondary: agoLabel };
  }
  if (diffMins <= 0) return { primary: 'Starting now', secondary: time };
  if (diffMins < 60) return { primary: `Starts in ${diffMins}m`, secondary: `${date} at ${time}` };
  if (diffMins < 1440) return { primary: `Today at ${time}`, secondary: date };
  return { primary: date, secondary: `at ${time}` };
}

function getHostInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function MeetingCard({ meeting, type, onJoin, onViewDetails }: MeetingCardProps) {
  const [copied, setCopied] = useState(false);
  const status = STATUS_CONFIG[meeting.status] ?? STATUS_CONFIG.ended;
  const { primary, secondary } = getTimeDisplay(meeting);

  const formatId = (id: string) => id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');

  const copyLink = async () => {
    if (!(await copyToClipboard(buildMeetingLink(meeting.meeting_id)))) {
      toast.error('Could not copy the link');
      return;
    }
    setCopied(true);
    toast.success('Invite link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const participantCount = meeting.participants?.length ?? 0;

  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${status.accent} rounded-xl hover:shadow-lg transition-all duration-200 flex flex-col overflow-hidden group`}>
      {/* Header */}
      <div className="p-5 pb-4 flex-1">
        <div className="flex items-start justify-between gap-3 mb-4">
          {/* Status Badge */}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${status.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>

          {/* Duration pill */}
          <span className="text-xs text-slate-400 bg-slate-50 border border-slate-100 px-2 py-1 rounded-full font-medium flex-shrink-0">
            {meeting.duration_minutes}m
          </span>
        </div>

        {/* Title */}
        <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2 mb-3 group-hover:text-blue-700 transition-colors" title={meeting.title}>
          {meeting.title || 'Untitled Meeting'}
        </h3>

        {/* Host row */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            {getHostInitials(meeting.host_name || 'U')}
          </div>
          <span className="text-sm text-slate-600 truncate">
            <span className="text-slate-400">Host:</span> <span className="font-medium text-slate-700">{meeting.host_name || 'Unknown'}</span>
          </span>
        </div>

        {/* Time info */}
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-slate-700">{primary}</span>
            {secondary !== primary && (
              <span className="text-xs text-slate-400 ml-1">· {secondary}</span>
            )}
          </div>
        </div>

        {/* Meeting ID */}
        <div className="flex items-center gap-2">
          <Video className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-xs font-mono text-slate-500 tracking-wider">{formatId(meeting.meeting_id)}</span>
        </div>

        {/* Participants for recent */}
        {type === 'recent' && participantCount > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <Users className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-500">{participantCount} participant{participantCount !== 1 ? 's' : ''} attended</span>
          </div>
        )}

        {/* Description */}
        {meeting.description && (
          <p className="mt-3 text-xs text-slate-400 line-clamp-2 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
            {meeting.description}
          </p>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-5 pb-5 pt-1 border-t border-slate-100 mt-1">
        {type === 'upcoming' && (
          <div className="flex gap-2 pt-3">
            <button
              onClick={() => onJoin && onJoin(meeting.meeting_id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                meeting.status === 'active'
                  ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm shadow-green-200'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              {meeting.status === 'active' ? 'Join Now' : 'Join'}
            </button>
            <button
              onClick={copyLink}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
              title="Copy invite link"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {type === 'recent' && (
          <div className="flex gap-2 pt-3">
            <button
              onClick={() => onViewDetails && onViewDetails(meeting)}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Details
            </button>
            <button
              onClick={copyLink}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
              title="Copy invite link"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
