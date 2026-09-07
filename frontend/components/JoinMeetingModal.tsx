import { useState } from 'react';
import { X } from 'lucide-react';

interface JoinMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (meetingId: string) => void;
}

export function JoinMeetingModal({ isOpen, onClose, onJoin }: JoinMeetingModalProps) {
  const [meetingId, setMeetingId] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingId.trim()) {
      setError('Meeting ID is required');
      return;
    }
    const normalized = meetingId.replace(/\s/g, '');
    if (!/^\d+$/.test(normalized)) {
      setError('Please enter a valid numeric Meeting ID');
      return;
    }
    setError('');
    onJoin(normalized);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">Join Meeting</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleJoin} className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Meeting ID or Personal Link Name
            </label>
            <input 
              type="text"
              value={meetingId}
              onChange={(e) => {
                setMeetingId(e.target.value);
                setError('');
              }}
              placeholder="e.g. 847 291 563"
              className={`w-full px-4 py-3 border rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${error ? 'border-red-300 focus:ring-red-500' : 'border-slate-200'}`}
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </div>

          <div className="flex gap-3 justify-end">
            <button 
              type="button" 
              onClick={onClose}
              className="px-6 py-2.5 border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={!meetingId.trim()}
            >
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
