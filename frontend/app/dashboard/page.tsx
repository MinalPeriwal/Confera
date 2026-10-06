"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useAuth } from "@clerk/nextjs";
import { createApi } from "@/lib/api";
import { Meeting, MeetingCreatePayload } from "@/types";
import { MeetingActionButtons } from "@/components/MeetingActionButtons";
import { MeetingCard } from "@/components/MeetingCard";
import { JoinMeetingModal } from "@/components/JoinMeetingModal";
import { ScheduleMeetingModal } from "@/components/ScheduleMeetingModal";
import { MeetingDetailsModal } from "@/components/MeetingDetailsModal";
import { NewMeetingModal } from "@/components/NewMeetingModal";
import toast from "react-hot-toast";

export default function Home() {
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();

  const getApi = async () => createApi(await getToken());

  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [recentMeetings, setRecentMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isCreatingInstant, setIsCreatingInstant] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [newMeeting, setNewMeeting] = useState<Meeting | null>(null);

  const fetchMeetings = async () => {
    try {
      setIsLoading(true);
      const authedApi = await getApi();
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

  useEffect(() => {
    fetchMeetings();
  }, []);

  const handleNewMeeting = async () => {
    try {
      setIsCreatingInstant(true);
      const authedApi = await getApi();
      const meeting = await authedApi.createMeeting({
        instant: true,
        host_name: user?.fullName || "User",
      });
      setNewMeeting(meeting);
    } catch (error) {
      console.error("Failed to create instant meeting:", error);
      toast.error("Failed to start meeting. Please try again.");
    } finally {
      setIsCreatingInstant(false);
    }
  };

  const handleJoinMeeting = (meetingId: string) => {
    setIsJoinModalOpen(false);
    router.push(`/meeting/${meetingId}`);
  };

  const handleScheduleMeeting = async (payload: MeetingCreatePayload) => {
    const authedApi = await getApi();
    await authedApi.createMeeting(payload);
    await fetchMeetings();
  };

  return (
    <>
      {/* Welcome Section */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-slate-900">Good afternoon, {user?.firstName || "User"}</h1>
        <p className="text-slate-500 mt-2 text-lg">Ready to connect?</p>
      </div>

      {/* Action Buttons */}
      <MeetingActionButtons
        onNewMeeting={handleNewMeeting}
        onJoinMeeting={() => setIsJoinModalOpen(true)}
        onScheduleMeeting={() => setIsScheduleModalOpen(true)}
        isCreating={isCreatingInstant}
      />

      {/* Meetings Grids */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Upcoming Meetings */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Upcoming Meetings</h2>
              <p className="text-sm text-slate-500 mt-0.5">{upcomingMeetings.length} meeting{upcomingMeetings.length !== 1 ? 's' : ''} scheduled</p>
            </div>
            {upcomingMeetings.length > 0 && (
              <span className="text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-full">{upcomingMeetings.length}</span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="h-48 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : upcomingMeetings.length > 0 ? (
            <div className="grid gap-4">
              {upcomingMeetings.map(meeting => (
                <MeetingCard key={meeting.id} meeting={meeting} type="upcoming" onJoin={handleJoinMeeting} />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <p className="font-semibold text-slate-700">No upcoming meetings</p>
              <p className="text-sm text-slate-400 mt-1">Schedule a meeting to get started</p>
            </div>
          )}
        </section>

        {/* Recent Meetings */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Recent Meetings</h2>
              <p className="text-sm text-slate-500 mt-0.5">{recentMeetings.length} past meeting{recentMeetings.length !== 1 ? 's' : ''}</p>
            </div>
            {recentMeetings.length > 0 && (
              <span className="text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full">{recentMeetings.length}</span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="h-48 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : recentMeetings.length > 0 ? (
            <div className="grid gap-4">
              {recentMeetings.map(meeting => (
                <MeetingCard key={meeting.id} meeting={meeting} type="recent" onViewDetails={setSelectedMeeting} />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
              </div>
              <p className="font-semibold text-slate-700">No recent meetings</p>
              <p className="text-sm text-slate-400 mt-1">Your past meetings will appear here</p>
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      <JoinMeetingModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onJoin={handleJoinMeeting}
      />

      <ScheduleMeetingModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        onSchedule={handleScheduleMeeting}
      />

      <MeetingDetailsModal
        isOpen={!!selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        meeting={selectedMeeting}
        onJoin={handleJoinMeeting}
      />

      {newMeeting && (
        <NewMeetingModal
          meeting={newMeeting}
          onStart={() => router.push(`/meeting/${newMeeting.meeting_id}`)}
          onClose={() => setNewMeeting(null)}
          onUpdateSettings={async (settings) => {
            const updated = await (await getApi()).updateSettings(newMeeting.meeting_id, settings);
            setNewMeeting(updated);
          }}
        />
      )}
    </>
  );
}
