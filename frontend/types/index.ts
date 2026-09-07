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
}
