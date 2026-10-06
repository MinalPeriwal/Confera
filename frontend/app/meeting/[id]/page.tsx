"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { api, ApiError, createApi } from '@/lib/api';
import { Meeting } from '@/types';
import { ArrowLeft, Home, RefreshCw, VideoOff, UserX, CalendarX } from 'lucide-react';
import { useMediaStream } from '@/hooks/useMediaStream';
import { EndReason } from '@/hooks/useWebRTC';
import { PreJoinScreen } from '@/components/meeting/PreJoinScreen';
import { MeetingRoom } from '@/components/meeting/MeetingRoom';

type Phase =
  | { name: 'loading' }
  | { name: 'error'; kind: 'not_found' | 'network' | 'ended'; message: string }
  | { name: 'pre-join' }
  | { name: 'active' }
  | { name: 'closed'; reason: EndReason | 'left' };

const newClientId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

function Screen({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">{icon}</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{title}</h1>
        <p className="text-slate-500 mb-8">{body}</p>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

export default function MeetingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [ticket, setTicket] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const media = useMediaStream();

  // One identity per page load. A refresh gets a new one, and the server drops the old socket.
  const [clientId] = useState(newClientId);

  const meetingId = params.id;
  const homePath = user ? '/dashboard' : '/';

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getMeeting(meetingId);
        if (cancelled) return;
        setMeeting(data);
        setPhase(data.status === 'ended'
          ? { name: 'error', kind: 'ended', message: 'This meeting has already ended.' }
          : { name: 'pre-join' });
      } catch (err) {
        if (cancelled) return;
        setPhase(err instanceof ApiError && err.status === 404
          ? { name: 'error', kind: 'not_found', message: 'This meeting link is invalid or the meeting no longer exists.' }
          : { name: 'error', kind: 'network', message: 'We could not reach the server. Check your connection and try again.' });
      }
    })();
    return () => { cancelled = true; };
  }, [meetingId, loadAttempt]);

  const handleJoin = async (name: string, passcode?: string) => {
    if (!meeting) return;
    setJoining(true);
    setJoinError(null);
    try {
      // A signed-in host sends their token so the SERVER can recognise them (guests send none).
      const token = user ? await getToken() : null;
      const response = await createApi(token).joinMeeting(meeting.meeting_id, { display_name: name, passcode: passcode || undefined });
      setDisplayName(name);
      setParticipantId(response.participant_id);
      setTicket(response.ticket);
      setIsHost(response.is_host);
      setPhase({ name: 'active' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setPhase({ name: 'error', kind: 'ended', message: 'This meeting has already ended.' });
      } else if (err instanceof ApiError && err.status === 404) {
        setPhase({ name: 'error', kind: 'not_found', message: 'This meeting no longer exists.' });
      } else if (err instanceof ApiError && err.status === 403) {
        setJoinError('That passcode is incorrect. Check it with the host and try again.');
      } else if (err instanceof ApiError && err.status === 423) {
        setJoinError('The host has locked this meeting, so no one new can join right now.');
      } else if (err instanceof ApiError && err.status === 429) {
        setJoinError('Too many attempts. Please wait a minute and try again.');
      } else {
        setJoinError('Could not join the meeting. Please check your connection and try again.');
      }
    } finally {
      setJoining(false);
    }
  };

  const leaveRest = async () => {
    if (meeting && participantId) {
      try { await api.leaveMeeting(meeting.meeting_id, participantId); } catch { /* the socket close also marks us as left */ }
    }
  };

  const handleLeave = async () => {
    media.cleanup();
    setPhase({ name: 'closed', reason: 'left' });
    await leaveRest();
  };

  const handleClosed = (reason: EndReason) => {
    media.cleanup();
    setPhase({ name: 'closed', reason });
    void leaveRest();
  };

  const handleRejoin = () => {
    // Fresh identity + fresh media permission prompt, exactly like a page refresh.
    window.location.reload();
  };

  if (phase.name === 'loading' || !userLoaded) {
    return (
      <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center" role="status">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-600 font-medium">Loading meeting…</p>
      </div>
    );
  }

  if (phase.name === 'error') {
    const icon = phase.kind === 'network' ? <RefreshCw className="w-6 h-6" /> : phase.kind === 'ended' ? <CalendarX className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />;
    const title = phase.kind === 'ended' ? 'Meeting ended' : phase.kind === 'network' ? 'Connection problem' : 'Meeting not found';
    return (
      <Screen icon={icon} title={title} body={phase.message}>
        {phase.kind === 'network' && (
          <button onClick={() => { setPhase({ name: 'loading' }); setLoadAttempt(n => n + 1); }} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        )}
        <button onClick={() => router.push(homePath)} className="w-full py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {user ? 'Back to dashboard' : 'Go to home page'}
        </button>
      </Screen>
    );
  }

  if (phase.name === 'closed') {
    const copy = {
      left: { icon: <Home className="w-6 h-6" />, title: 'You left the meeting', body: 'You can rejoin at any time while the meeting is still running.' },
      ended: { icon: <CalendarX className="w-6 h-6" />, title: 'The meeting has ended', body: 'The host ended this meeting for everyone.' },
      removed: { icon: <UserX className="w-6 h-6" />, title: 'You were removed', body: 'The host removed you from this meeting.' },
      not_found: { icon: <VideoOff className="w-6 h-6" />, title: 'Meeting unavailable', body: 'This meeting no longer exists.' },
      denied: { icon: <UserX className="w-6 h-6" />, title: 'Entry declined', body: 'The host did not admit you to this meeting.' },
      unauthorized: { icon: <VideoOff className="w-6 h-6" />, title: 'Session expired', body: 'Your join session is no longer valid. Rejoin to continue.' },
    }[phase.reason];
    const canRejoin = phase.reason === 'left' || phase.reason === 'unauthorized';
    return (
      <Screen icon={copy.icon} title={copy.title} body={copy.body}>
        {canRejoin && (
          <button onClick={handleRejoin} data-testid="rejoin" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors">
            Rejoin meeting
          </button>
        )}
        <button onClick={() => router.push(homePath)} className="w-full py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors">
          {user ? 'Back to dashboard' : 'Go to home page'}
        </button>
      </Screen>
    );
  }

  if (!meeting) return null;

  if (phase.name === 'pre-join') {
    return <PreJoinScreen meeting={meeting} media={media} onJoin={handleJoin} onCancel={() => router.push(homePath)} joining={joining} joinError={joinError} />;
  }

  if (phase.name === 'active' && participantId !== null) {
    return (
      <MeetingRoom
        meeting={meeting}
        media={media}
        participantId={participantId}
        clientId={clientId}
        displayName={displayName}
        ticket={ticket}
        isHost={isHost}
        onLeave={handleLeave}
        onClosed={handleClosed}
        onEndMeeting={async () => {
          const token = await getToken();
          await createApi(token).endMeeting(meeting.meeting_id);
        }}
      />
    );
  }

  return null;
}
