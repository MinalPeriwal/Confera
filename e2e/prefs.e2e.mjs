// Settings-page preferences take effect when joining a meeting.
//   APP_URL=... MEETING_ID=<plain meeting, no waiting room/passcode> node prefs.e2e.mjs
import { APP_URL, newUser, closeAll, step, expectMediaFrom } from './lib.mjs';
import * as lib from './lib.mjs';

const { MEETING_ID } = process.env;
if (!MEETING_ID) { console.error('Set MEETING_ID'); process.exit(2); }
const LINK = `${APP_URL}/meeting/${MEETING_ID}`;

try {
  const A = await newUser('Alice');
  const B = await newUser('Bob');

  await step('without saved preferences you join unmuted with camera on', async () => {
    await A.page.goto(LINK, { waitUntil: 'domcontentloaded' });
    await A.page.locator('#display-name').fill('Alice');
    await A.page.waitForFunction(() => !document.querySelector('[data-testid=join-button]').disabled, null, { timeout: 20_000 });
    await A.page.locator('[data-testid=join-button]').click();
    await A.page.locator('[data-testid=meeting-room][data-status=connected]').waitFor({ timeout: 30_000 });
    const [muted, camOff] = await A.page.evaluate(() => {
      const t = document.querySelector('[data-testid=tile-local]');
      return [t.dataset.muted, t.dataset.cameraOff];
    });
    if (muted !== 'false' || camOff !== 'false') throw new Error(`muted=${muted} cameraOff=${camOff}`);
  });

  await step('saved "join muted" + "camera off" are honoured in the lobby and the room, and others see it', async () => {
    await B.page.addInitScript(() => {
      localStorage.setItem('confera:devices', JSON.stringify({ joinMuted: true, joinCameraOff: true }));
    });
    await B.page.goto(LINK, { waitUntil: 'domcontentloaded' });
    await B.page.locator('#display-name').fill('Bob');
    await B.page.waitForFunction(() => !document.querySelector('[data-testid=join-button]').disabled, null, { timeout: 20_000 });
    const lobbyMic = await B.page.locator('[data-testid=prejoin-mic]').getAttribute('aria-label');
    const lobbyCam = await B.page.locator('[data-testid=prejoin-cam]').getAttribute('aria-label');
    if (lobbyMic !== 'Unmute microphone' || lobbyCam !== 'Turn camera on') throw new Error(`lobby shows "${lobbyMic}" / "${lobbyCam}"`);
    await B.page.locator('[data-testid=join-button]').click();
    await B.page.locator('[data-testid=meeting-room][data-status=connected]').waitFor({ timeout: 30_000 });
    await A.page.waitForFunction(() => {
      const t = document.querySelector('[data-testid=tile-remote][data-name="Bob"]');
      return t?.dataset.muted === 'true' && t?.dataset.cameraOff === 'true';
    }, null, { timeout: 15_000 });
  });

  await step('a muted joiner can still unmute and be heard', async () => {
    await B.page.locator('[data-testid=toggle-mic]').click();
    await expectMediaFrom(A, 'Bob', { audio: true });
  });

  await step('saved "blur background" is applied automatically when the camera starts', async () => {
    const C = await newUser('Carol');
    await C.page.addInitScript(() => {
      localStorage.setItem('confera:devices', JSON.stringify({ blur: true }));
    });
    await C.page.goto(LINK, { waitUntil: 'domcontentloaded' });
    await C.page.locator('#display-name').fill('Carol');
    await C.page.waitForFunction(() => !document.querySelector('[data-testid=join-button]').disabled, null, { timeout: 20_000 });
    await C.page.locator('[data-testid=join-button]').click();
    await C.page.locator('[data-testid=meeting-room][data-status=connected]').waitFor({ timeout: 30_000 });
    await C.page.locator('[data-testid=toggle-more]').click();
    await C.page.locator('[data-testid=open-settings]').click();
    await C.page.waitForFunction(() => document.querySelector('[data-testid=blur-toggle]')?.dataset.blur === 'on', null, { timeout: 60_000 });
    await expectMediaFrom(A, 'Carol', { audio: false });
  });
} finally {
  await closeAll();
}
console.log(lib.failures === 0 ? '\nALL PREFS STEPS PASSED' : `\n${lib.failures} STEP(S) FAILED`);
process.exit(lib.failures === 0 ? 0 : 1);
