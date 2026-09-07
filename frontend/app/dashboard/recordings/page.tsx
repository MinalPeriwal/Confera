"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { createApi } from "@/lib/api";
import { Meeting } from "@/types";
import { PlaySquare, Calendar as CalendarIcon, Download, MoreHorizontal, Trash2, X, Play } from "lucide-react";
import toast from "react-hot-toast";

function parseUTC(dateString: string) {
  if (!dateString.endsWith('Z') && !dateString.includes('+')) {
    return new Date(dateString + 'Z');
  }
  return new Date(dateString);
}

export default function RecordingsPage() {
  const { getToken } = useAuth();
  const [recordings, setRecordings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewMeeting, setReviewMeeting] = useState<Meeting | null>(null);

  const fetchRecordings = async () => {
    try {
      setIsLoading(true);
      const api = createApi(await getToken());
      const recent = await api.getRecentMeetings();
      // In this clone, recent meetings act as our "recordings" since real video processing is mocked
      setRecordings(recent);
    } catch (error) {
      console.error("Failed to fetch recordings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  const handleDelete = async (meetingId: string) => {
    if (!window.confirm("Are you sure you want to delete this recording? This will permanently remove the meeting from your history.")) return;
    
    try {
      setDeletingId(meetingId);
      const api = createApi(await getToken());
      await api.deleteMeeting(meetingId);
      toast.success("Recording deleted successfully");
      setRecordings(prev => prev.filter(m => m.meeting_id !== meetingId));
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete recording");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[70vh] relative">
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
              const dateObj = parseUTC(recording.created_at);
              const dateStr = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              const isDeleting = deletingId === recording.meeting_id;
              
              return (
                <div key={recording.id} className={`bg-slate-50 border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-all group flex flex-col ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}>
                  {/* Simulated Video Thumbnail */}
                  <div className="bg-slate-800 aspect-video relative flex items-center justify-center overflow-hidden">
                    <button 
                      onClick={() => setReviewMeeting(recording)}
                      className="w-14 h-14 bg-blue-600/90 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg group-hover:bg-blue-600 z-10" 
                      title="Review Recording"
                    >
                      <Play className="w-6 h-6 text-white ml-1 fill-current" />
                    </button>
                    {/* Simulated meeting snapshot background */}
                    <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-blue-900 to-slate-900 pointer-events-none"></div>
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono z-10">
                      {recording.duration_minutes}:00
                    </div>
                  </div>
                  
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-semibold text-slate-900 line-clamp-1">{recording.title || 'Untitled Meeting'}</h3>
                    <p className="text-slate-500 text-xs mt-1 flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {dateStr}
                    </p>
                    
                    <div className="mt-auto pt-4 flex items-center justify-between">
                      <p className="text-xs text-slate-400 font-mono">ID: {recording.meeting_id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</p>
                      
                      <div className="flex gap-1">
                        <button 
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                          title="Delete Recording" 
                          onClick={() => handleDelete(recording.meeting_id)}
                          disabled={isDeleting}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Download" onClick={() => toast.error("Download is not available in the sandbox environment.")}>
                          <Download className="w-4 h-4" />
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

      {/* Review Modal */}
      {reviewMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-slate-950 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col max-h-[90vh]">
            <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-900">
              <div>
                <h3 className="text-slate-200 font-semibold">{reviewMeeting.title}</h3>
                <p className="text-slate-400 text-xs mt-0.5">Recording Playback (Simulated)</p>
              </div>
              <button onClick={() => setReviewMeeting(null)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative flex-1 bg-black flex items-center justify-center min-h-[50vh]">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PlaySquare className="w-10 h-10 text-slate-400" />
                </div>
                <h4 className="text-xl text-slate-300 font-medium">Cloud Recording</h4>
                <p className="text-slate-500 text-sm max-w-md mx-auto">
                  In a production environment, this would play back the processed cloud recording of your meeting.
                </p>
              </div>
              {/* Fake progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                <div className="h-full bg-blue-500 w-1/3 rounded-r-full"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
