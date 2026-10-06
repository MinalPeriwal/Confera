// Shared helpers for the browser e2e tests (see README: "Tests").
import { chromium } from 'playwright-core';
import fs from 'node:fs';

export const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
export const HEADED = process.env.HEADED === '1';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
export const executablePath = CANDIDATES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(2); }

export const launchArgs = [
  '--use-fake-device-for-media-stream',   // synthetic microphone (beeps)
  '--use-fake-ui-for-media-stream',       // auto-accept camera/mic/screen-share prompts
  '--auto-select-desktop-capture-source=Entire screen',
  '--autoplay-policy=no-user-gesture-required',
];

// Runs in every page before the app loads: registers RTCPeerConnections (for real WebRTC stats) and
// replaces the camera with an animated canvas, because some Chrome builds ship a broken fake camera.
export const initScript = (syntheticCamera) => {
  const Orig = window.RTCPeerConnection;
  window.__pcs = [];
  window.RTCPeerConnection = function (...args) {
    const pc = new Orig(...args);
    window.__pcs.push(pc);
    return pc;
  };
  window.RTCPeerConnection.prototype = Orig.prototype;

  if (!syntheticCamera || !navigator.mediaDevices) return;
  const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const makeCameraTrack = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d');
    let x = 0;
    setInterval(() => {
      x = (x + 8) % canvas.width;
      ctx.fillStyle = '#1e3a8a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(x, 140, 80, 80);
    }, 40);
    return canvas.captureStream(25).getVideoTracks()[0];
  };
  navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
    const stream = constraints.audio ? await realGetUserMedia({ audio: constraints.audio }) : new MediaStream();
    if (constraints.video) stream.addTrack(makeCameraTrack());
    return stream;
  };
};

export const users = {};
export async function newUser(name, { viewport, hostTicket } = {}) {
  const browser = await chromium.launch({ executablePath, headless: !HEADED, args: launchArgs });
  const context = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: viewport ?? { width: 1280, height: 800 } });
  await context.addInitScript(initScript, process.env.SYNTHETIC_CAMERA !== '0');
  if (hostTicket) {
    // Act as the meeting host without a Clerk login: swap the join response's credential for a
    // host-role ticket minted by e2e/create_meeting.py with the server's own signing code.
    await context.route('**/api/meetings/*/join', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.ticket = hostTicket;
      body.is_host = true;
      await route.fulfill({ response, json: body });
    });
  }
  const page = await context.newPage();
  const logs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  users[name] = { name, browser, context, page, logs };
  return users[name];
}

export async function closeAll() {
  await Promise.all(Object.values(users).map(u => u.browser.close().catch(() => {})));
}

export let failures = 0;
export const step = async (name, fn) => {
  const t = Date.now();
  try { await fn(); console.log(`  PASS  ${name} (${Date.now() - t}ms)`); }
  catch (err) {
    failures++;
    const msg = String(err.message || err);
    console.log(`  FAIL  ${name}\n        ${process.env.VERBOSE ? msg.replace(/\n/g, '\n        ') : msg.split('\n')[0]}`);
  }
};

/** Remote tile for `ofName` as seen by `viewer`: video frames decoded AND audio energy received. */
export async function expectMediaFrom(viewer, ofName, { audio = true, timeout = 25_000 } = {}) {
  const tile = viewer.page.locator(`[data-testid=tile-remote][data-name="${ofName}"]`);
  await tile.waitFor({ timeout });
  await viewer.page.waitForFunction((name) => {
    const v = document.querySelector(`[data-testid=tile-remote][data-name="${name}"] video`);
    return !!v && v.videoWidth > 0 && v.readyState >= 2;
  }, ofName, { timeout });
  if (!audio) return;
  const energy = await viewer.page.evaluate(async (name) => {
    const v = document.querySelector(`[data-testid=tile-remote][data-name="${name}"] video`);
    const track = v?.srcObject?.getAudioTracks()[0];
    if (!track) return -1;
    const deadline = Date.now() + 8000;
    let best = 0;
    while (Date.now() < deadline) {
      for (const pc of window.__pcs) {
        const stats = await pc.getStats();
        stats.forEach(s => {
          if (s.type === 'inbound-rtp' && s.kind === 'audio' && s.trackIdentifier === track.id) {
            best = Math.max(best, s.totalAudioEnergy ?? 0, s.bytesReceived > 2000 ? 0.0001 : 0);
          }
        });
      }
      if (best > 0 && !track.muted) return best;
      await new Promise(r => setTimeout(r, 250));
    }
    return best;
  }, ofName);
  if (!(energy > 0)) throw new Error(`no audio received from ${ofName} by ${viewer.name} (energy=${energy})`);
}
