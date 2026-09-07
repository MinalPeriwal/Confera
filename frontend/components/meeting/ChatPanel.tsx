import { useState, useRef, useEffect } from 'react';
import { X, Send } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isLocal: boolean;
}

interface ChatPanelProps {
  onClose: () => void;
  localName: string;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
}

export function ChatPanel({ onClose, localName, messages, onSendMessage }: ChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="w-full sm:w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-[calc(100vh-5rem)] fixed right-0 top-0 z-30 shadow-2xl">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4">
        <h2 className="text-slate-100 font-medium">In-Call Messages</h2>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
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
            <div key={msg.id} className={`flex flex-col ${msg.isLocal ? 'items-end' : 'items-start'}`}>
              <span className="text-xs text-slate-400 mb-1 px-1">
                {msg.isLocal ? 'You' : msg.sender} • {msg.timestamp}
              </span>
              <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${msg.isLocal ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}>
                {msg.text}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className="relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 text-sm"
          />
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-500 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
