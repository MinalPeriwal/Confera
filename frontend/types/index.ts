export interface User {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Participant {
  id: number;
  meeting_id: number;
  display_name: string;
  is_host: boolean;
  is_muted: boolean;
  camera_enabled: boolean;
  joined_at: string;
  left_at: string | null;
}

export interface Meeting {
  id: number;
  meeting_id: string;
  title: string;
  description: string | null;
  host_id: number;
  host_name: string;
  host_clerk_id?: string;
  waiting_room: boolean;
  locked: boolean;
  has_passcode: boolean;
  scheduled_at: string | null;
  duration_minutes: number;
  join_url: string;
  status: 'scheduled' | 'active' | 'ended';
  created_at: string;
  participants: Participant[];
}

export interface MeetingCreatePayload {
  title?: string;
  description?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  instant?: boolean;
  host_name?: string;
  passcode?: string;
  waiting_room?: boolean;
}

export interface MeetingSettingsPayload {
  waiting_room?: boolean;
  locked?: boolean;
  passcode?: string;
  clear_passcode?: boolean;
}

export interface JoinResponse {
  participant_id: number;
  meeting: Meeting;
  is_host: boolean;
  /** Signed credential required to open the meeting WebSocket and upload files. */
  ticket: string;
}

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  url: string;
}
