import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/site/InfoPage";

export const metadata: Metadata = { title: "Help — Confera" };

export default function HelpPage() {
  return (
    <InfoPage title="Help & resources" intro="Everything you need to start, join and manage a meeting.">
      <section>
        <h2>Start a meeting</h2>
        <ul>
          <li>Sign in and open the <Link href="/dashboard">dashboard</Link>, then choose <strong>New Meeting</strong>.</li>
          <li>Optionally turn on the <strong>waiting room</strong> or set a <strong>passcode</strong> before you start.</li>
          <li>Copy the invite link and send it to your guests.</li>
        </ul>
      </section>

      <section>
        <h2>Join a meeting</h2>
        <ul>
          <li>Open the invite link. No account is needed: enter your name and choose <strong>Join meeting</strong>.</li>
          <li>Already have a meeting ID? Use <strong>Join Meeting</strong> on the dashboard and enter the ID or paste the link.</li>
          <li>If the host enabled a waiting room, you will wait on a screen until you are admitted.</li>
        </ul>
      </section>

      <section>
        <h2>During a meeting</h2>
        <ul>
          <li><strong>Mic, camera, screen share</strong> sit in the bottom bar. Screen sharing is not available on most phones.</li>
          <li><strong>Raise hand</strong> and <strong>reactions</strong> let you take part without interrupting.</li>
          <li><strong>Pin</strong> a person (hover a tile) or switch to <strong>Speaker view</strong> from the <em>More</em> menu.</li>
          <li><strong>Chat</strong> supports private messages and files up to 10 MB. Shared files are deleted when the meeting ends.</li>
          <li><strong>Captions</strong> (More menu) use your browser&apos;s speech recognition: Chrome, Edge and Safari.</li>
          <li><strong>Audio &amp; video settings</strong> (More menu) lets you switch camera, microphone and speaker, and blur your background.</li>
        </ul>
      </section>

      <section>
        <h2>Hosting</h2>
        <ul>
          <li>Open <strong>Participants</strong> to admit people from the waiting room, mute, remove, lock the meeting, or appoint a <strong>co-host</strong>.</li>
          <li>Use <strong>Leave → End meeting for all</strong> to close the meeting for everyone.</li>
        </ul>
      </section>

      <section>
        <h2>Troubleshooting</h2>
        <ul>
          <li><strong>No camera or microphone:</strong> allow access in your browser&apos;s site settings (the padlock in the address bar), close other apps using the camera, then choose <em>Try again</em> on the join screen.</li>
          <li><strong>Others can&apos;t see or hear me:</strong> check the mic and camera buttons are not red, and pick the right device in <em>Audio &amp; video settings</em>.</li>
          <li><strong>Stuck on &quot;Connecting&quot; or no video from one person:</strong> some office and school networks block direct connections. Try another network, or ask the site owner to enable a relay (TURN) server.</li>
          <li><strong>Echo or feedback:</strong> use headphones, and keep only one device per room unmuted.</li>
          <li><strong>&quot;Meeting not found&quot; or &quot;ended&quot;:</strong> check the link, or ask the host for a new one.</li>
          <li>Check the <Link href="/status">service status</Link> if nothing loads.</li>
        </ul>
      </section>

      <section>
        <h2>Good to know</h2>
        <ul>
          <li>Meetings work best with up to about 8 people, because everyone connects directly to everyone else.</li>
          <li>Recording is saved on the device of the person who starts it; it is not stored on our servers.</li>
        </ul>
      </section>
    </InfoPage>
  );
}
