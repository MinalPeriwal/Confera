"use client";

import { Bell, Search, Settings, Activity, Video, Calendar, X } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createApi, fetchApi } from '@/lib/api';
import { Meeting } from '@/types';
import { UserButton, useUser, useAuth } from '@clerk/nextjs';

export function TopBar() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const [healthStatus, setHealthStatus] = useState<boolean>(false);

  // Search state
  const [query, setQuery] = useState('');
  const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);
  const [results, setResults] = useState<Meeting[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchApi('/health')
      .then((data: unknown) => setHealthStatus((data as { status: string }).status === 'ok'))
      .catch(() => setHealthStatus(false));
  }, []);

  // Load all meetings for search
  useEffect(() => {
    const fetchAll = async () => {
      setIsLoadingMeetings(true);
      try {
        const authedApi = createApi(await getToken());
        const [upcoming, recent] = await Promise.all([
          authedApi.getUpcomingMeetings(),
          authedApi.getRecentMeetings(),
        ]);
        const map = new Map<number, Meeting>();
        [...upcoming, ...recent].forEach(m => map.set(m.id, m));
        setAllMeetings(Array.from(map.values()));
      } catch {
        // silently fail
      } finally {
        setIsLoadingMeetings(false);
      }
    };
    fetchAll();
  }, [getToken]);

  // Filter results as user types
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const q = query.toLowerCase();
    const filtered = allMeetings.filter(m =>
      m.title?.toLowerCase().includes(q) ||
      m.meeting_id?.includes(q) ||
      m.host_name?.toLowerCase().includes(q)
    );
    setResults(filtered);
    setShowDropdown(true);
  }, [query, allMeetings]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelectMeeting = (meeting: Meeting) => {
    setQuery('');
    setShowDropdown(false);
    router.push(`/meeting/${meeting.meeting_id}`);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 sticky top-0 z-10 w-full">
      <div className="flex-1 flex items-center">
        <div className="relative w-full max-w-md" ref={searchRef}>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setShowDropdown(true)}
            placeholder="Search meetings by title, host, or ID..."
            className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Dropdown Results */}
          {showDropdown && (
            <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
              {results.length === 0 ? (
                <div className="px-4 py-6 text-center text-slate-500 text-sm">
                  No meetings found for &quot;{query}&quot;
                </div>
              ) : (
                <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {results.map(meeting => {
                    const isUpcoming = meeting.status === 'scheduled' || meeting.status === 'active';
                    return (
                      <li key={meeting.id}>
                        <button
                          onClick={() => handleSelectMeeting(meeting)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isUpcoming ? 'bg-blue-100' : 'bg-slate-100'}`}>
                            {isUpcoming
                              ? <Video className="w-4 h-4 text-blue-600" />
                              : <Calendar className="w-4 h-4 text-slate-500" />
                            }
                          </div>
                          <div className="overflow-hidden flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">{meeting.title || 'Untitled Meeting'}</p>
                            <p className="text-xs text-slate-400 font-mono">{meeting.meeting_id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')} · {meeting.host_name}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            meeting.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : meeting.status === 'scheduled'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {meeting.status}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Backend status indicator */}
        <div
          className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100"
          title={healthStatus ? "Backend Connected" : "Backend Disconnected"}
        >
          <Activity className="w-4 h-4 text-slate-500" />
          <div className={`w-2 h-2 rounded-full ${healthStatus ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>

        <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full border-2 border-white"></span>
        </button>

        <Link href="/dashboard/settings" className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors hidden sm:block">
          <Settings className="w-5 h-5" />
        </Link>

        <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block"></div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-slate-700">{user?.fullName || "User"}</p>
            <p className="text-xs text-slate-500">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
          <UserButton />
        </div>
      </div>
    </header>
  );
}
