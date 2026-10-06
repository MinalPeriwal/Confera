import Link from "next/link";
import {
  Video, Calendar, Shield, Users, MonitorPlay, MessageSquare, ChevronRight, Check, GraduationCap, Briefcase, LifeBuoy,
} from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";

const FEATURES = [
  {
    icon: Video, tint: "bg-blue-100 text-blue-600", title: "HD Video & Audio",
    body: "Sharp 720p video with echo cancellation and noise suppression, plus background blur, for distraction-free meetings.",
  },
  {
    icon: MonitorPlay, tint: "bg-indigo-100 text-indigo-600", title: "Screen Sharing",
    body: "Share your entire screen, a window or a browser tab. Everyone sees it on the main stage.",
  },
  {
    icon: Shield, tint: "bg-emerald-100 text-emerald-600", title: "Secure by Design",
    body: "Media is encrypted in transit and flows directly between participants. Waiting room, passcode, meeting lock and co-hosts keep you in control.",
  },
  {
    icon: MessageSquare, tint: "bg-purple-100 text-purple-600", title: "Real-time Chat",
    body: "Message everyone or one person privately, share files up to 10 MB, and catch up on messages when you join late.",
  },
  {
    icon: Calendar, tint: "bg-rose-100 text-rose-600", title: "Easy Scheduling",
    body: "Start an instant meeting with a unique ID and shareable link, or schedule one in advance from your dashboard.",
  },
  {
    icon: Users, tint: "bg-amber-100 text-amber-600", title: "Built for Small Groups",
    body: "Meet with up to about 8 people in a dynamic grid, with pinning, speaker view, raised hands and reactions.",
  },
];

const SOLUTIONS = [
  { icon: Briefcase, title: "Teams & remote work", body: "Stand-ups, reviews and one-to-ones with screen sharing and chat in one place." },
  { icon: GraduationCap, title: "Classes & tutoring", body: "A waiting room, raised hands and co-hosts to keep a session organised." },
  { icon: LifeBuoy, title: "Interviews & support calls", body: "Send a link and talk: guests join from any browser without creating an account." },
];

export default async function LandingPage() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <SiteNav signedIn={!!userId} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-white pt-20 pb-32">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3">
            <div className="w-96 h-96 bg-blue-100/50 rounded-full blur-3xl" />
          </div>
          <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3">
            <div className="w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight mb-8 leading-tight">
              One platform to <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">connect your team</span>
            </h1>
            <p className="mt-4 max-w-2xl text-xl text-slate-600 mx-auto mb-10 leading-relaxed">
              Bring your team together, wherever they are. Clear video, crisp audio and simple collaboration, with a link anyone can open.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/dashboard" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-full text-lg font-medium transition-all hover:shadow-xl hover:shadow-blue-600/30 flex items-center justify-center gap-2 group">
                <Video className="w-5 h-5" />
                New Meeting
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/dashboard" className="w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-4 rounded-full text-lg font-medium transition-all hover:shadow-md flex items-center justify-center gap-2">
                Join Meeting
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-500">Free to use. No credit card required.</p>

            <div className="mt-20 max-w-5xl mx-auto relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200/50 bg-slate-900 aspect-video flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
              <div className="relative text-center">
                <Video className="w-20 h-20 text-blue-500 mx-auto mb-6 opacity-80" />
                <h3 className="text-2xl font-medium text-white mb-2">High Quality Video Conferencing</h3>
                <p className="text-slate-400">Join instantly from any device</p>
              </div>
            </div>
          </div>
        </section>

        {/* Products / features */}
        <section id="features" className="py-24 bg-slate-50 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900">Everything you need for perfect meetings</h2>
              <p className="mt-4 text-lg text-slate-600">Built for reliability and ease of use.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {FEATURES.map(({ icon: Icon, tint, title, body }) => (
                <div key={title} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${tint}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
                  <p className="text-slate-600 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Solutions */}
        <section id="solutions" className="py-24 bg-white scroll-mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900">Made for the way you meet</h2>
              <p className="mt-4 text-lg text-slate-600">From daily stand-ups to a first interview.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {SOLUTIONS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="p-8 rounded-2xl border border-slate-200 bg-slate-50">
                  <Icon className="w-8 h-8 text-blue-600 mb-5" />
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
                  <p className="text-slate-600 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 bg-slate-50 scroll-mt-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold text-slate-900">Simple pricing</h2>
            <p className="mt-4 text-lg text-slate-600">Everything on this page is included.</p>
            <div className="mt-10 bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-left">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold text-slate-900">Free</span>
                <span className="text-slate-500">no credit card</span>
              </div>
              <ul className="mt-8 grid sm:grid-cols-2 gap-3 text-slate-700">
                {[
                  "Unlimited meetings", "Screen sharing", "Waiting room & passcodes", "Chat & file sharing",
                  "Raise hand & reactions", "Live captions & background blur", "Guests join without an account", "Up to ~8 people per meeting",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2"><Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />{item}</li>
                ))}
              </ul>
              <Link href="/dashboard" className="mt-10 inline-flex w-full sm:w-auto justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-full font-medium transition-colors">
                Start a meeting <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
