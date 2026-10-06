import { useState, useEffect, useRef, useCallback } from 'react';
import { api, getMeetingSocketUrl } from '@/lib/api';

export interface RemoteParticipant {
  id: number | string | null; // database participant id
  client_id: string; // per-page-load WebRTC/WebSocket identity
  display_name: string;
  is_host: boolean;
  is_cohost?: boolean;
  is_muted: boolean;
  camera_enabled: boolean;
  is_screen_sharing?: boolean;
  hand_raised?: boolean;
}

export interface ChatEvent {
  id: string;
  from: string;
  sender: string;
  text: string;
  timestamp: string;
  private?: boolean;
  to?: string;
  attachment?: { name: string; size: number; url: string } | null;
}

export interface RoomState {
  locked: boolean;
  waiting_room: boolean;
}

export interface WaitingGuest {
  client_id: string;
  display_name: string;
}

export type EndReason = 'ended' | 'removed' | 'not_found' | 'denied' | 'unauthorized';
export type ConnectionStatus = 'connecting' | 'waiting' | 'connected' | 'reconnecting';

interface UseWebRTCOptions {
  meetingId: string;
  clientId: string;
  /** Signed join credential from the REST join call: carries our identity and role. */
  ticket: string;
  localStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  onMeetingEnded?: (reason: EndReason) => void;
  onChatMessage?: (message: ChatEvent) => void;
  onChatHistory?: (messages: ChatEvent[]) => void;
  onReaction?: (clientId: string, emoji: string) => void;
  onCaption?: (clientId: string, sender: string, text: string, final: boolean) => void;
  onForceMute?: () => void;
  onWaitingGuest?: (guest: WaitingGuest) => void;
}

// Close codes sent by the backend (see backend/connection_manager.py)
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_REMOVED = 4403;
const CLOSE_NOT_FOUND = 4404;
const CLOSE_DENIED = 4405;
const CLOSE_ENDED = 4410;

const PING_INTERVAL_MS = 15_000;
const STALE_AFTER_MS = 40_000;
const MAX_BACKOFF_MS = 8_000;

function fallbackIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.NEXT_PUBLIC_TURN_URL) {
    servers.push({
      urls: process.env.NEXT_PUBLIC_TURN_URL.split(','),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

async function loadIceServers(): Promise<RTCIceServer[]> {
  try {
    const result = await Promise.race([
      api.getIceServers(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ICE config timeout')), 5000)),
    ]);
    if (result.iceServers?.length) return result.iceServers;
  } catch (err) {
    console.warn('Falling back to default ICE servers', err);
  }
  return fallbackIceServers();
}

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  /** Polite peer rolls back on offer collision ("perfect negotiation"). */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  /** Serializes async signaling work per peer so handlers never interleave. */
  chain: Promise<void>;
  remoteStream: MediaStream;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

export function useWebRTC({
  meetingId,
  clientId,
  ticket,
  localStream,
  isAudioEnabled,
  isVideoEnabled,
  onMeetingEnded,
  onChatMessage,
  onChatHistory,
  onReaction,
  onCaption,
  onForceMute,
  onWaitingGuest,
}: UseWebRTCOptions) {
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [roomState, setRoomState] = useState<RoomState>({ locked: false, waiting_room: false });
  const [waitingList, setWaitingList] = useState<WaitingGuest[]>([]);
  const [self, setSelf] = useState({ is_host: false, is_cohost: false });
  const [handRaised, setHandRaisedState] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>(fallbackIceServers());
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  // Latest values for use inside long-lived callbacks (socket handlers etc.)
  const latest = useRef({ isAudioEnabled, isVideoEnabled, localStream });
  const callbacks = useRef({ onMeetingEnded, onChatMessage, onChatHistory, onReaction, onCaption, onForceMute, onWaitingGuest });
  const handRaisedRef = useRef(false);
  useEffect(() => {
    latest.current = { isAudioEnabled, isVideoEnabled, localStream };
    callbacks.current = { onMeetingEnded, onChatMessage, onChatHistory, onReaction, onCaption, onForceMute, onWaitingGuest };
  });

  // ─── Socket helpers ───────────────────────────────────────────────────────────

  const send = useCallback((message: Record<string, unknown>): boolean => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  const publishRemoteStreams = useCallback(() => {
    const next = new Map<string, MediaStream>();
    peersRef.current.forEach((peer, id) => next.set(id, peer.remoteStream));
    setRemoteStreams(next);
  }, []);

  // ─── Local media → peer connections ──────────────────────────────────────────

  const currentTrack = (kind: 'audio' | 'video'): MediaStreamTrack | null => {
    if (kind === 'video' && screenTrackRef.current) return screenTrackRef.current;
    const stream = latest.current.localStream;
    return (kind === 'audio' ? stream?.getAudioTracks()[0] : stream?.getVideoTracks()[0]) ?? null;
  };

  /** Point every audio/video sender at our current tracks. replaceTrack needs no renegotiation. */
  const attachLocalTracks = useCallback(async (peer: Peer) => {
    for (const tx of peer.pc.getTransceivers()) {
      if (tx.currentDirection === 'stopped') continue;
      const kind = tx.receiver.track.kind as 'audio' | 'video';
      const track = currentTrack(kind);
      if (tx.direction !== 'sendrecv') tx.direction = 'sendrecv';
      if (tx.sender.track !== track) {
        try { await tx.sender.replaceTrack(track); } catch (err) { console.warn('replaceTrack failed', err); }
      }
    }
  }, []);

  // ─── Peer connection lifecycle ───────────────────────────────────────────────

  const closePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peersRef.current.delete(peerId);
    publishRemoteStreams();
  }, [publishRemoteStreams]);

  const createPeer = useCallback((remoteId: string, initiator: boolean): Peer => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const peer: Peer = {
      id: remoteId,
      pc,
      polite: clientId < remoteId,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      chain: Promise.resolve(),
      remoteStream: new MediaStream(),
      disconnectTimer: null,
    };
    peersRef.current.set(remoteId, peer);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) send({ type: 'ice_candidate', to: remoteId, candidate: candidate.toJSON() });
    };

    pc.ontrack = ({ track }) => {
      if (!peer.remoteStream.getTracks().includes(track)) peer.remoteStream.addTrack(track);
      publishRemoteStreams();
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        const d = pc.localDescription;
        if (d) send({ type: d.type, to: remoteId, sdp: d.sdp });
      } catch (err) {
        console.warn('Negotiation failed', err);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onconnectionstatechange = () => {
      if (peer.disconnectTimer) { clearTimeout(peer.disconnectTimer); peer.disconnectTimer = null; }
      if (pc.connectionState === 'failed') {
        pc.restartIce();
      } else if (pc.connectionState === 'disconnected') {
        // Often self-heals within seconds; restart ICE if it does not.
        peer.disconnectTimer = setTimeout(() => {
          if (pc.connectionState === 'disconnected') pc.restartIce();
        }, 4000);
      }
    };

    if (initiator) {
      // Creating transceivers (with whatever tracks we have now) triggers the first offer.
      // Always create both so a user without a camera/mic can still receive media.
      (['audio', 'video'] as const).forEach(kind => {
        const track = currentTrack(kind);
        if (track) pc.addTransceiver(track, { direction: 'sendrecv' });
        else pc.addTransceiver(kind, { direction: 'sendrecv' });
      });
    }
    return peer;
  }, [clientId, send, publishRemoteStreams]);

  const isHealthy = (peer: Peer) =>
    !['failed', 'closed'].includes(peer.pc.connectionState) && peer.pc.signalingState !== 'closed';

  const enqueue = (peer: Peer, task: () => Promise<void>) => {
    peer.chain = peer.chain.then(task).catch(err => console.warn('Signaling error', err));
  };

  const handleDescription = useCallback((from: string, type: 'offer' | 'answer', sdp: string) => {
    let peer = peersRef.current.get(from);
    if (!peer) {
      if (type !== 'offer') return;
      peer = createPeer(from, false);
    }
    const p = peer;
    enqueue(p, async () => {
      const { pc } = p;
      if (type === 'answer' && pc.signalingState !== 'have-local-offer') return; // stale answer
      const collision = type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
      p.ignoreOffer = !p.polite && collision;
      if (p.ignoreOffer) return;

      await pc.setRemoteDescription({ type, sdp }); // a polite peer rolls back its own offer implicitly
      for (const candidate of p.pendingCandidates.splice(0)) {
        try { await pc.addIceCandidate(candidate); } catch (err) { console.warn('Queued ICE candidate rejected', err); }
      }
      if (type === 'offer') {
        await attachLocalTracks(p);
        await pc.setLocalDescription();
        const d = pc.localDescription;
        if (d) send({ type: 'answer', to: from, sdp: d.sdp });
      }
    });
  }, [createPeer, attachLocalTracks, send]);

  const handleCandidate = useCallback((from: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(from);
    if (!peer) return;
    enqueue(peer, async () => {
      if (!peer.pc.remoteDescription) { peer.pendingCandidates.push(candidate); return; }
      try { await peer.pc.addIceCandidate(candidate); }
      catch (err) { if (!peer.ignoreOffer) console.warn('ICE candidate rejected', err); }
    });
  }, []);

  // ─── Incoming socket messages ────────────────────────────────────────────────

  const mergeParticipant = (list: RemoteParticipant[], incoming: Partial<RemoteParticipant> & { client_id: string }) => {
    const exists = list.some(p => p.client_id === incoming.client_id);
    if (!exists) {
      return [...list, {
        id: null, display_name: 'Guest', is_host: false, is_muted: false, camera_enabled: false, ...incoming,
      } as RemoteParticipant];
    }
    return list.map(p => (p.client_id === incoming.client_id ? { ...p, ...incoming } : p));
  };

  const handleMessage = useCallback((data: Record<string, unknown>) => {
    switch (data.type) {
      case 'waiting':
        setStatus('waiting');
        break;
      case 'joined': {
        // Authoritative roster: also runs after every reconnect.
        const roster = (data.participants as RemoteParticipant[]) ?? [];
        setSelf((data.you as { is_host: boolean; is_cohost: boolean }) ?? { is_host: false, is_cohost: false });
        setRoomState((data.state as RoomState) ?? { locked: false, waiting_room: false });
        callbacks.current.onChatHistory?.((data.chat_history as ChatEvent[]) ?? []);
        setRemoteParticipants(roster);
        const ids = new Set(roster.map(p => p.client_id));
        peersRef.current.forEach((_, id) => { if (!ids.has(id)) closePeer(id); });
        for (const p of roster) {
          const existing = peersRef.current.get(p.client_id);
          if (existing && isHealthy(existing)) continue;
          if (existing) closePeer(p.client_id);
          createPeer(p.client_id, true); // we are the newcomer: we place the call
        }
        publishRemoteStreams();
        setStatus('connected');
        break;
      }
      case 'participant_joined': {
        const p = data.participant as RemoteParticipant;
        if (!p || p.client_id === clientId) break;
        setRemoteParticipants(prev => mergeParticipant(prev, p));
        // They will call us; if we still hold a dead connection from a previous session, drop it.
        const existing = peersRef.current.get(p.client_id);
        if (existing && !isHealthy(existing)) closePeer(p.client_id);
        break;
      }
      case 'participant_updated': {
        const p = data.participant as Partial<RemoteParticipant> & { client_id: string };
        if (p?.client_id === clientId) {
          // Changes made to us by someone else: promotion to co-host, hand lowered by a host.
          if (typeof p.is_cohost === 'boolean') setSelf(prev => ({ ...prev, is_cohost: p.is_cohost! }));
          if (p.hand_raised === false) { handRaisedRef.current = false; setHandRaisedState(false); }
        } else if (p?.client_id) {
          setRemoteParticipants(prev => mergeParticipant(prev, p));
        }
        break;
      }
      case 'meeting_state':
        setRoomState(data.state as RoomState);
        break;
      case 'waiting_list': {
        const list = (data.participants as WaitingGuest[]) ?? [];
        setWaitingList(prev => {
          list.filter(g => !prev.some(p => p.client_id === g.client_id)).forEach(g => callbacks.current.onWaitingGuest?.(g));
          return list;
        });
        break;
      }
      case 'reaction':
        callbacks.current.onReaction?.(data.client_id as string, data.emoji as string);
        break;
      case 'caption':
        callbacks.current.onCaption?.(data.client_id as string, data.sender as string, data.text as string, !!data.final);
        break;
      case 'participant_left': {
        const id = data.client_id as string;
        setRemoteParticipants(prev => prev.filter(p => p.client_id !== id));
        closePeer(id);
        break;
      }
      case 'offer':
      case 'answer':
        handleDescription(data.from as string, data.type, data.sdp as string);
        break;
      case 'ice_candidate':
        handleCandidate(data.from as string, data.candidate as RTCIceCandidateInit);
        break;
      case 'chat_message':
        callbacks.current.onChatMessage?.(data as unknown as ChatEvent);
        break;
      case 'force_mute':
        callbacks.current.onForceMute?.();
        break;
      case 'meeting_ended':
        callbacks.current.onMeetingEnded?.('ended');
        break;
    }
  }, [clientId, closePeer, createPeer, handleDescription, handleCandidate, publishRemoteStreams]);

  // ─── WebSocket lifecycle with reconnection ───────────────────────────────────

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let lastMessageAt = Date.now();

    const stopTimers = () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS) + Math.random() * 500;
      attempt += 1;
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
    };

    function connect() {
      if (disposed) return;
      if (attempt > 0) setStatus('reconnecting');
      const ws = new WebSocket(getMeetingSocketUrl(meetingId, clientId, ticket));
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        lastMessageAt = Date.now();
        const l = latest.current;
        // Identity and role come from the signed ticket; we only report our media state.
        ws.send(JSON.stringify({
          type: 'join',
          is_muted: !l.isAudioEnabled,
          camera_enabled: l.isVideoEnabled,
          is_screen_sharing: !!screenTrackRef.current,
        }));
        stopTimers();
        pingTimer = setInterval(() => {
          if (Date.now() - lastMessageAt > STALE_AFTER_MS) { ws.close(); return; }
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        lastMessageAt = Date.now();
        let data: Record<string, unknown>;
        try { data = JSON.parse(event.data); } catch { return; }
        handleMessage(data);
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return; // superseded
        wsRef.current = null;
        stopTimers();
        if (disposed) return;
        const terminal: Record<number, EndReason> = {
          [CLOSE_ENDED]: 'ended', [CLOSE_REMOVED]: 'removed', [CLOSE_NOT_FOUND]: 'not_found',
          [CLOSE_DENIED]: 'denied', [CLOSE_UNAUTHORIZED]: 'unauthorized',
        };
        const reason = terminal[event.code];
        if (reason) {
          disposed = true;
          callbacks.current.onMeetingEnded?.(reason);
          return;
        }
        setStatus('reconnecting');
        scheduleReconnect();
      };

      ws.onerror = () => { /* onclose follows and drives reconnection */ };
    }

    const reconnectNow = () => {
      if (disposed) return;
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      attempt = 0;
      connect();
    };
    const onVisible = () => { if (!document.hidden) reconnectNow(); };
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', onVisible);

    loadIceServers().then(servers => {
      iceServersRef.current = servers;
      if (!disposed) connect();
    });

    const peers = peersRef.current;
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopTimers();
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', onVisible);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' }));
        ws.close();
      }
      Array.from(peers.keys()).forEach(closePeer);
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
    };
    // The connection is tied to the meeting + this page's identity only; everything else flows via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, clientId, ticket]);

  // ─── Keep peers in sync with local state ─────────────────────────────────────

  // Mic / camera state → everyone else
  useEffect(() => {
    send({ type: 'update', is_muted: !isAudioEnabled, camera_enabled: isVideoEnabled });
  }, [isAudioEnabled, isVideoEnabled, send]);

  // A new local stream (e.g. permission granted after a retry) → swap tracks on all peers
  useEffect(() => {
    peersRef.current.forEach(peer => { attachLocalTracks(peer); });
  }, [localStream, attachLocalTracks]);

  // ─── Screen sharing ──────────────────────────────────────────────────────────

  const stopScreenShare = useCallback(async () => {
    const track = screenTrackRef.current;
    if (!track) return;
    screenTrackRef.current = null;
    track.onended = null;
    track.stop();
    setLocalScreenStream(null);
    await Promise.all(Array.from(peersRef.current.values()).map(attachLocalTracks));
    send({ type: 'update', is_screen_sharing: false });
  }, [attachLocalTracks, send]);

  const startScreenShare = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (screenTrackRef.current) return { ok: true };
    if (!navigator.mediaDevices?.getDisplayMedia) {
      return { ok: false, error: 'Screen sharing is not supported on this device or browser.' };
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      screenTrackRef.current = track;
      track.onended = () => { void stopScreenShare(); }; // browser's own "Stop sharing" button
      setLocalScreenStream(stream);
      await Promise.all(Array.from(peersRef.current.values()).map(attachLocalTracks));
      send({ type: 'update', is_screen_sharing: true });
      return { ok: true };
    } catch (err) {
      if ((err as { name?: string })?.name === 'NotAllowedError') return { ok: false }; // user cancelled the picker
      return { ok: false, error: 'Could not start screen sharing.' };
    }
  }, [attachLocalTracks, send, stopScreenShare]);

  // ─── Public API ──────────────────────────────────────────────────────────────

  const sendChat = useCallback(
    (text: string, opts?: { to?: string; attachment?: { name: string; size: number; url: string } }) =>
      send({ type: 'chat_message', text, ...(opts?.to ? { to: opts.to } : {}), ...(opts?.attachment ? { attachment: opts.attachment } : {}) }),
    [send],
  );

  const setHandRaised = useCallback((raised: boolean) => {
    handRaisedRef.current = raised;
    setHandRaisedState(raised);
    send({ type: 'update', hand_raised: raised });
  }, [send]);

  const sendReaction = useCallback((emoji: string) => send({ type: 'reaction', emoji }), [send]);
  const sendCaption = useCallback((text: string, final: boolean) => send({ type: 'caption', text, final }), [send]);

  // Moderation (host and co-hosts; the server re-checks every one of these)
  const moderation = {
    admit: (id: string) => send({ type: 'admit', client_id: id }),
    deny: (id: string) => send({ type: 'deny', client_id: id }),
    admitAll: () => send({ type: 'admit_all' }),
    mutePeer: (id: string) => send({ type: 'mute_peer', client_id: id }),
    muteAll: () => send({ type: 'mute_all' }),
    remove: (id: string) => send({ type: 'remove', client_id: id }),
    lowerHand: (id: string) => send({ type: 'lower_hand', client_id: id }),
    setLock: (locked: boolean) => send({ type: 'set_lock', locked }),
    setWaitingRoom: (enabled: boolean) => send({ type: 'set_waiting_room', enabled }),
    makeCohost: (id: string, value: boolean) => send({ type: 'make_cohost', client_id: id, value }),
  };

  const leave = useCallback(() => {
    send({ type: 'leave' });
  }, [send]);

  const screenSharer = remoteParticipants.find(p => p.is_screen_sharing) ?? null;

  return {
    remoteParticipants,
    remoteStreams,
    screenSharer,
    localScreenStream,
    status,
    isConnected: status === 'connected',
    roomState,
    waitingList,
    self,
    handRaised,
    setHandRaised,
    sendReaction,
    sendCaption,
    moderation,
    startScreenShare,
    stopScreenShare,
    sendChat,
    leave,
  };
}
