import React, { useState } from 'react';
import { Award, Flame, Target, Trash2 } from 'lucide-react';
import type { Deck, Flashcard, StudySessionRecord } from '../types/flashcard';
import {
  calculateDeckReadiness,
  diffDays,
  formatShortDate,
  getLocalDateString,
  isCardDue,
} from '../lib/spacedRepetition';
import { getRankInfo, type RewardProfile } from '../lib/rewards';
import { isSupportedStudyFile } from '../lib/documentFiles';
import { DocumentPageView } from './DocumentPageView';
import { MetricTooltip } from './MetricTooltip';

interface DecksViewProps {
  decks: Deck[];
  cards: Flashcard[];
  sessions: StudySessionRecord[];
  rewardProfile: RewardProfile;
  onStartStudy: (deckId: string, mode: 'due' | 'cram') => void;
  onOpenExamPlan: (deckId: string) => void;
  onOpenDeckDetail: (deckId: string) => void;
  onDeleteDeck: (deckId: string) => Promise<void>;
  onGoToImport: () => void;
  onDropPdfFiles: (files: File[]) => Promise<void>;
  onCreateManualDeck: (title: string, examDate: string | null) => Promise<void>;
  onRunSamplePdfImport: () => Promise<void>;
  isImportingSample: boolean;
}

export const DecksView: React.FC<DecksViewProps> = ({
  decks,
  cards,
  sessions,
  rewardProfile,
  onStartStudy,
  onOpenExamPlan,
  onOpenDeckDetail,
  onDeleteDeck,
  onGoToImport,
  onDropPdfFiles,
  onCreateManualDeck,
  onRunSamplePdfImport,
  isImportingSample,
}) => {
  const rank = getRankInfo(rewardProfile.totalXp);
  const dailyGoalPct = Math.min(
    100,
    Math.round((rewardProfile.todayCardsReviewed / Math.max(1, rewardProfile.dailyGoal)) * 100)
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showNewDeckForm, setShowNewDeckForm] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckExamDate, setNewDeckExamDate] = useState('');

  const todayStr = getLocalDateString();
  const totalDueToday = cards.filter((c) => isCardDue(c, todayStr)).length;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      isSupportedStudyFile(f)
    );
    if (files.length > 0) {
      void onDropPdfFiles(files);
    }
  };

  const handleCreateDeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckTitle.trim()) return;
    await onCreateManualDeck(newDeckTitle.trim(), newDeckExamDate || null);
    setNewDeckTitle('');
    setNewDeckExamDate('');
    setShowNewDeckForm(false);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
      className={`space-y-12 transition-opacity duration-150 ${
        isDraggingOver ? 'opacity-80' : 'opacity-100'
      }`}
    >
      {decks.length === 0 ? (
        /* Tactile Physical Index-Card Empty Desk */
        <section className="py-6 sm:py-12 text-center space-y-12">
          <div className="max-w-xl mx-auto space-y-4">
            <h1 className="font-serif-display text-4xl sm:text-5xl font-semibold tracking-tight text-[#1F1A14] leading-[1.1] text-balance drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]">
              Drop a PDF, DOCX, or CSV. Start recalling.
            </h1>
            <p className="text-base sm:text-lg text-[#564D40] leading-relaxed text-balance">
              PDF &amp; DOCX pair odd/even pages as-is. CSV imports Question &amp; Answer rows onto
              ruled index cards. Stored privately on your device.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-3">
              <button
                type="button"
                onClick={onGoToImport}
                className="px-6 py-2.5 text-sm font-semibold rounded-lg btn-primary-tactile transition-all cursor-pointer"
              >
                Choose Files
              </button>

              <button
                type="button"
                disabled={isImportingSample}
                onClick={onRunSamplePdfImport}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg btn-ivory-tactile transition-all cursor-pointer disabled:opacity-50"
              >
                {isImportingSample ? 'Loading sample…' : 'Try Sample Deck'}
              </button>
            </div>
          </div>

          {/* Physical Tilted Index Card Specimen on the Linen Desk */}
          <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 text-left px-2">
            <div className="paper-sheet rounded-md overflow-hidden sm:-rotate-1">
              <div className="px-5 py-2.5 border-b border-rose-300/80 flex items-center justify-between font-mono text-[11px] text-[#6E6354]">
                <span>PAGE 01 · ODD</span>
                <span>QUESTION</span>
              </div>
              <div className="p-6 ruled-paper min-h-[210px] flex flex-col justify-between">
                <p className="font-serif-display text-lg font-medium text-[#1F1A14] leading-[28px]">
                  How does spaced repetition defeat the Ebbinghaus forgetting curve?
                </p>
                <span className="font-mono text-[11px] text-[#7A6F5E]">
                  Rendered from PDF, DOCX, or CSV
                </span>
              </div>
            </div>

            <div className="paper-sheet rounded-md overflow-hidden sm:rotate-1 sm:translate-y-4">
              <div className="px-5 py-2.5 border-b border-emerald-400/70 flex items-center justify-between font-mono text-[11px] text-[#17643A]">
                <span>PAGE 02 · EVEN</span>
                <span>ANSWER</span>
              </div>
              <div className="p-6 ruled-paper min-h-[210px] flex flex-col justify-between">
                <p className="text-sm text-[#2A241C] leading-[28px]">
                  Reviewing right before retention drops resets recall and expands memory stability
                  leading up to exam day.
                </p>
                <span className="font-mono text-[11px] text-[#7A6F5E]">
                  Revealed on active recall
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* Populated Linen Study Desk with Stacked Card Decks */
        <div className="space-y-10">
          <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-serif-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#1F1A14] drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]">
                Desk Library
              </h1>
              <p className="font-mono text-xs text-[#5B5245] tabular-nums">
                {decks.length} {decks.length === 1 ? 'deck' : 'decks'}
                <span aria-hidden="true"> · </span>
                {cards.length} {cards.length === 1 ? 'card' : 'cards'}
                <span aria-hidden="true"> · </span>
                <span className={totalDueToday > 0 ? 'text-[#174BB8] font-semibold' : ''}>
                  {totalDueToday} due today
                </span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowNewDeckForm((v) => !v)}
                className="px-4 py-2 text-xs font-semibold rounded-lg btn-ivory-tactile transition-all cursor-pointer"
              >
                New Blank Deck
              </button>
              <button
                type="button"
                onClick={onGoToImport}
                className="px-4 py-2 text-xs font-semibold rounded-lg btn-primary-tactile transition-all cursor-pointer"
              >
                Add File
              </button>
            </div>
          </section>

          {/* Engraved Scholar Mastery & Streak Plaque */}
          <section className="paper-sheet rounded-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <MetricTooltip
                align="left"
                placement="bottom"
                title={`Scholar Rank: Level ${rank.level} ${rank.title}`}
                meaning="Earn XP on every flashcard you grade (Easy +35 XP, Good +25 XP, Hard +15 XP, Forgot +5 XP), plus combo streak and note bonuses."
                detail={`${rewardProfile.totalXp.toLocaleString()} total XP · ${rank.xpToNext} XP to next rank`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <span className="brass-plaque rounded-md px-2.5 py-1 font-mono text-xs font-bold inline-flex items-center gap-1.5 tabular-nums">
                    <Award className="w-3.5 h-3.5" aria-hidden="true" />
                    Lv. {rank.level} · {rank.title}
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#1F1A14] tabular-nums">
                    {rewardProfile.totalXp.toLocaleString()} XP
                  </span>
                </span>
              </MetricTooltip>

              <div className="hidden sm:flex items-center gap-2 w-36">
                <div className="recessed-well h-2 flex-1 rounded-full overflow-hidden p-[1px]">
                  <div
                    className="h-full gold-meter rounded-full transition-all duration-300"
                    style={{ width: `${rank.progressPct}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] text-[#6B6153] tabular-nums">
                  {rank.progressPct}%
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 font-mono text-xs tabular-nums">
              <MetricTooltip
                align="right"
                placement="bottom"
                title="Daily Study Streak"
                meaning="Consecutive calendar days with at least one active recall card reviewed."
                detail={`Best recall combo: ${rewardProfile.bestCombo}× · Lifetime cards: ${rewardProfile.cardsReviewedTotal}`}
              >
                <span className="inline-flex items-center gap-1.5 text-[#9A3412] font-semibold">
                  <Flame className="w-3.5 h-3.5 text-[#D97706]" aria-hidden="true" />
                  {rewardProfile.dailyStreak}{' '}
                  {rewardProfile.dailyStreak === 1 ? 'day streak' : 'days streak'}
                </span>
              </MetricTooltip>

              <MetricTooltip
                align="right"
                placement="bottom"
                title="Today's Card Goal"
                meaning="Daily active-recall target to keep memory consolidation consistent without cramming."
                detail={`${rewardProfile.todayCardsReviewed} of ${rewardProfile.dailyGoal} cards completed today (${dailyGoalPct}%)`}
              >
                <span
                  className={`inline-flex items-center gap-1.5 font-semibold ${
                    dailyGoalPct >= 100 ? 'text-[#166534]' : 'text-[#564D40]'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" aria-hidden="true" />
                  Today: {rewardProfile.todayCardsReviewed}/{rewardProfile.dailyGoal}
                </span>
              </MetricTooltip>
            </div>
          </section>

          {showNewDeckForm && (
            <form
              onSubmit={handleCreateDeckSubmit}
              className="paper-sheet rounded-lg p-6 space-y-4 max-w-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-serif-display text-lg font-semibold text-[#1F1A14]">
                  New Blank Deck
                </h2>
                <button
                  type="button"
                  onClick={() => setShowNewDeckForm(false)}
                  className="text-xs font-medium text-[#6B6153] hover:text-[#1F1A14] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="manual-deck-title"
                    className="block text-xs font-semibold text-[#564D40] mb-1.5"
                  >
                    Title
                  </label>
                  <input
                    id="manual-deck-title"
                    type="text"
                    required
                    value={newDeckTitle}
                    onChange={(e) => setNewDeckTitle(e.target.value)}
                    placeholder="e.g. Neuroanatomy Midterm"
                    className="w-full px-3.5 py-2 text-sm rounded-md recessed-input text-[#1F1A14] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                  />
                </div>
                <div>
                  <label
                    htmlFor="manual-deck-exam"
                    className="block text-xs font-semibold text-[#564D40] mb-1.5"
                  >
                    Exam Date
                  </label>
                  <input
                    id="manual-deck-exam"
                    type="date"
                    min={todayStr}
                    value={newDeckExamDate}
                    onChange={(e) => setNewDeckExamDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-md recessed-input text-[#1F1A14] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-md btn-dark-key cursor-pointer"
                >
                  Create Deck
                </button>
              </div>
            </form>
          )}

          {/* Stacked Paper Deck Cards */}
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {decks.map((deck) => {
              const deckCards = cards.filter((c) => c.deckId === deck.id);
              const firstPdfCard = deckCards.find((c) => c.pdfFileId && c.questionPage);
              const firstTextCard = !firstPdfCard
                ? deckCards.find((c) => Boolean(c.questionText))
                : undefined;
              const dueCount = deckCards.filter((c) => isCardDue(c, todayStr)).length;
              const readiness = calculateDeckReadiness(
                deckCards,
                deck.examDate,
                deck.targetRetention,
                todayStr
              );
              const daysLeft = deck.examDate ? diffDays(deck.examDate, todayStr) : null;

              return (
                <article
                  key={deck.id}
                  className="deck-stack rounded-lg p-5 flex flex-col justify-between gap-5"
                >
                  <div className="flex gap-5 items-start">
                    {firstPdfCard ? (
                      <div className="w-24 shrink-0 rounded-sm overflow-hidden border border-[#C3BBA9] shadow-[0_2px_6px_rgba(30,22,12,0.16)] bg-white">
                        <DocumentPageView
                          fileId={firstPdfCard.pdfFileId!}
                          documentKind={firstPdfCard.documentKind}
                          sourceFileName={firstPdfCard.sourceFileName}
                          pageNumber={firstPdfCard.questionPage!}
                          fitMode="contain"
                          maxHeightPx={136}
                        />
                      </div>
                    ) : firstTextCard ? (
                      <div className="w-24 h-[136px] shrink-0 rounded-sm overflow-hidden border border-[#C3BBA9] shadow-[0_2px_6px_rgba(30,22,12,0.16)] bg-[#FCFBF7] flex flex-col">
                        <div className="px-2 py-1 border-b border-rose-300/80 font-mono text-[8px] text-[#6E6354]">
                          CARD 01
                        </div>
                        <div className="p-2 ruled-paper flex-1 overflow-hidden">
                          <p className="font-serif-display text-[9px] leading-snug text-[#1F1A14] line-clamp-6">
                            {firstTextCard.questionText}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-serif-display text-xl font-semibold text-[#1F1A14] leading-snug truncate">
                          {deck.title}
                        </h2>
                        <MetricTooltip
                          align="right"
                          placement="top"
                          title={
                            deck.examDate && (daysLeft === null || daysLeft >= 0)
                              ? 'Projected Exam-Day Readiness'
                              : 'Current Memory Retention'
                          }
                          meaning={
                            deck.examDate && (daysLeft === null || daysLeft >= 0)
                              ? `Estimated share of cards in this deck you will recall on ${formatShortDate(
                                  deck.examDate
                                )} if you follow its daily spaced review schedule.`
                              : deckCards.some((c) => c.reps > 0)
                              ? 'Average current memory retention across all cards in this deck based on your past reviews and elapsed days.'
                              : 'No cards have been reviewed yet. Complete a study session or set an exam date to project readiness.'
                          }
                          detail={
                            deck.examDate
                              ? `Target goal: ${Math.round(deck.targetRetention * 100)}% · ${
                                  deckCards.length
                                } cards`
                              : `${deckCards.filter((c) => c.reps > 0).length}/${
                                  deckCards.length
                                } cards studied`
                          }
                        >
                          <span
                            className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${
                              readiness >= 85
                                ? 'text-[#166534]'
                                : readiness >= 60
                                ? 'text-[#B45309]'
                                : 'text-[#5B5245]'
                            }`}
                          >
                            {readiness}%
                          </span>
                        </MetricTooltip>
                      </div>

                      <p className="font-mono text-xs text-[#6B6153] tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>
                          {deckCards.length} {deckCards.length === 1 ? 'card' : 'cards'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={dueCount > 0 ? 'text-[#174BB8] font-semibold' : ''}>
                          {dueCount} due
                        </span>
                        {deck.examDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              Exam {formatShortDate(deck.examDate)}
                              {daysLeft !== null && daysLeft >= 0 ? ` (${daysLeft}d)` : ''}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-[#DED8C8]">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={deckCards.length === 0}
                        onClick={() => onStartStudy(deck.id, dueCount > 0 ? 'due' : 'cram')}
                        className="px-4 py-1.5 text-xs font-semibold rounded-md btn-primary-tactile transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {dueCount > 0 ? `Study (${dueCount})` : 'Quiz All'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenExamPlan(deck.id)}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-md btn-ivory-tactile transition-all cursor-pointer"
                      >
                        {deck.examDate ? 'Schedule' : 'Set Exam'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenDeckDetail(deck.id)}
                        className="px-2.5 py-1.5 text-xs font-medium text-[#564D40] hover:text-[#1F1A14] underline-offset-4 hover:underline transition-colors cursor-pointer"
                      >
                        Cards
                      </button>
                    </div>

                    {confirmDeleteId === deck.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteDeck(deck.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-gradient-to-b from-[#DF3333] to-[#B11A1A] border border-[#8E1212] rounded-md shadow-sm cursor-pointer"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs text-[#6B6153] hover:text-[#1F1A14] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete ${deck.title}`}
                        onClick={() => setConfirmDeleteId(deck.id)}
                        className="p-1.5 text-[#7A6F5E] hover:text-[#B11A1A] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          {/* Bound Score Ledger */}
          {sessions.length > 0 && (
            <section className="space-y-3 pt-2">
              <h2 className="font-serif-display text-xl font-semibold text-[#1F1A14]">
                Recent Quiz Ledger
              </h2>
              <div className="paper-sheet rounded-lg divide-y divide-[#E4DFD2]">
                {sessions.slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1F1A14] truncate">{s.deckTitle}</p>
                      <p className="font-mono text-xs text-[#6B6153] tabular-nums">
                        {s.totalCards} cards · {Math.floor(s.durationSeconds / 60)}m{' '}
                        {s.durationSeconds % 60}s · {new Date(s.completedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <MetricTooltip
                      align="right"
                      placement="top"
                      title="Active Recall Quiz Score"
                      meaning="Weighted accuracy score across all cards graded in this session (Easy = 100%, Good = 90%, Hard = 60%, Forgot = 0%)."
                      detail={`Easy ${s.counts.easy} · Good ${s.counts.good} · Hard ${s.counts.hard} · Forgot ${s.counts.again}`}
                    >
                      <span
                        className={`font-mono text-base font-semibold tabular-nums ${
                          s.scorePercent >= 80
                            ? 'text-[#166534]'
                            : s.scorePercent >= 60
                            ? 'text-[#B45309]'
                            : 'text-[#B91C1C]'
                        }`}
                      >
                        {s.scorePercent}%
                      </span>
                    </MetricTooltip>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
