import type { Metadata } from "next";
import { InfoPage } from "@/components/site/InfoPage";

export const metadata: Metadata = { title: "Privacy — Confera" };

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy" intro="A plain-language summary of what Confera handles and for how long.">
      <section>
        <h2>Your account</h2>
        <p>Hosts sign in through Clerk, our sign-in provider, which handles your name, email and credentials. Guests joining with a link need no account: they only type a display name.</p>
      </section>

      <section>
        <h2>Meeting records we store</h2>
        <ul>
          <li>Meeting title, schedule, host name and meeting ID.</li>
          <li>For each participant: the display name and when they joined and left.</li>
          <li>Passcodes are stored only as a salted hash, never in plain text.</li>
        </ul>
      </section>

      <section>
        <h2>Audio and video</h2>
        <p>Audio and video travel directly between participants&apos; devices and are encrypted in transit. If a direct connection is impossible, an encrypted relay (TURN) forwards the traffic without recording it. Confera does not record meetings. If you use the recording button, the file is saved on your own device.</p>
      </section>

      <section>
        <h2>Chat and files</h2>
        <ul>
          <li>Public chat messages are kept in the server&apos;s memory while the meeting is running (so late joiners can catch up) and are not written to the database. Private messages are delivered only to their recipient and are not kept.</li>
          <li>Files you share are stored temporarily and deleted when the meeting ends.</li>
        </ul>
      </section>

      <section>
        <h2>Captions and background blur</h2>
        <p>Background blur runs entirely in your browser; no video is uploaded for it. Live captions use your browser&apos;s built-in speech recognition. Depending on the browser, that service may process your speech through its vendor, so turn captions off if that matters to you.</p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>Hosts can delete their meetings from the dashboard. Guests can leave at any time, and nothing about a guest persists beyond the participant record described above.</p>
      </section>

      <p className="text-sm text-slate-500">This page summarises how the software behaves. The operator of this site is responsible for any additional legal terms that apply to them.</p>
    </InfoPage>
  );
}
