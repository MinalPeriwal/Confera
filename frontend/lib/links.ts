/** Public origin of the web app. Set NEXT_PUBLIC_APP_URL when the app is served behind a different public URL. */
export function getAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** Absolute, shareable link for a meeting. Never use the stored relative `join_url`. */
export function buildMeetingLink(meetingId: string): string {
  return `${getAppOrigin()}/meeting/${meetingId.replace(/\s/g, '')}`;
}

export function formatMeetingId(meetingId: string): string {
  return meetingId.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
}

/** Accepts a bare/spaced meeting ID or a full meeting link and returns the digits, or null. */
export function parseMeetingId(input: string): string | null {
  const value = input.trim();
  const fromLink = value.match(/\/meeting\/(\d+)/);
  const digits = (fromLink ? fromLink[1] : value).replace(/[\s-]/g, '');
  return /^\d{6,}$/.test(digits) ? digits : null;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for insecure contexts / older browsers
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}
