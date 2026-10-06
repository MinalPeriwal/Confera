import { useState, useRef, useEffect } from 'react';
import { X, Send, Paperclip, FileText, Lock, Loader2 } from 'lucide-react';
import { absoluteFileUrl } from '@/lib/api';

export interface ChatEntry {
  id: string;
  from: string;
  sender: string;
  text: string;
  timestamp: string;
  isLocal: boolean;
  private?: boolean;
  /** Display name of the private recipient (for messages we sent) */
  toName?: string;
  attachment?: { name: string; size: number; url: string } | null;
}

interface ChatPanelProps {
  onClose: () => void;
  messages: ChatEntry[];
  /** People we can message privately */
  people: { client_id: string; display_name: string }[];
  /** null = everyone */
  recipient: string | null;
  onRecipientChange: (clientId: string | null) => void;
  onSendMessage: (text: string) => void;
  onAttach: (file: File) => Promise<void>;
  maxFileMb: number;
}

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function ChatPanel({ onClose, messages, people, recipient, onRecipientChange, onSendMessage, onAttach, maxFileMb }: ChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // If the person we were messaging leaves, fall back to everyone
  useEffect(() => {
    if (recipient && !people.some(p => p.client_id === recipient)) onRecipientChange(null);
  }, [recipient, people, onRecipientChange]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try { await onAttach(file); } finally { setUploading(false); }
  };

  return (
    <div className="w-full sm:w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-[calc(100dvh-5rem)] fixed right-0 top-0 z-30 shadow-2xl" data-testid="chat-panel">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
        <h2 className="text-slate-100 font-medium">In-call messages</h2>
        <button onClick={onClose} aria-label="Close chat" className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm text-center">
            No messages yet.<br />Start the conversation!
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex flex-col ${msg.isLocal ? 'items-end' : 'items-start'}`} data-testid="chat-message">
              <span className="text-xs text-slate-400 mb-1 px-1 flex items-center gap-1">
                {msg.private && <Lock className="w-3 h-3 text-amber-400" aria-label="Private message" />}
                {msg.isLocal ? (msg.private ? `You → ${msg.toName ?? 'private'}` : 'You') : (msg.private ? `${msg.sender} (private)` : msg.sender)} • {msg.timestamp}
              </span>
              <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm break-words ${
                msg.isLocal ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'
              } ${msg.private ? 'ring-1 ring-amber-400/60' : ''}`}>
                {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                {msg.attachment && (
                  <a
                    href={absoluteFileUrl(msg.attachment.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={msg.attachment.name}
                    data-testid="chat-attachment"
                    className={`flex items-center gap-2 ${msg.text ? 'mt-2' : ''} p-2 rounded-lg ${msg.isLocal ? 'bg-blue-700/60' : 'bg-slate-700/60'} hover:underline`}
                  >
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{msg.attachment.name}</span>
                    <span className="text-xs opacity-70 flex-shrink-0">{formatSize(msg.attachment.size)}</span>
                  </a>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-slate-800 bg-slate-900/50 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <label htmlFor="chat-recipient">To:</label>
          <select
            id="chat-recipient"
            data-testid="chat-recipient"
            value={recipient ?? ''}
            onChange={(e) => onRecipientChange(e.target.value || null)}
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-500"
          >
            <option value="">Everyone</option>
            {people.map(p => <option key={p.client_id} value={p.client_id}>{p.display_name} (private)</option>)}
          </select>
        </div>
        <div className="relative flex items-center gap-1">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} data-testid="chat-file-input" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label={`Share a file (up to ${maxFileMb} MB)`}
            title={`Share a file (up to ${maxFileMb} MB)`}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
          </button>
          <input
            type="text"
            value={inputText}
            maxLength={2000}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl pl-4 pr-11 py-3 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 text-sm"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            aria-label="Send message"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-500 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
