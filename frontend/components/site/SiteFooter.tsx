import Link from "next/link";
import { Video } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="bg-white border-t border-slate-200 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-lg text-slate-900">Confera</span>
          </div>
          <p className="text-slate-500 text-sm">© {new Date().getFullYear()} Confera. All rights reserved.</p>
          <div className="flex gap-6 text-sm">
            <Link href="/privacy" className="text-slate-500 hover:text-slate-800 transition-colors">Privacy</Link>
            <Link href="/terms" className="text-slate-500 hover:text-slate-800 transition-colors">Terms</Link>
            <Link href="/status" className="text-slate-500 hover:text-slate-800 transition-colors">Status</Link>
            <Link href="/help" className="text-slate-500 hover:text-slate-800 transition-colors">Help</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
