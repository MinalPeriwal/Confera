import { Meeting, MeetingCreatePayload } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

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
    try {
      const data = await response.json();
      errorBody = data.detail || JSON.stringify(data);
    } catch {
      errorBody = await response.text();
    }
    throw new Error(`API error: ${response.status} ${response.statusText} - ${errorBody}`);
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

    getUpcomingMeetings: () => call<Meeting[]>('/meetings/upcoming'),

    getRecentMeetings: () => call<Meeting[]>('/meetings/recent'),

    createMeeting: (data: MeetingCreatePayload) =>
      call<Meeting>('/meetings', { method: 'POST', body: JSON.stringify(data) }),

    getMeeting: (meetingId: string) =>
      call<Meeting>(`/meetings/${meetingId}`),

    joinMeeting: (meetingId: string, data: { display_name: string; is_host?: boolean }) =>
      call<{ participant_id: number; meeting: Meeting }>(`/meetings/${meetingId}/join`, {
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

    endMeeting: (meetingId: string) =>
      call<Meeting>(`/meetings/${meetingId}/end`, { method: 'PATCH' }),
  };
}

// Unauthenticated instance for public endpoints (e.g. getMeeting for join page)
export const api = createApi(null);
