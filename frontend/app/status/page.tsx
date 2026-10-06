"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

type Check = { state: "loading" } | { state: "ok"; detail: string } | { state: "down"; detail: string };

function StatusRow({ label, check }: { label: string; check: Check }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-white border border-slate-200 rounded-xl" data-testid={`status-${label}`}>
      {check.state === "loading" && <Loader2 className="w-5 h-5 mt-0.5 animate-spin text-slate-400" />}
      {check.state === "ok" && <CheckCircle2 className="w-5 h-5 mt-0.5 text-green-500" />}
      {check.state === "down" && <XCircle className="w-5 h-5 mt-0.5 text-red-500" />}
      <div>
        <p className="font-medium text-slate-900">{label}</p>
        <p className="text-sm text-slate-500">{check.state === "loading" ? "Checking…" : check.detail}</p>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const { isSignedIn } = useAuth();
  const [server, setServer] = useState<Check>({ state: "loading" });
  const [relay, setRelay] = useState<Check>({ state: "loading" });

  // Pure async check: state is only set after the awaits, never synchronously inside an effect.
  const check = useCallback(async () => {
    const started = Date.now();
    try {
      await api.getHealth();
      setServer({ state: "ok", detail: `Operational. Responded in ${Date.now() - started} ms.` });
    } catch {
      setServer({ state: "down", detail: "The server did not respond. If it was idle it can take up to a minute to wake, so try again shortly." });
    }
    try {
      const ice = await api.getIceServers();
      setRelay({
        state: "ok",
        detail: ice.hasTurn
          ? "A relay server is configured, so restrictive networks can connect."
          : "No relay server configured: people on very restrictive networks may not be able to connect.",
      });
    } catch {
      setRelay({ state: "down", detail: "Could not load connection settings." });
    }
  }, []);

  const recheck = () => {
    setServer({ state: "loading" });
    setRelay({ state: "loading" });
    void check();
  };

  // State is only set after the awaited requests resolve, so this does not cascade renders.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void check(); }, [check]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <SiteNav signedIn={!!isSignedIn} />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Service status</h1>
          <p className="mt-3 text-lg text-slate-600">Live checks from your browser.</p>
          <div className="mt-8 space-y-3">
            <StatusRow label="Meeting server" check={server} />
            <StatusRow label="Connection relay" check={relay} />
          </div>
          <button onClick={recheck} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
            <RefreshCw className="w-4 h-4" /> Check again
          </button>
          <p className="mt-10 text-sm text-slate-500">
            Having trouble? See the <Link href="/help" className="text-blue-600 hover:underline">help page</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
