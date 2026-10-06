import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Mic, Video, Volume2, Sparkles, Loader2 } from 'lucide-react';
import { MediaController } from '@/hooks/useMediaStream';
import { useAudioLevel } from '@/hooks/useAudioLevel';

interface DeviceSettingsProps {
  media: MediaController;
  onClose: () => void;
  /** Dark theme inside the call, light in the lobby. */
  dark?: boolean;
}

const supportsSinkId = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

function playTestTone(sinkId: string) {
  const audio = new Audio();
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 523;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
  osc.connect(gain).connect(dest);
  audio.srcObject = dest.stream;
  const withSink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  const start = async () => {
    try { if (sinkId && withSink.setSinkId) await withSink.setSinkId(sinkId); } catch { /* fall back to default output */ }
    await audio.play();
    osc.start();
    osc.stop(ctx.currentTime + 1);
    setTimeout(() => { void ctx.close(); }, 1200);
  };
  void start();
}

export function DeviceSettings({ media, onClose, dark }: DeviceSettingsProps) {
  const [busy, setBusy] = useState(false);
  const level = useAudioLevel(media.stream, media.isAudioEnabled);
  const { cameras, mics, speakers } = media.devices;

  const change = async (kind: 'video' | 'audio', id: string) => {
    setBusy(true);
    try { await media.switchDevice(kind, id); }
    catch { toast.error(`Could not switch ${kind === 'video' ? 'camera' : 'microphone'}`); }
    finally { setBusy(false); }
  };

  const label = (d: MediaDeviceInfo, i: number, fallback: string) => d.label || `${fallback} ${i + 1}`;
  const select = `w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    dark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
  }`;
  const labelCls = `flex items-center gap-2 text-sm font-medium mb-1.5 ${dark ? 'text-slate-300' : 'text-slate-700'}`;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-label="Audio and video settings" data-testid="device-settings">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl ${dark ? 'bg-slate-900 text-slate-100 border border-slate-700' : 'bg-white text-slate-900'}`}>
        <div className={`flex items-center justify-between p-5 border-b ${dark ? 'border-slate-800' : 'border-slate-100'}`}>
          <h2 className="text-lg font-semibold">Audio &amp; video settings</h2>
          <button onClick={onClose} aria-label="Close settings" className={`p-2 rounded-full ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className={labelCls} htmlFor="camera-select"><Video className="w-4 h-4" /> Camera</label>
            {cameras.length === 0 ? (
              <p className="text-sm text-slate-500">No camera detected.</p>
            ) : (
              <select id="camera-select" data-testid="camera-select" className={select} value={media.cameraId} disabled={busy}
                onChange={(e) => void change('video', e.target.value)}>
                {cameras.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, 'Camera')}</option>)}
              </select>
            )}
          </div>

          {media.hasCamera && (
            <div className="flex items-center justify-between gap-3">
              <span className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
                {media.blur === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Blur my background
              </span>
              <button
                role="switch"
                aria-checked={media.blur === 'on'}
                data-testid="blur-toggle"
                data-blur={media.blur}
                disabled={media.blur === 'loading'}
                onClick={() => {
                  media.setBlur(media.blur !== 'on').catch(() => toast.error('Background blur is not available on this device'));
                }}
                className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-60 ${media.blur === 'on' ? 'bg-blue-600' : 'bg-slate-500'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${media.blur === 'on' ? 'translate-x-4' : ''}`} />
              </button>
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="mic-select"><Mic className="w-4 h-4" /> Microphone</label>
            {mics.length === 0 ? (
              <p className="text-sm text-slate-500">No microphone detected.</p>
            ) : (
              <>
                <select id="mic-select" data-testid="mic-select" className={select} value={media.micId} disabled={busy}
                  onChange={(e) => void change('audio', e.target.value)}>
                  {mics.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, 'Microphone')}</option>)}
                </select>
                <div className={`mt-2 h-2 rounded-full overflow-hidden ${dark ? 'bg-slate-800' : 'bg-slate-100'}`} aria-label="Microphone level">
                  <div className="h-full bg-green-500 transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} data-testid="mic-level" />
                </div>
                <p className="text-xs text-slate-500 mt-1">Speak to test: the bar should move.</p>
              </>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="speaker-select"><Volume2 className="w-4 h-4" /> Speaker</label>
            {!supportsSinkId() ? (
              <p className="text-sm text-slate-500">Your browser uses the system default speaker.</p>
            ) : speakers.length === 0 ? (
              <p className="text-sm text-slate-500">No speaker selection available.</p>
            ) : (
              <div className="flex gap-2">
                <select id="speaker-select" data-testid="speaker-select" className={select} value={media.speakerId}
                  onChange={(e) => media.setSpeaker(e.target.value)}>
                  <option value="">System default</option>
                  {speakers.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, 'Speaker')}</option>)}
                </select>
                <button onClick={() => playTestTone(media.speakerId)}
                  className="px-3 rounded-lg border border-blue-500 text-blue-500 text-sm font-medium hover:bg-blue-500/10 whitespace-nowrap">
                  Test
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={`p-5 border-t flex justify-end ${dark ? 'border-slate-800' : 'border-slate-100'}`}>
          <button onClick={onClose} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg">Done</button>
        </div>
      </div>
    </div>
  );
}
