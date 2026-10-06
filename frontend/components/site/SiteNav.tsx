"use client";

import { useState } from "react";
import Link from "next/link";
import { Video, Menu, X } from "lucide-react";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export const NAV_LINKS = [
  { label: "Products", href: "/#features" },
  { label: "Solutions", href: "/#solutions" },
  { label: "Resources", href: "/help" },
  { label: "Pricing", href: "/#pricing" },
];

/** Public site header: desktop links, a working mobile menu, and sign-in / dashboard actions. */
export function SiteNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
                <Video className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl text-slate-900 tracking-tight">Confera</span>
            </Link>

            <nav className="hidden md:flex space-x-8" aria-label="Main">
              {NAV_LINKS.map((l) => (
                <Link key={l.label} href={l.href} className="text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {!signedIn ? (
              <>
                <SignInButton mode="modal">
                  <button className="text-slate-600 hover:text-blue-600 font-medium text-sm transition-colors">Sign In</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:shadow-lg hover:shadow-blue-600/20 active:scale-95">
                    Get Started
                  </button>
                </SignUpButton>
              </>
            ) : (
              <>
                <Link href="/dashboard" className="text-slate-600 hover:text-blue-600 font-medium text-sm transition-colors mr-2">Dashboard</Link>
                <UserButton />
              </>
            )}
          </div>

          <button
            className="md:hidden p-2 -mr-2 text-slate-600"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            data-testid="mobile-menu-button"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-1" data-testid="mobile-menu">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} href={l.href} onClick={() => setOpen(false)} className="block px-3 py-3 rounded-lg text-slate-700 font-medium hover:bg-slate-50">
              {l.label}
            </Link>
          ))}
          <div className="pt-3 mt-2 border-t border-slate-100 flex flex-col gap-2">
            {!signedIn ? (
              <>
                <SignInButton mode="modal">
                  <button className="w-full px-3 py-3 rounded-lg border border-slate-200 text-slate-700 font-medium">Sign In</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="w-full px-3 py-3 rounded-lg bg-blue-600 text-white font-medium">Get Started</button>
                </SignUpButton>
              </>
            ) : (
              <Link href="/dashboard" onClick={() => setOpen(false)} className="w-full px-3 py-3 rounded-lg bg-blue-600 text-white font-medium text-center">
                Go to dashboard
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
