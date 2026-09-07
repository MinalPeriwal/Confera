"use client";

import { Home, Calendar, Video, PlaySquare, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();
  
  const navItems = [
    { name: 'Home', href: '/dashboard', icon: Home },
    { name: 'Meetings', href: '/dashboard/meetings', icon: Video },
    { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
    { name: 'Recordings', href: '/dashboard/recordings', icon: PlaySquare },
  ];

  return (
    <aside className="w-64 bg-slate-50 border-r border-slate-200 h-screen flex-col hidden md:flex fixed left-0 top-0">
      <div className="p-6">
        <div className="flex items-center gap-2 text-blue-600 font-bold text-2xl tracking-tight">
          <Video className="w-8 h-8" />
          <span>Confera</span>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.name}
              href={item.href} 
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                isActive 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-slate-200">
        <Link 
          href="/dashboard/settings" 
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
            pathname === '/dashboard/settings' 
              ? 'bg-blue-50 text-blue-700' 
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-5 h-5" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
