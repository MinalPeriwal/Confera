"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { createApi } from "@/lib/api";
import { Meeting } from "@/types";
import { MeetingCard } from "@/components/MeetingCard";
import { MeetingDetailsModal } from "@/components/MeetingDetailsModal";

export default function MeetingsPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [recentMeetings, setRecentMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'recent'>('upcoming');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        setIsLoading(true);
        const authedApi = createApi(await getToken());
        const [upcoming, recent] = await Promise.all([
          authedApi.getUpcomingMeetings(),
          authedApi.getRecentMeetings()
        ]);
        setUpcomingMeetings(upcoming);
        setRecentMeetings(recent);
      } catch (error) {
        console.error("Failed to fetch meetings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMeetings();
  }, [getToken]);

  const handleJoinMeeting = (meetingId: string) => {
    router.push(`/meeting/${meetingId}`);
  };

  const activeMeetings = activeTab === 'upcoming' ? upcomingMeetings : recentMeetings;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[70vh]">
      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Meetings</h1>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('upcoming')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'upcoming' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Upcoming
          </button>
          <button 
            onClick={() => setActiveTab('recent')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'recent' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Previous
          </button>
        </div>
      </div>
      
      <div className="p-8">
        {isLoading ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 bg-slate-100 rounded-xl w-full"></div>
            ))}
          </div>
        ) : activeMeetings.length > 0 ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {activeMeetings.map(meeting => (
              <MeetingCard 
                key={meeting.id} 
                meeting={meeting} 
                type={activeTab} 
                onJoin={handleJoinMeeting} 
                onViewDetails={setSelectedMeeting}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
            <h3 className="text-lg font-medium text-slate-800 mb-1">No {activeTab} meetings found</h3>
            <p className="text-slate-500">
              {activeTab === 'upcoming' 
                ? 'You have no scheduled meetings coming up.' 
                : 'You have no recent meeting history.'}
            </p>
          </div>
        )}
      </div>

      <MeetingDetailsModal
        isOpen={!!selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        meeting={selectedMeeting}
      />
    </div>
  );
}
