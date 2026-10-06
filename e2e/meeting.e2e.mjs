// End-to-end meeting test: several isolated browser contexts (= separate incognito profiles) join the
// SAME meeting through its shareable link and exchange real audio/video over WebRTC.
//
//   APP_URL=https://your-app.vercel.app MEETING_ID=123456789 node meeting.e2e.mjs
//
// APP_URL     where the frontend is served (default: the local dev server)
// MEETING_ID  an existing, not-yet-ended meeting. Locally, create one with `python e2e/create_meeting.py`.
// CHROME_PATH path to Chrome/Chromium/Edge (auto-detected on Windows/macOS/Linux when omitted)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const MEETING_ID = process.env.MEETING_ID;
const HEADED = process.env.HEADED === '1';
const SHOTS = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

if (!MEETING_ID) {
  console.error('Set MEETING_ID to an existing meeting id (see header comment).');
  process.exit(2);
}

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find(p => fs.existsSync(p));
if (!executablePath) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(2); }

const LINK = `${APP_URL}/meeting/${MEETING_ID}`;
let failures = 0;
const step = async (name, fn) => {
  const t = Date.now();
  try { await fn(); console.log(`  PASS  ${name} (${Date.now() - t}ms)`); }
  catch (err) {
    failures++;
    const msg = String(err.message || err);
    console.log(`  FAIL  ${name}\n        ${process.env.VERBOSE ? msg.replace(/\n/g, '\n        ') : msg.split('\n')[0]}`);
  }
};

const launchArgs = [
  '--use-fake-device-for-media-stream',   // synthetic camera + beeping microphone
  '--use-fake-ui-for-media-stream',       // auto-accept camera/mic (and screen-share) prompts
  '--auto-select-desktop-capture-source=Entire screen',
  '--autoplay-policy=no-user-gesture-required',
];

// Runs in every page before the app loads.
//  * Registers every RTCPeerConnection so the test can read real WebRTC stats.
//  * Replaces the camera with an animated <canvas> stream. Some Chrome builds ship a broken fake
//    camera (track ends immediately); the microphone stays Chrome's real fake device (beeps).
//    Set SYNTHETIC_CAMERA=0 to use Chrome's own fake camera instead.
const initScript = (syntheticCamera) => {
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

const users = {};
// Every user gets their OWN browser process, like a separate device: Chrome's fake capture device
// cannot be shared between several contexts of one process.
async function newUser(name, viewport) {
  const browser = await chromium.launch({ executablePath, headless: !HEADED, args: launchArgs });
  const context = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: viewport ?? { width: 1280, height: 800 } });
  await context.addInitScript(initScript, process.env.SYNTHETIC_CAMERA !== '0');
  const page = await context.newPage();
  const logs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  users[name] = { name, browser, context, page, logs };
  return users[name];
}

async function join(user, { mobile } = {}) {
  const { page, name } = user;
  await page.goto(LINK, { waitUntil: 'domcontentloaded' });
  await page.locator('#display-name').waitFor({ timeout: 30_000 });
  await page.locator('#display-name').fill(name);
  await page.locator('[data-testid=join-button]').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=join-button]').disabled, null, { timeout: 20_000 });
  await page.locator('[data-testid=join-button]').click();
  await page.locator('[data-testid=meeting-room][data-status=connected]').waitFor({ timeout: 30_000 });
}

const remoteTiles = (u) => u.page.locator('[data-testid=tile-remote]');
const participantCount = async (u) => Number(await u.page.locator('[data-testid=participant-count]').innerText());
const waitCount = (u, n, timeout = 20_000) =>
  u.page.waitForFunction((n) => document.querySelector('[data-testid=participant-count]')?.textContent === String(n), n, { timeout });

/** Remote tile for `of` as seen by `viewer`: video frames decoded AND audio energy detected. */
async function expectMediaFrom(viewer, ofName, { audio = true, timeout = 25_000 } = {}) {
  const tile = viewer.page.locator(`[data-testid=tile-remote][data-name="${ofName}"]`);
  await tile.waitFor({ timeout });
  await viewer.page.waitForFunction((name) => {
    const v = document.querySelector(`[data-testid=tile-remote][data-name="${name}"] video`);
    return !!v && v.videoWidth > 0 && v.readyState >= 2;
  }, ofName, { timeout });
  if (!audio) return;
  // Audio: the remote tile's audio track must show real received audio energy in WebRTC stats.
  // (The fake microphone beeps periodically, so poll for a few seconds.)
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

const tileState = (viewer, ofName) =>
  viewer.page.locator(`[data-testid=tile-remote][data-name="${ofName}"]`);

console.log(`\nMeeting link: ${LINK}\nBrowser: ${executablePath}\n`);

try {
  const A = await newUser('Alice');
  const B = await newUser('Bob');
  const C = await newUser('Carol', { width: 390, height: 844 }); // phone-sized

  console.log('1-4. A joins, B opens the same link in a separate (incognito-like) profile and joins');
  await step('Alice opens the link and joins from the lobby (no sign-in)', () => join(A));
  await step('Alice sees her own preview + empty-room hint', async () => {
    await A.page.locator('[data-testid=tile-local]').waitFor();
    await A.page.locator('[data-testid=empty-room]').waitFor();
  });
  await step('Bob opens the SAME link in a separate context and joins', () => join(B));
  await step('both rooms show 2 participants', async () => { await waitCount(A, 2); await waitCount(B, 2); });

  console.log('5. Audio + video flow in both directions');
  await step('Alice sees + hears Bob', () => expectMediaFrom(A, 'Bob'));
  await step('Bob sees + hears Alice', () => expectMediaFrom(B, 'Alice'));
  await A.page.screenshot({ path: path.join(SHOTS, '1-two-people.png') });

  console.log('6. Mute / camera toggles propagate');
  await step('Alice mutes -> Bob sees muted state', async () => {
    await A.page.locator('[data-testid=toggle-mic]').click();
    await B.page.waitForFunction(() => document.querySelector('[data-testid=tile-remote][data-name="Alice"]')?.dataset.muted === 'true');
  });
  await step('Alice unmutes -> Bob sees unmuted', async () => {
    await A.page.locator('[data-testid=toggle-mic]').click();
    await B.page.waitForFunction(() => document.querySelector('[data-testid=tile-remote][data-name="Alice"]')?.dataset.muted === 'false');
  });
  await step('Bob turns camera off -> Alice sees avatar state', async () => {
    await B.page.locator('[data-testid=toggle-cam]').click();
    await A.page.waitForFunction(() => document.querySelector('[data-testid=tile-remote][data-name="Bob"]')?.dataset.cameraOff === 'true');
  });
  await step('Bob turns camera on -> Alice sees video again', async () => {
    await B.page.locator('[data-testid=toggle-cam]').click();
    await A.page.waitForFunction(() => document.querySelector('[data-testid=tile-remote][data-name="Bob"]')?.dataset.cameraOff === 'false');
    await expectMediaFrom(A, 'Bob', { audio: false });
  });
  await step('audio still plays while a camera is off', async () => {
    await B.page.locator('[data-testid=toggle-cam]').click(); // off
    await expectMediaFrom(A, 'Bob', { audio: true });
    await B.page.locator('[data-testid=toggle-cam]').click(); // back on
  });

  console.log('7. Screen sharing');
  await step('Alice shares screen -> Bob sees the shared screen on stage', async () => {
    await A.page.locator('[data-testid=toggle-screenshare]').click();
    await B.page.locator('[data-testid=screen-stage]').waitFor({ timeout: 15_000 });
    await B.page.waitForFunction(() => {
      const v = document.querySelector('[data-testid=screen-stage] video');
      return !!v && v.videoWidth > 0;
    }, null, { timeout: 15_000 });
    await B.page.screenshot({ path: path.join(SHOTS, '2-screen-share-bob-view.png') });
  });
  await step('Alice stops sharing -> Bob returns to the grid', async () => {
    await A.page.locator('[data-testid=toggle-screenshare]').click();
    await B.page.locator('[data-testid=screen-stage]').waitFor({ state: 'detached', timeout: 15_000 });
    await expectMediaFrom(B, 'Alice', { audio: false });
  });

  console.log('8. Three participants at once (Carol on a phone-sized viewport)');
  await step('Carol joins', () => join(C));
  await step('all three see 3 participants', async () => { await waitCount(A, 3); await waitCount(B, 3); await waitCount(C, 3); });
  await step('every pair sees + hears each other', async () => {
    await Promise.all([
      expectMediaFrom(A, 'Bob'), expectMediaFrom(A, 'Carol'),
      expectMediaFrom(B, 'Alice'), expectMediaFrom(B, 'Carol'),
      expectMediaFrom(C, 'Alice'), expectMediaFrom(C, 'Bob'),
    ]);
  });
  await step('mobile layout has no horizontal scroll', async () => {
    const overflow = await C.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`page is ${overflow}px wider than the viewport`);
    await C.page.screenshot({ path: path.join(SHOTS, '3-three-people-mobile.png') });
  });
  await step('Carol can chat; Alice and Bob receive it', async () => {
    await C.page.locator('[data-testid=toggle-chat]').click();
    await C.page.getByPlaceholder('Type a message...').fill('hello from the phone');
    await C.page.getByPlaceholder('Type a message...').press('Enter');
    await A.page.locator('[data-testid=toggle-chat]').click();
    await A.page.getByText('hello from the phone').waitFor({ timeout: 10_000 });
    await B.page.locator('[data-testid=toggle-chat]').click();
    await B.page.getByText('hello from the phone').waitFor({ timeout: 10_000 });
  });
  await new Promise(r => setTimeout(r, 600)); // let the side-panel slide animation finish
  await A.page.screenshot({ path: path.join(SHOTS, '4-three-people-desktop.png') });

  console.log('9. A participant leaving is removed for everyone');
  await step('Carol leaves -> Alice and Bob drop to 2', async () => {
    await C.page.locator('[data-testid=leave]').click();
    await C.page.getByText('You left the meeting').waitFor();
    await waitCount(A, 2); await waitCount(B, 2);
    if (await remoteTiles(A).count() !== 1) throw new Error('Alice still has a tile for Carol');
  });
  await step('Carol rejoins from the "left" screen', async () => {
    await C.page.locator('[data-testid=rejoin]').click();
    await join(C);
    await waitCount(A, 3); await waitCount(B, 3);
    await expectMediaFrom(A, 'Carol');
  });

  console.log('10. Refresh / rejoin');
  await step('Bob refreshes the page, rejoins, and is NOT duplicated for others', async () => {
    await B.page.reload({ waitUntil: 'domcontentloaded' });
    await B.page.locator('#display-name').waitFor({ timeout: 30_000 });
    // the guest name is remembered across refreshes
    if ((await B.page.locator('#display-name').inputValue()) !== 'Bob') throw new Error('guest name was not remembered');
    await B.page.waitForFunction(() => !document.querySelector('[data-testid=join-button]').disabled);
    await B.page.locator('[data-testid=join-button]').click();
    await B.page.locator('[data-testid=meeting-room][data-status=connected]').waitFor({ timeout: 30_000 });
    await waitCount(B, 3);
    await new Promise(r => setTimeout(r, 3000)); // give a ghost session time to show up if there were one
    await waitCount(A, 3, 5_000); await waitCount(C, 3, 5_000);
    await Promise.all([expectMediaFrom(A, 'Bob'), expectMediaFrom(B, 'Alice'), expectMediaFrom(B, 'Carol'), expectMediaFrom(C, 'Bob')]);
  });

  console.log('11. Network blip');
  await step('Alice goes offline for 4s and the room recovers', async () => {
    await A.context.setOffline(true);
    await new Promise(r => setTimeout(r, 4000));
    await A.context.setOffline(false);
    await A.page.locator('[data-testid=meeting-room][data-status=connected]').waitFor({ timeout: 30_000 });
    await waitCount(A, 3); await waitCount(B, 3);
    await Promise.all([expectMediaFrom(A, 'Bob', { audio: false }), expectMediaFrom(B, 'Alice', { audio: false })]);
  });

  if (process.env.BACKEND_RESTART_SIGNAL) {
    // Optional: prove clients survive a full backend restart (all sockets dropped, room state lost).
    // Restart the backend while this waits: it creates <signal>.waiting, then proceeds once <signal>.done exists.
    const signal = process.env.BACKEND_RESTART_SIGNAL;
    console.log('11b. Backend restart');
    fs.writeFileSync(`${signal}.waiting`, '1');
    await step('all three clients reconnect after the backend restarts and the room is rebuilt', async () => {
      const deadline = Date.now() + 180_000;
      while (!fs.existsSync(`${signal}.done`)) {
        if (Date.now() > deadline) throw new Error('timed out waiting for the restart signal');
        await new Promise(r => setTimeout(r, 500));
      }
      for (const u of [A, B, C]) await u.page.locator('[data-testid=meeting-room][data-status=connected]').waitFor({ timeout: 60_000 });
      await waitCount(A, 3, 30_000); await waitCount(B, 3, 30_000); await waitCount(C, 3, 30_000);
      await Promise.all([expectMediaFrom(A, 'Bob'), expectMediaFrom(B, 'Carol'), expectMediaFrom(C, 'Alice')]);
      // and signaling works again: a message sent after the restart is delivered
      // Bob reloaded earlier, so his chat panel is closed again
      if ((await B.page.getByPlaceholder('Type a message...').count()) === 0) await B.page.locator('[data-testid=toggle-chat]').click();
      await A.page.getByPlaceholder('Type a message...').fill('after restart');
      await A.page.getByPlaceholder('Type a message...').press('Enter');
      await B.page.getByText('after restart').waitFor({ timeout: 10_000 });
    });
  }

  console.log('12. Unknown meeting');
  await step('an invalid link shows a clear "not found" screen', async () => {
    const D = await newUser('Dave');
    await D.page.goto(`${APP_URL}/meeting/000000001`, { waitUntil: 'domcontentloaded' });
    await D.page.getByText('Meeting not found').waitFor({ timeout: 20_000 });
  });
} finally {
  for (const u of Object.values(users)) {
    const interesting = u.logs.filter(l => !/favicon|Clerk|development keys|DevTools/i.test(l));
    if (interesting.length) console.log(`\n[${u.name}] browser console:\n  ${interesting.slice(0, 8).join('\n  ')}`);
  }
  await Promise.all(Object.values(users).map(u => u.browser.close().catch(() => {})));
}

console.log(failures === 0 ? '\nALL STEPS PASSED' : `\n${failures} STEP(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
