// Browser test for the meeting-management features: passcode, waiting room (admit / deny / admit all),
// meeting lock, co-host, moderation, hand raise, reactions, pin / speaker view, private chat, chat
// history, file sharing, device settings.
//
//   python e2e/create_meeting.py --json --waiting-room --passcode abcd --host-name Alice
//   APP_URL=... MEETING_ID=<meeting_id> HOST_TICKET=<host_ticket> node features.e2e.mjs
import {
  APP_URL, newUser, closeAll, step, expectMediaFrom, users,
} from './lib.mjs';
import * as lib from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const { MEETING_ID, HOST_TICKET } = process.env;
const PASSCODE = 'abcd';
if (!MEETING_ID || !HOST_TICKET) {
  console.error('Set MEETING_ID and HOST_TICKET (see the header comment).');
  process.exit(2);
}
const LINK = `${APP_URL}/meeting/${MEETING_ID}`;

const room = (u) => u.page.locator('[data-testid=meeting-room][data-status=connected]');
const tile = (viewer, name) => viewer.page.locator(`[data-testid=tile-remote][data-name="${name}"]`);
const count = (u, n, timeout = 20_000) =>
  u.page.waitForFunction((n) => document.querySelector('[data-testid=participant-count]')?.textContent === String(n), n, { timeout });

async function lobby(u, passcode = PASSCODE) {
  await u.page.goto(LINK, { waitUntil: 'domcontentloaded' });
  await u.page.locator('#display-name').waitFor({ timeout: 30_000 });
  await u.page.locator('#display-name').fill(u.name);
  if (passcode !== null) await u.page.locator('#meeting-passcode').fill(passcode);
  await u.page.waitForFunction(() => !document.querySelector('[data-testid=join-button]').disabled, null, { timeout: 20_000 });
}
const clickJoin = (u) => u.page.locator('[data-testid=join-button]').click();

async function openPanel(u, which) {
  const panel = u.page.locator(`[data-testid=${which}-panel]`);
  if (!(await panel.isVisible())) await u.page.locator(`[data-testid=toggle-${which}]`).click();
  await panel.waitFor();
}
async function rowAction(u, personName, testId) {
  await openPanel(u, 'participants');
  const row = u.page.locator(`[data-testid=participant-row][data-name="${personName}"]`);
  await row.hover();
  await row.locator(`[data-testid=${testId}]`).click();
}
async function sendChat(u, text) {
  await openPanel(u, 'chat');
  await u.page.getByPlaceholder('Type a message...').fill(text);
  await u.page.getByPlaceholder('Type a message...').press('Enter');
}

console.log(`\nMeeting link: ${LINK}\n`);
try {
  const A = await newUser('Alice', { hostTicket: HOST_TICKET });
  const B = await newUser('Bob');
  const C = await newUser('Carol');
  const D = await newUser('Dave');
  for (const u of [A, B, C, D]) u.page.on('dialog', d => d.accept());

  console.log('Passcode + waiting room');
  await step('host joins straight in (no waiting room for the host)', async () => {
    await lobby(A); await clickJoin(A); await room(A).waitFor({ timeout: 30_000 });
  });
  await step('guest sees the passcode field + waiting-room notice; a wrong passcode is rejected', async () => {
    await lobby(B, 'wrong');
    await B.page.getByText('The host will need to let you in').waitFor();
    await B.page.screenshot({ path: path.join(SHOTS, '5-lobby-passcode.png') });
    await clickJoin(B);
    await B.page.locator('[data-testid=join-error]').getByText('passcode is incorrect').waitFor({ timeout: 10_000 });
  });
  await step('correct passcode puts the guest in the waiting room', async () => {
    await B.page.locator('#meeting-passcode').fill(PASSCODE);
    await clickJoin(B);
    await B.page.locator('[data-testid=waiting-screen]').waitFor({ timeout: 15_000 });
  });
  await step('host sees the waiting guest and admits them; both can see + hear each other', async () => {
    await A.page.locator('[data-testid=waiting-badge]').waitFor({ timeout: 15_000 });
    await A.page.locator('[data-testid=waiting-guest]').getByText('Bob').waitFor();
    await A.page.locator('[data-testid=admit]').click();
    await room(B).waitFor({ timeout: 20_000 });
    await Promise.all([expectMediaFrom(A, 'Bob'), expectMediaFrom(B, 'Alice')]);
  });
  await step('host denies a guest: they see "Entry declined"', async () => {
    await lobby(C); await clickJoin(C);
    await C.page.locator('[data-testid=waiting-screen]').waitFor({ timeout: 15_000 });
    await A.page.locator('[data-testid=waiting-guest]').getByText('Carol').waitFor();
    await A.page.locator('[data-testid=deny]').click();
    await C.page.getByText('Entry declined').waitFor({ timeout: 10_000 });
  });
  await step('denied guest tries again; "Admit all" lets them in', async () => {
    await lobby(C); await clickJoin(C);
    await C.page.locator('[data-testid=waiting-screen]').waitFor({ timeout: 15_000 });
    await A.page.locator('[data-testid=admit-all]').click();
    await room(C).waitFor({ timeout: 20_000 });
    await count(A, 3);
  });

  console.log('Hand raise, reactions, pin, speaker view');
  await step('raise hand shows on the tile + participants list; the host can lower it', async () => {
    await B.page.locator('[data-testid=toggle-hand]').click();
    await A.page.waitForFunction(() => document.querySelector('[data-testid=tile-remote][data-name="Bob"]')?.dataset.hand === 'true');
    await rowAction(A, 'Bob', 'lower-hand');
    await A.page.waitForFunction(() => document.querySelector('[data-testid=tile-remote][data-name="Bob"]')?.dataset.hand === 'false');
    await B.page.waitForFunction(() => document.querySelector('[data-testid=toggle-hand]').getAttribute('aria-label') === 'Raise hand');
  });
  await step('reactions float up for everyone', async () => {
    await B.page.locator('[data-testid=toggle-reactions]').click();
    await B.page.locator('[data-testid="reaction-🎉"]').click();
    await A.page.locator('[data-testid=floating-reaction]').first().waitFor({ timeout: 10_000 });
    await C.page.locator('[data-testid=floating-reaction]').first().waitFor({ timeout: 10_000 });
  });
  await step('pin a participant -> spotlight layout; unpin -> gallery', async () => {
    await tile(A, 'Bob').hover();
    await tile(A, 'Bob').locator('[data-testid=pin-button]').click();
    await A.page.locator('[data-testid=spotlight]').waitFor();
    await tile(A, 'Bob').locator('[data-testid=pin-button]').click();
    await A.page.locator('[data-testid=gallery]').waitFor();
  });
  await step('speaker view toggles on and off from the More menu', async () => {
    await A.page.locator('[data-testid=toggle-more]').click();
    await A.page.locator('[data-testid=toggle-view]').click();
    await A.page.locator('[data-testid=spotlight]').waitFor();
    await A.page.locator('[data-testid=toggle-more]').click();
    await A.page.locator('[data-testid=toggle-view]').click();
    await A.page.locator('[data-testid=gallery]').waitFor();
  });

  console.log('Chat: public, private, history, files');
  await step('public chat reaches everyone', async () => {
    await sendChat(A, 'hello all');
    for (const u of [B, C]) { await openPanel(u, 'chat'); await u.page.getByText('hello all').waitFor({ timeout: 10_000 }); }
  });
  await step('private message reaches only its recipient', async () => {
    await B.page.locator('[data-testid=chat-recipient]').selectOption({ label: 'Alice (private)' });
    await sendChat(B, 'secret for alice');
    await openPanel(A, 'chat');
    await A.page.getByText('secret for alice').waitFor({ timeout: 10_000 });
    await new Promise(r => setTimeout(r, 1500));
    if (await C.page.getByText('secret for alice').count()) throw new Error('Carol saw a private message');
    await B.page.locator('[data-testid=chat-recipient]').selectOption({ label: 'Everyone' });
  });
  await step('file sharing: upload, appears for others, downloads with the right content', async () => {
    await openPanel(B, 'chat');
    await B.page.locator('[data-testid=chat-file-input]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('file body 123') });
    await openPanel(A, 'chat');
    const link = A.page.locator('[data-testid=chat-attachment]').getByText('notes.txt');
    await link.waitFor({ timeout: 15_000 });
    const href = await A.page.locator('[data-testid=chat-attachment]').first().getAttribute('href');
    const body = await A.page.evaluate(async (url) => (await fetch(url)).text(), href);
    if (body !== 'file body 123') throw new Error(`downloaded content was ${JSON.stringify(body)}`);
  });

  console.log('Meeting lock + chat history for late joiners');
  await step('host locks the meeting: everyone sees the lock, a new guest is refused', async () => {
    await openPanel(A, 'participants');
    await A.page.locator('[data-testid=toggle-lock]').click();
    await B.page.locator('[data-testid=locked-chip]').waitFor({ timeout: 10_000 });
    await lobby(D); await clickJoin(D);
    await D.page.locator('[data-testid=join-error]').getByText('locked').waitFor({ timeout: 10_000 });
  });
  await step('unlock, guest joins via the waiting room and sees earlier PUBLIC chat only', async () => {
    await A.page.locator('[data-testid=toggle-lock]').click();
    await B.page.locator('[data-testid=locked-chip]').waitFor({ state: 'detached', timeout: 10_000 });
    await clickJoin(D);
    await D.page.locator('[data-testid=waiting-screen]').waitFor({ timeout: 15_000 });
    await A.page.locator('[data-testid=waiting-guest]').getByText('Dave').waitFor();
    await A.page.locator('[data-testid=admit]').click();
    await room(D).waitFor({ timeout: 20_000 });
    await openPanel(D, 'chat');
    await D.page.getByText('hello all').waitFor({ timeout: 10_000 });
    if (await D.page.getByText('secret for alice').count()) throw new Error('late joiner saw a private message');
    await count(A, 4);
  });

  console.log('Co-host and moderation');
  await step('host makes Bob a co-host: Bob gets the moderation controls', async () => {
    await rowAction(A, 'Bob', 'make-cohost');
    await openPanel(B, 'participants');
    await B.page.locator('[data-testid=toggle-lock]').waitFor({ timeout: 10_000 });
    await openPanel(A, 'participants');
    await new Promise(r => setTimeout(r, 600));
    await A.page.screenshot({ path: path.join(SHOTS, '6-host-participants.png') });
  });
  await step('co-host mutes a participant', async () => {
    await rowAction(B, 'Dave', 'mute-peer');
    await D.page.waitForFunction(() => document.querySelector('[data-testid=tile-local]').dataset.muted === 'true', null, { timeout: 10_000 });
    await A.page.waitForFunction(() => document.querySelector('[data-testid=tile-remote][data-name="Dave"]')?.dataset.muted === 'true', null, { timeout: 10_000 });
  });
  await step('host "Mute all" mutes the rest', async () => {
    await openPanel(A, 'participants');
    await A.page.locator('[data-testid=mute-all]').click();
    await C.page.waitForFunction(() => document.querySelector('[data-testid=tile-local]').dataset.muted === 'true', null, { timeout: 10_000 });
  });
  await step('a plain guest has NO moderation controls', async () => {
    await openPanel(C, 'participants');
    if (await C.page.locator('[data-testid=toggle-lock]').count()) throw new Error('guest can see the lock switch');
    if (await C.page.locator('[data-testid=mute-all]').count()) throw new Error('guest can see Mute all');
  });

  console.log('Devices + captions menu');
  await step('device settings opens, lists devices, and switching the mic keeps audio flowing', async () => {
    await A.page.locator('[data-testid=toggle-more]').click();
    await A.page.locator('[data-testid=open-settings]').click();
    await A.page.locator('[data-testid=device-settings]').waitFor();
    const opts = await A.page.locator('[data-testid=mic-select] option').count();
    if (opts < 1) throw new Error('no microphones listed');
    if (opts > 1) await A.page.locator('[data-testid=mic-select]').selectOption({ index: 1 });
    await A.page.getByRole('button', { name: 'Done' }).click();
    await Promise.all([expectMediaFrom(B, 'Alice'), expectMediaFrom(D, 'Alice')]);
  });
  await step('background blur: turns on, others still receive live video, turns off again', async () => {
    await A.page.locator('[data-testid=toggle-more]').click();
    await A.page.locator('[data-testid=open-settings]').click();
    await A.page.locator('[data-testid=blur-toggle]').click();
    await A.page.waitForFunction(() => document.querySelector('[data-testid=blur-toggle]')?.dataset.blur === 'on', null, { timeout: 60_000 });
    await A.page.getByRole('button', { name: 'Done' }).click();
    await expectMediaFrom(B, 'Alice', { audio: true });
    // frames keep arriving after blur: the decoded-frame counter must advance
    const advancing = await B.page.evaluate(async () => {
      const read = async () => {
        let frames = 0;
        for (const pc of window.__pcs) (await pc.getStats()).forEach(s => { if (s.type === 'inbound-rtp' && s.kind === 'video') frames = Math.max(frames, s.framesDecoded ?? 0); });
        return frames;
      };
      const a = await read(); await new Promise(r => setTimeout(r, 2000)); return (await read()) > a;
    });
    if (!advancing) throw new Error('no new video frames after enabling blur');
    await A.page.screenshot({ path: path.join(SHOTS, '7-blur-on.png') });
    await A.page.locator('[data-testid=toggle-more]').click();
    await A.page.locator('[data-testid=open-settings]').click();
    await A.page.locator('[data-testid=blur-toggle]').click();
    await A.page.waitForFunction(() => document.querySelector('[data-testid=blur-toggle]')?.dataset.blur === 'off', null, { timeout: 10_000 });
    await A.page.getByRole('button', { name: 'Done' }).click();
    await expectMediaFrom(B, 'Alice', { audio: false });
  });
  await step('captions entry is available in the More menu', async () => {
    await A.page.locator('[data-testid=toggle-more]').click();
    await A.page.locator('[data-testid=toggle-captions]').waitFor();
    await A.page.keyboard.press('Escape');
  });

  console.log('Removing a participant');
  await step('host removes a participant: they see "You were removed" and drop from the list', async () => {
    await rowAction(A, 'Carol', 'remove-peer');
    await C.page.getByText('You were removed').waitFor({ timeout: 10_000 });
    await count(A, 3);
  });
} finally {
  for (const u of Object.values(users)) {
    const interesting = u.logs.filter(l => !/favicon|Clerk|development keys|DevTools|AudioContext|Failed to load resource/i.test(l));
    if (interesting.length) console.log(`\n[${u.name}] browser console:\n  ${interesting.slice(0, 6).join('\n  ')}`);
  }
  await closeAll();
}
console.log(lib.failures === 0 ? '\nALL FEATURE STEPS PASSED' : `\n${lib.failures} STEP(S) FAILED`);
process.exit(lib.failures === 0 ? 0 : 1);
