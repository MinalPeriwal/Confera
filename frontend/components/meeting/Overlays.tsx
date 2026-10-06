export interface FloatingReaction {
  id: string;
  name: string;
  emoji: string;
  /** 0..1 horizontal jitter so simultaneous reactions do not stack exactly */
  offset: number;
}

export interface CaptionLine {
  clientId: string;
  name: string;
  text: string;
}

/** Emoji that float up from the bottom-left of the stage and fade out. */
export function ReactionLayer({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div className="pointer-events-none fixed left-3 sm:left-6 bottom-24 z-30 w-40 h-72" aria-hidden data-testid="reaction-layer">
      <style>{`@keyframes confera-float { 0% { transform: translateY(0) scale(.6); opacity: 0 } 15% { opacity: 1; transform: translateY(-20px) scale(1.1) } 100% { transform: translateY(-240px) scale(1); opacity: 0 } }`}</style>
      {reactions.map(r => (
        <div
          key={r.id}
          data-testid="floating-reaction"
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: `${r.offset * 70}%`, animation: 'confera-float 3.2s ease-out forwards' }}
        >
          <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
          <span className="mt-1 px-2 py-0.5 rounded-full bg-slate-900/80 text-[11px] text-slate-100 max-w-28 truncate">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Live captions shown above the control bar. */
export function CaptionsOverlay({ lines }: { lines: CaptionLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="pointer-events-none fixed left-0 right-0 bottom-24 z-30 flex flex-col items-center gap-1.5 px-4" data-testid="captions">
      {lines.map(l => (
        <p key={l.clientId} className="max-w-2xl px-4 py-2 rounded-xl bg-black/75 text-white text-sm sm:text-base text-center backdrop-blur">
          <span className="font-semibold text-blue-300">{l.name}: </span>{l.text}
        </p>
      ))}
    </div>
  );
}
