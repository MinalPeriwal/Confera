import { useState, useEffect, useRef, useCallback } from 'react';

export interface RemoteParticipant {
  id: string | number;
  client_id: string;
  display_name: string;
  is_host: boolean;
  is_muted: boolean;
  camera_enabled: boolean;
  is_screen_sharing?: boolean;
}

interface UseWebRTCOptions {
  meetingId: string;
  clientId: string;
  participantId: number;
  displayName: string;
  isHost: boolean;
  localStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  onMeetingEnded?: () => void;
  onEndMeeting?: () => Promise<void>; // REST call to mark meeting ended in DB
  onChatMessage?: (message: { sender: string; text: string; timestamp: string }) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

if (process.env.NEXT_PUBLIC_TURN_URL) {
  ICE_SERVERS.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  });
}

export function useWebRTC({
  meetingId,
  clientId,
  participantId,
  displayName,
  isHost,
  localStream,
  isAudioEnabled,
  isVideoEnabled,
  onMeetingEnded,
  onEndMeeting,
  onChatMessage,
}: UseWebRTCOptions) {
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  // screen_client_id of whoever is sharing, plus their stream
  const [screenShareState, setScreenShareState] = useState<{
    clientId: string;
    name: string;
    stream: MediaStream;
  } | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const screenSendersRef = useRef<Map<string, RTCRtpSender>>(new Map()); // peerId -> sender holding video track
  const unmountedRef = useRef(false);
  const onMeetingEndedRef = useRef(onMeetingEnded);
  onMeetingEndedRef.current = onMeetingEnded;
  const onEndMeetingRef = useRef(onEndMeeting);
  onEndMeetingRef.current = onEndMeeting;
  const onChatMessageRef = useRef(onChatMessage);
  onChatMessageRef.current = onChatMessage;
  const localStreamRef = useRef(localStream);
  localStreamRef.current = localStream;

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const sendWs = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...message, client_id: clientId }));
    }
  }, [clientId]);

  const updateRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    setRemoteStreams(prev => { const n = new Map(prev); n.set(peerId, stream); return n; });
  }, []);

  const removeRemoteStream = useCallback((peerId: string) => {
    setRemoteStreams(prev => { const n = new Map(prev); n.delete(peerId); return n; });
  }, []);

  // ─── RTCPeerConnection factory ────────────────────────────────────────────────

  const createPeerConnection = useCallback((remotePeerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        const sender = pc.addTrack(track, localStreamRef.current!);
        // Store video senders so we can replace tracks for screen share
        if (track.kind === 'video') {
          screenSendersRef.current.set(remotePeerId, sender);
        }
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWs({ type: 'ice_candidate', to: remotePeerId, from: clientId, candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;

      // Distinguish screen-share tracks from camera tracks by label prefix we set on sender side
      // We rely on a dedicated stream per track kind; if it's a screen track we'll get notified
      // via 'screen_share_started' WS message before this fires — just update the stream map.
      updateRemoteStream(remotePeerId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removeRemoteStream(remotePeerId);
      }
    };

    peerConnections.current.set(remotePeerId, pc);
    return pc;
  }, [clientId, sendWs, updateRemoteStream, removeRemoteStream]);

  const closePeerConnection = useCallback((peerId: string) => {
    const pc = peerConnections.current.get(peerId);
    if (pc) {
      pc.ontrack = null; pc.onicecandidate = null; pc.onconnectionstatechange = null;
      pc.close();
      peerConnections.current.delete(peerId);
    }
    screenSendersRef.current.delete(peerId);
    removeRemoteStream(peerId);
  }, [removeRemoteStream]);

  // ─── Screen share: replace video track on all peer connections ────────────────

  const startScreenShare = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenVideoTrack = screenStream.getVideoTracks()[0];

      // Replace the video track on every existing peer connection
      for (const [peerId, pc] of peerConnections.current) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenVideoTrack);
          screenSendersRef.current.set(peerId, sender);
        }
      }

      // When the OS "Stop sharing" button is clicked
      screenVideoTrack.onended = () => stopScreenShare(screenStream);

      // Notify peers we're screen sharing
      sendWs({ type: 'screen_share_started', from: clientId, display_name: displayName });

      return screenStream;
    } catch (err) {
      console.error('Screen share error', err);
      return null;
    }
  }, [clientId, displayName, sendWs]);

  const stopScreenShare = useCallback(async (screenStream?: MediaStream) => {
    // Stop screen tracks
    screenStream?.getTracks().forEach(t => t.stop());

    // Swap back to webcam video track on all peer connections
    const camTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    for (const pc of peerConnections.current.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(camTrack);
    }

    sendWs({ type: 'screen_share_stopped', from: clientId });
    setScreenShareState(null);
  }, [clientId, sendWs]);

  // ─── Signaling ────────────────────────────────────────────────────────────────

  const handleOffer = useCallback(async (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
    let pc = peerConnections.current.get(data.from);
    if (!pc) pc = createPeerConnection(data.from);
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendWs({ type: 'answer', to: data.from, from: clientId, sdp: pc.localDescription });
  }, [clientId, createPeerConnection, sendWs]);

  const handleAnswer = useCallback(async (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
    const pc = peerConnections.current.get(data.from);
    if (pc && pc.signalingState !== 'stable') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
  }, []);

  const handleIceCandidate = useCallback(async (data: { from: string; candidate: RTCIceCandidateInit }) => {
    const pc = peerConnections.current.get(data.from);
    if (pc) {
      try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); }
      catch (e) { console.warn('ICE candidate error', e); }
    }
  }, []);

  const initiateCallTo = useCallback(async (remotePeerId: string) => {
    if (peerConnections.current.has(remotePeerId)) return;
    const pc = createPeerConnection(remotePeerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendWs({ type: 'offer', to: remotePeerId, from: clientId, sdp: pc.localDescription });
  }, [clientId, createPeerConnection, sendWs]);

  // ─── WebSocket lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current || wsRef.current) return;
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      let wsUrl: string;
      if (backendUrl) {
        // Remove trailing slash if present
        const cleanBackendUrl = backendUrl.replace(/\/$/, '');
        // Force wss:// if the current page is HTTPS to prevent Mixed Content errors
        const isHttps = window.location.protocol === 'https:';
        wsUrl = cleanBackendUrl.replace(/^https?:\/\//, isHttps ? 'wss://' : 'ws://') + `/ws/meetings/${meetingId}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws/meetings/${meetingId}`;
      }
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({
          type: 'participant_joined',
          client_id: clientId,
          participant: {
            id: participantId, client_id: clientId, display_name: displayName,
            is_host: isHost, is_muted: !isAudioEnabled, camera_enabled: isVideoEnabled,
          },
        }));
      };

      ws.onmessage = async (event) => {
        let data: Record<string, unknown>;
        try { data = JSON.parse(event.data); } catch { return; }
        const type = data.type as string;

        if (type === 'participant_joined') {
          const p = data.participant as RemoteParticipant;
          if (!p || p.client_id === clientId) return;
          setRemoteParticipants(prev => prev.find(x => x.client_id === p.client_id) ? prev : [...prev, p]);
          await initiateCallTo(p.client_id);

        } else if (type === 'participant_left') {
          const pid = data.participant_id as string | number;
          setRemoteParticipants(prev => {
            const leaving = prev.find(p => p.id === pid);
            if (leaving) closePeerConnection(leaving.client_id);
            return prev.filter(p => p.id !== pid);
          });

        } else if (type === 'participant_updated') {
          const updated = data.participant as Partial<RemoteParticipant>;
          setRemoteParticipants(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));

        } else if (type === 'offer') {
          await handleOffer(data as { from: string; sdp: RTCSessionDescriptionInit });
        } else if (type === 'answer') {
          await handleAnswer(data as { from: string; sdp: RTCSessionDescriptionInit });
        } else if (type === 'ice_candidate') {
          await handleIceCandidate(data as { from: string; candidate: RTCIceCandidateInit });

        } else if (type === 'screen_share_started') {
          const sharingClientId = data.from as string;
          const sharingName = data.display_name as string;
          // Mark that participant as screen sharing
          setRemoteParticipants(prev => prev.map(p =>
            p.client_id === sharingClientId ? { ...p, is_screen_sharing: true } : p
          ));
          // The actual stream will arrive via ontrack; listen for it
          // We store it once it arrives in a separate effect keyed on is_screen_sharing
          setScreenShareState(prev => {
            // Optimistically set — stream will be populated via remoteStreams once ontrack fires
            const stream = remoteStreams.get(sharingClientId);
            if (stream) return { clientId: sharingClientId, name: sharingName, stream };
            return prev; // will be set once stream arrives
          });
          // Store pending info so ontrack can finish it
          pendingScreenShareRef.current = { clientId: sharingClientId, name: sharingName };

        } else if (type === 'screen_share_stopped') {
          const sharingClientId = data.from as string;
          setRemoteParticipants(prev => prev.map(p =>
            p.client_id === sharingClientId ? { ...p, is_screen_sharing: false } : p
          ));
          setScreenShareState(null);
          pendingScreenShareRef.current = null;

        } else if (type === 'meeting_ended') {
          onMeetingEndedRef.current?.();
        } else if (type === 'chat_message') {
          onChatMessageRef.current?.({
            sender: data.sender as string,
            text: data.text as string,
            timestamp: data.timestamp as string,
          });
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (!unmountedRef.current) setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      wsRef.current = ws;
    }

    connect();

    return () => {
      unmountedRef.current = true;
      peerConnections.current.forEach((_, peerId) => closePeerConnection(peerId));
      peerConnections.current.clear();
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // Ref for pending screen share (so ontrack can complete the state)
  const pendingScreenShareRef = useRef<{ clientId: string; name: string } | null>(null);

  // When a remote stream arrives (ontrack), check if it belongs to an active screen sharer
  useEffect(() => {
    const pending = pendingScreenShareRef.current;
    if (!pending) return;
    const stream = remoteStreams.get(pending.clientId);
    if (stream) {
      setScreenShareState({ clientId: pending.clientId, name: pending.name, stream });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStreams]);

  // ─── Mute sync ────────────────────────────────────────────────────────────────

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = isAudioEnabled; });
  }, [isAudioEnabled]);

  useEffect(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = isVideoEnabled; });
  }, [isVideoEnabled]);

  // ─── End meeting (host only) ──────────────────────────────────────────────────

  const endMeetingForAll = useCallback(async () => {
    sendWs({ type: 'meeting_ended' });
    try { await onEndMeetingRef.current?.(); } catch (e) { console.warn('Failed to mark meeting ended', e); }
    onMeetingEndedRef.current?.();
  }, [sendWs]);

  // ─── Public API ───────────────────────────────────────────────────────────────

  const sendMessage = useCallback((message: object) => sendWs(message), [sendWs]);

  return {
    remoteParticipants,
    remoteStreams,
    screenShareState,   // {clientId, name, stream} | null — remote screen share
    isConnected,
    sendMessage,
    startScreenShare,
    stopScreenShare,
    endMeetingForAll,
  };
}
