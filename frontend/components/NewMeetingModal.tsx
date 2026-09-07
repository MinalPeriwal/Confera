"use client";

import { useState } from 'react';
import { X, Copy, CheckCircle, Video, Users } from 'lucide-react';
import { Meeting } from '@/types';
import { toast } from 'react-hot-toast';

interface NewMeetingModalProps {
  meeting: Meeting;
  onStart: () => void;
  onClose: () => void;
}

export function NewMeetingModal({ meeting, onStart, onClose }: NewMeetingModalProps) {
  const [copied, setCopied] = useState(false);

  const joinUrl = meeting.join_url || `${window.location.origin}/meeting/${meeting.meeting_id}`;
  const formatId = (id: string) => id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
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
