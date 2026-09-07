"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { api, createApi } from '@/lib/api';
import { Meeting } from '@/types';
import { ArrowLeft } from 'lucide-react';
import { useMediaStream } from '@/hooks/useMediaStream';
import { PreJoinScreen } from '@/components/meeting/PreJoinScreen';
import { MeetingRoom } from '@/components/meeting/MeetingRoom';
import toast from 'react-hot-toast';

type MeetingPhase = 'loading' | 'error' | 'pre-join' | 'active';

export default function MeetingPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  
  const [phase, setPhase] = useState<MeetingPhase>('loading');
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [error, setError] = useState<string>('');
  
  const media = useMediaStream();
  
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [joining, setJoining] = useState(false);

  // Stable unique ID for this WebRTC session — generated once per page load
  const clientIdRef = useRef<string>(
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );

  useEffect(() => {
    const fetchMeeting = async () => {
      try {
        const data = await api.getMeeting(params.id as string);
        setMeeting(data);
        setPhase('pre-join');
      } catch (err: any) {
        setError(err.message || 'Meeting not found');
        setPhase('error');
      }
    };

    if (params.id) {
      fetchMeeting();
    }
  }, [params.id]);

  const handleJoin = async (name: string) => {
    if (!meeting) return;
    try {
      setJoining(true);
      setDisplayName(name);
      
      const isHost = name.toLowerCase() === 'minal' || name.toLowerCase() === meeting.host_name.toLowerCase();

      const response = await api.joinMeeting(meeting.meeting_id, {
        display_name: name,
        is_host: isHost
      });
      
      setParticipantId(response.participant_id);
      setPhase('active');
    } catch (err: any) {
      toast.error(err.message || 'Failed to join meeting');
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    media.cleanup();
    if (meeting && participantId) {
      try {
        await api.leaveMeeting(meeting.meeting_id, participantId);
      } catch (e) {
        console.error('Failed to leave meeting cleanly', e);
      }
    }
    router.push('/dashboard');
  };

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium">Validating meeting...</p>
      </div>
    );
  }

  if (phase === 'error' || !meeting) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Meeting Not Found</h1>
          <p className="text-slate-500 mb-8">{error || 'The meeting link is invalid or has expired.'}</p>
          <button 
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'pre-join') {
    return (
      <PreJoinScreen 
        meeting={meeting}
        media={media}
        onJoin={handleJoin}
        onCancel={() => router.push('/dashboard')}
        joining={joining}
      />
    );
  }

  if (phase === 'active' && participantId) {
    const isHost = displayName.toLowerCase() === 'minal' || displayName.toLowerCase() === meeting.host_name.toLowerCase();
    return (
      <MeetingRoom 
        meeting={meeting}
        media={media}
        participantId={participantId}
        clientId={clientIdRef.current}
        displayName={displayName}
        isHost={isHost}
        onLeave={handleLeave}
        onEndMeeting={async () => {
          const token = await getToken();
          await createApi(token).endMeeting(meeting.meeting_id);
        }}
      />
    );
  }

  return null;
}
