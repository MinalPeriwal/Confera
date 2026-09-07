"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { createApi } from "@/lib/api";
import { Meeting } from "@/types";
import { PlaySquare, Calendar as CalendarIcon, Download, MoreHorizontal } from "lucide-react";
import toast from "react-hot-toast";

export default function RecordingsPage() {
  const { getToken } = useAuth();
  const [recordings, setRecordings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        setIsLoading(true);
        const recent = await createApi(await getToken()).getRecentMeetings();
        setRecordings(recent);
      } catch (error) {
        console.error("Failed to fetch recordings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecordings();
  }, [getToken]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[70vh]">
      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Recordings</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage your past meeting recordings</p>
        </div>
      </div>
      
      <div className="p-8">
        {isLoading ? (
          <div className="animate-pulse grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-slate-100 rounded-xl w-full"></div>
            ))}
          </div>
        ) : recordings.length > 0 ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {recordings.map((recording) => {
              const dateObj = new Date(recording.created_at);
              const dateStr = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
              
              return (
                <div key={recording.id} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-all group flex flex-col">
                  {/* Simulated Video Thumbnail */}
                  <div className="bg-slate-800 aspect-video relative flex items-center justify-center">
                    <button className="w-14 h-14 bg-blue-600/90 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg group-hover:bg-blue-600 z-10" onClick={() => toast.error("This is a simulated recording. Playback is not available.")}>
                      <PlaySquare className="w-6 h-6 text-white ml-1" />
                    </button>
                    {/* Simulated meeting snapshot background */}
                    <div className="absolute inset-0 opacity-10 bg-slate-700"></div>
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">
                      {recording.duration_minutes}:00
                    </div>
                  </div>
                  
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-semibold text-slate-900 line-clamp-1">{recording.title || 'Untitled Meeting'}</h3>
                    <p className="text-slate-500 text-sm mt-1 flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {dateStr}
                    </p>
                    
                    <div className="mt-auto pt-4 flex items-center justify-between">
                      <p className="text-xs text-slate-400 font-mono">ID: {recording.meeting_id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</p>
                      
                      <div className="flex gap-1">
                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Download" onClick={() => toast.error("Download is not available for this simulated recording.")}>
                          <Download className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="More" onClick={() => toast("More options are not available.", { icon: 'ℹ️' })}>
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <PlaySquare className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 mb-1">No recordings found</h3>
            <p className="text-slate-500">
              When you host a meeting and record it, it will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
