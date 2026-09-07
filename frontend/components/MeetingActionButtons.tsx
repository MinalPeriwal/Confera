import { Video, PlusSquare, Calendar, MonitorUp } from 'lucide-react';

interface MeetingActionButtonsProps {
  onNewMeeting: () => void;
  onJoinMeeting: () => void;
  onScheduleMeeting: () => void;
  isCreating: boolean;
}

export function MeetingActionButtons({ onNewMeeting, onJoinMeeting, onScheduleMeeting, isCreating }: MeetingActionButtonsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mb-12">
      {/* New Meeting */}
      <button 
        onClick={onNewMeeting}
        disabled={isCreating}
        className="flex flex-col items-center gap-3 group disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-md shadow-orange-500/20 group-hover:bg-orange-600 transition-colors group-hover:shadow-lg group-hover:-translate-y-0.5 duration-200">
          <Video className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>
        <span className="font-medium text-slate-700 text-sm sm:text-base">
          {isCreating ? 'Starting...' : 'New Meeting'}
        </span>
      </button>

      {/* Join Meeting */}
      <button 
        onClick={onJoinMeeting}
        className="flex flex-col items-center gap-3 group"
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/20 group-hover:bg-blue-700 transition-colors group-hover:shadow-lg group-hover:-translate-y-0.5 duration-200">
          <PlusSquare className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>
        <span className="font-medium text-slate-700 text-sm sm:text-base">
          Join
        </span>
      </button>

      {/* Schedule Meeting */}
      <button 
        onClick={onScheduleMeeting}
        className="flex flex-col items-center gap-3 group"
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/20 group-hover:bg-blue-700 transition-colors group-hover:shadow-lg group-hover:-translate-y-0.5 duration-200">
          <Calendar className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>
        <span className="font-medium text-slate-700 text-sm sm:text-base">
          Schedule
        </span>
      </button>

      {/* Share Screen (Placeholder for MVP) */}
      <button 
        onClick={() => {}}
        className="flex flex-col items-center gap-3 group"
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/20 group-hover:bg-blue-700 transition-colors group-hover:shadow-lg group-hover:-translate-y-0.5 duration-200">
          <MonitorUp className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>
        <span className="font-medium text-slate-700 text-sm sm:text-base">
          Share Screen
        </span>
      </button>
    </div>
  );
}
