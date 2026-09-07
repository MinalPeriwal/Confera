import { useState, useEffect, useRef, useCallback } from 'react';

export interface RemoteParticipant {
  id: string | number;
  display_name: string;
  is_host: boolean;
  is_muted: boolean;
  camera_enabled: boolean;
}

export function useWebSockets(meetingId: string, onConnect?: () => void) {
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current || wsRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/meetings/${meetingId}`);

      ws.onopen = () => {
        setIsConnected(true);
        if (onConnectRef.current) onConnectRef.current();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'participant_joined') {
            setRemoteParticipants(prev => {
              if (prev.find(p => p.id === data.participant.id)) return prev;
              return [...prev, data.participant];
            });
          } else if (data.type === 'participant_left') {
            setRemoteParticipants(prev => prev.filter(p => p.id !== data.participant_id));
          } else if (data.type === 'participant_updated') {
            setRemoteParticipants(prev => prev.map(p =>
              p.id === data.participant.id ? { ...p, ...data.participant } : p
            ));
          }
        } catch (err) {
          console.error('Failed to parse websocket message', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (!unmountedRef.current) {
          setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => ws.close();
      wsRef.current = ws;
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [meetingId]);

  const sendMessage = useCallback((message: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { remoteParticipants, isConnected, sendMessage };
}
