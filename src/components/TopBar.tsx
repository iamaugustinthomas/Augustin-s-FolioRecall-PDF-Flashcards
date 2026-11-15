import React from 'react';
import type { AppView } from '../types/flashcard';

interface TopBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  hasCards: boolean;
  totalDue: number;
  onQuickStartReview: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onNavigate,
  hasCards,
  totalDue,
  onQuickStartReview,
}) => {
  const navItems: Array<{ id: AppView; label: string }> = [
    { id: 'decks', label: 'Library' },
    { id: 'import', label: 'Add PDF' },
    { id: 'study', label: 'Study' },
    { id: 'exam', label: 'Exam Plan' },
  ];

  const isNavActive = (id: AppView) => {
    if (id === 'decks' && activeView === 'deck-detail') return true;
    return activeView === id;
  };

  return (
    <header className="sticky top-0 z-30 leather-bar border-b border-black/40">
      <div className="max-w-[1840px] mx-auto px-6 sm:px-10 h-15 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onNavigate('decks')}
          className="font-serif-display text-xl font-semibold tracking-tight text-[#FBF7EE] drop-shadow-[0_-1px_0_rgba(0,0,0,0.6)] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FBF7EE] rounded-sm"
        >
          {"Augustin's FolioRecall"}
        </button>

        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-2 sm:gap-3 overflow-x-auto"
        >
          {navItems.map((item) => {
            const active = isNavActive(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`px-3 py-1.5 text-[13px] font-medium rounded-md whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FBF7EE] ${
                  active
                    ? 'text-[#FFFDF7] bg-black/35 shadow-[inset_0_1px_3px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.12)]'
                    : 'text-[#D6CEC0] hover:text-[#FFFDF7]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          {hasCards ? (
            <button
              type="button"
              onClick={onQuickStartReview}
              className="px-4 py-1.5 text-[13px] font-semibold rounded-md btn-primary-tactile transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              {totalDue > 0 ? `Study Now (${totalDue})` : 'Study Now'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('import')}
              className="px-4 py-1.5 text-[13px] font-semibold rounded-md btn-primary-tactile transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Add PDF
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
