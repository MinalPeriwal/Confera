import { JoinResponse, Meeting, MeetingCreatePayload, MeetingSettingsPayload, SharedFile } from '../types';

/** Backend origin (e.g. https://api.example.com). Empty means "same origin", i.e. behind a reverse proxy. */
export const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/+$/, '');
const API_BASE_URL = BACKEND_URL;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** WebSocket URL for a meeting room; wss:// automatically when the backend/page is https. */
export function getMeetingSocketUrl(meetingId: string, clientId: string, ticket: string): string {
  const base = BACKEND_URL || window.location.origin;
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/ws/meetings/${meetingId}?client_id=${encodeURIComponent(clientId)}&ticket=${encodeURIComponent(ticket)}`;
}

export async function fetchApi<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const url = `${API_BASE_URL}/api${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let errorBody = '';
    const textBody = await response.text();
    try {
      const data = JSON.parse(textBody);
      errorBody = data.detail || JSON.stringify(data);
    } catch {
      errorBody = textBody;
    }
    throw new ApiError(response.status, errorBody || response.statusText);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export function createApi(token?: string | null) {
  const call = <T = unknown>(endpoint: string, options: RequestInit = {}) =>
    fetchApi<T>(endpoint, options, token);

  return {
    getHealth: () => call('/health'),

    getIceServers: () => call<{ iceServers: RTCIceServer[]; hasTurn: boolean }>('/ice-servers'),

    getUpcomingMeetings: () => call<Meeting[]>('/meetings/upcoming'),

    getRecentMeetings: () => call<Meeting[]>('/meetings/recent'),

    createMeeting: (data: MeetingCreatePayload) =>
      call<Meeting>('/meetings', { method: 'POST', body: JSON.stringify(data) }),

    getMeeting: (meetingId: string) =>
      call<Meeting>(`/meetings/${meetingId}`),

    joinMeeting: (meetingId: string, data: { display_name: string; passcode?: string }) =>
      call<JoinResponse>(`/meetings/${meetingId}/join`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    leaveMeeting: (meetingId: string, participantId: number) =>
      call(`/meetings/${meetingId}/leave`, {
        method: 'POST',
        body: JSON.stringify({ participant_id: participantId }),
      }),

    getParticipants: (meetingId: string) =>
      call(`/meetings/${meetingId}/participants`),

    muteAll: (meetingId: string) =>
      call(`/meetings/${meetingId}/mute-all`, { method: 'POST' }),

    removeParticipant: (meetingId: string, participantId: number) =>
      call(`/meetings/${meetingId}/participants/${participantId}`, { method: 'DELETE' }),

    updateSettings: (meetingId: string, settings: MeetingSettingsPayload) =>
      call<Meeting>(`/meetings/${meetingId}/settings`, { method: 'PATCH', body: JSON.stringify(settings) }),

    endMeeting: (meetingId: string) =>
      call<Meeting>(`/meetings/${meetingId}/end`, { method: 'PATCH' }),

    deleteMeeting: (meetingId: string) =>
      call(`/meetings/${meetingId}`, { method: 'DELETE' }),
  };
}

// Unauthenticated instance for public endpoints (e.g. getMeeting for join page)
export const api = createApi(null);

/** Upload a file to share in the meeting chat. Authenticated by the join ticket. */
export async function uploadMeetingFile(meetingId: string, ticket: string, file: File): Promise<SharedFile> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/files`, {
    method: 'POST',
    headers: { 'X-Meeting-Ticket': ticket },
    body: form,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try { detail = (await response.json()).detail ?? detail; } catch { /* not JSON */ }
    throw new ApiError(response.status, detail);
  }
  return response.json();
}

export function absoluteFileUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
