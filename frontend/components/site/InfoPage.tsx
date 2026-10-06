import { auth } from "@clerk/nextjs/server";
import { SiteNav } from "./SiteNav";
import { SiteFooter } from "./SiteFooter";

/** Shared layout for the simple public pages (help, privacy, terms, status). */
export async function InfoPage({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  const { userId } = await auth();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <SiteNav signedIn={!!userId} />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {intro && <p className="mt-3 text-lg text-slate-600">{intro}</p>}
          <div className="mt-10 space-y-8 text-slate-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_a]:text-blue-600 [&_a:hover]:underline">
            {children}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
