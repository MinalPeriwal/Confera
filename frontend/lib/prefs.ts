/** Per-browser meeting preferences, shared by the Settings page and the meeting room. */
export interface MeetingPrefs {
  cameraId?: string;
  micId?: string;
  speakerId?: string;
  /** Apply background blur when the camera starts */
  blur?: boolean;
  /** Join with the microphone muted */
  joinMuted?: boolean;
  /** Join with the camera off */
  joinCameraOff?: boolean;
}

const PREFS_KEY = 'confera:devices';

export function readPrefs(): MeetingPrefs {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
}

export function writePrefs(patch: MeetingPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch })); } catch { /* storage unavailable */ }
}
