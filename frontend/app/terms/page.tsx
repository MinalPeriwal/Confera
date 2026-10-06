import type { Metadata } from "next";
import { InfoPage } from "@/components/site/InfoPage";

export const metadata: Metadata = { title: "Terms — Confera" };

export default function TermsPage() {
  return (
    <InfoPage title="Terms of use" intro="The ground rules for using Confera.">
      <section>
        <h2>Using the service</h2>
        <ul>
          <li>Use Confera lawfully and respectfully. Do not harass others, share illegal content, or try to disrupt or break into the service or other people&apos;s meetings.</li>
          <li>You are responsible for what you say, show and share in a meeting.</li>
        </ul>
      </section>

      <section>
        <h2>Hosts</h2>
        <ul>
          <li>Hosts control who may join (waiting room, passcode, lock) and may remove participants or end a meeting at any time.</li>
          <li>If you record a meeting, you are responsible for getting every participant&apos;s consent where the law requires it.</li>
        </ul>
      </section>

      <section>
        <h2>Availability</h2>
        <p>The service is provided as is, without a guarantee of uptime or fitness for a particular purpose. Features, limits (such as meeting size and file size) and availability may change. Free instances may be slow to start after a period of inactivity.</p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>You keep ownership of what you share. You give the service permission to transmit it to the other participants of your meeting, which is needed for it to work.</p>
      </section>

      <p className="text-sm text-slate-500">The operator of this site may add further terms. Contact them with any questions.</p>
    </InfoPage>
  );
}
