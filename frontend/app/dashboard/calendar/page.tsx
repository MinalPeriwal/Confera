"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { createApi } from "@/lib/api";
import { Meeting } from "@/types";
import { Calendar as CalendarIcon, Clock, Video } from "lucide-react";

export default function CalendarPage() {
  const { getToken } = useAuth();
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        setIsLoading(true);
        const upcoming = await createApi(await getToken()).getUpcomingMeetings();
        setUpcomingMeetings(upcoming);
      } catch (error) {
        console.error("Failed to fetch meetings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMeetings();
  }, [getToken]);

  // Group meetings by date string (YYYY-MM-DD)
  const groupedMeetings = upcomingMeetings.reduce((acc, meeting) => {
    const dateObj = meeting.scheduled_at ? new Date(meeting.scheduled_at) : new Date(meeting.created_at);
    const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    if (!acc[dateStr]) {
      acc[dateStr] = [];
    }
    acc[dateStr].push(meeting);
    return acc;
  }, {} as Record<string, Meeting[]>);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[70vh]">
      <div className="px-8 py-6 border-b border-slate-100">
        <h1 className="text-2xl font-bold text-slate-800">Calendar</h1>
        <p className="text-slate-500 mt-1 text-sm">Your upcoming scheduled meetings</p>
      </div>
      
      <div className="p-8">
        {isLoading ? (
          <div className="animate-pulse space-y-8">
            {[1, 2].map(i => (
              <div key={i}>
                <div className="h-6 bg-slate-200 w-48 rounded mb-4"></div>
                <div className="h-24 bg-slate-100 rounded-xl w-full"></div>
              </div>
            ))}
          </div>
        ) : Object.keys(groupedMeetings).length > 0 ? (
          <div className="space-y-10">
            {Object.entries(groupedMeetings).map(([dateStr, meetings]) => (
              <div key={dateStr} className="relative">
                <div className="sticky top-0 bg-white/95 backdrop-blur-sm py-2 z-10 border-b border-slate-100 mb-4">
                  <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-blue-600" />
                    {dateStr}
                  </h2>
                </div>
                
                <div className="space-y-3">
                  {meetings.map((meeting) => {
                    const dateObj = meeting.scheduled_at ? new Date(meeting.scheduled_at) : new Date(meeting.created_at);
                    const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                    
                    return (
                      <div key={meeting.id} className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-50 border border-slate-100 rounded-xl p-5 hover:border-blue-200 hover:shadow-sm transition-all group">
                        <div className="w-32 flex-shrink-0 text-slate-600 font-medium flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          {timeStr}
                        </div>
                        
                        <div className="flex-1 border-l-2 border-blue-200 pl-4 py-1">
                          <h3 className="font-semibold text-slate-900 text-lg group-hover:text-blue-700 transition-colors">{meeting.title}</h3>
                          <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                              <Video className="w-4 h-4" />
                              ID: {meeting.meeting_id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}
                            </span>
                            <span>•</span>
                            <span>{meeting.duration_minutes} min</span>
                          </div>
                        </div>
                        
                        <a 
                          href={`/meeting/${meeting.meeting_id}`}
                          className="mt-4 sm:mt-0 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-center"
                        >
                          Join
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
            <h3 className="text-lg font-medium text-slate-800 mb-1">Your calendar is clear</h3>
            <p className="text-slate-500">
              You don't have any scheduled meetings coming up.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
