import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Flame,
  Maximize2,
  Minimize2,
  Sparkles,
  Target,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  Deck,
  Flashcard,
  RecallGrade,
  StudySessionRecord,
} from '../types/flashcard';
import {
  applyCardGrade,
  computeSessionScore,
  getLocalDateString,
  isCardDue,
  previewGradeOutcome,
} from '../lib/spacedRepetition';
import {
  computeCardReward,
  getComboMultiplier,
  getRankInfo,
  playCardRewardSequence,
  playRewardSound,
  recordCardReward,
  type CardRewardOutcome,
  type RankInfo,
  type RewardProfile,
} from '../lib/rewards';
import { PdfPageCanvas } from './PdfPageCanvas';
import { MetricTooltip } from './MetricTooltip';

interface StudyViewProps {
  decks: Deck[];
  cards: Flashcard[];
  selectedDeckId: string | null;
  initialMode: 'due' | 'cram' | 'weak';
  rewardProfile: RewardProfile;
  onRewardProfileUpdated: (next: RewardProfile) => void;
  onToggleSound: () => void;
  onSelectDeck: (deckId: string) => void;
  onCardUpdated: (updated: Flashcard) => Promise<void>;
  onSessionCompleted: (session: StudySessionRecord) => Promise<void>;
  onOpenExamPlan: (deckId: string) => void;
  onBackToDecks: () => void;
}

export const StudyView: React.FC<StudyViewProps> = ({
  decks,
  cards,
  selectedDeckId,
  initialMode,
  rewardProfile,
  onRewardProfileUpdated,
  onToggleSound,
  onSelectDeck,
  onCardUpdated,
  onSessionCompleted,
  onOpenExamPlan,
  onBackToDecks,
}) => {
  const activeDeck = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) ?? decks[0] ?? null,
    [decks, selectedDeckId]
  );

  const [mode, setMode] = useState<'due' | 'cram' | 'weak'>(initialMode);
  const [fitMode, setFitMode] = useState<'contain' | 'width'>('contain');
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 1440
  );
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isAnswerFullscreen, setIsAnswerFullscreen] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [recallNote, setRecallNote] = useState('');
  const [sessionStartMs, setSessionStartMs] = useState<number>(() => Date.now());
  const [gradeCounts, setGradeCounts] = useState<Record<RecallGrade, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });
  const [missedIds, setMissedIds] = useState<string[]>([]);
  const [completedRecord, setCompletedRecord] = useState<StudySessionRecord | null>(null);
  const [sessionXp, setSessionXp] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestSessionCombo, setBestSessionCombo] = useState(0);
  const [rewardToast, setRewardToast] = useState<{
    reward: CardRewardOutcome;
    leveledUp: boolean;
    newRank: RankInfo;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Budget vertical space so full A4 sheets fit cleanly on 2K (1440p) and 1080p screens without scrolling
  const availableSheetHeight = useMemo(() => {
    const chromeOverhead = isRevealed ? 380 : showScratchpad ? 410 : 332;
    return Math.max(380, viewportHeight - chromeOverhead);
  }, [viewportHeight, isRevealed, showScratchpad]);

  const todayStr = getLocalDateString();

  const deckCards = useMemo(
    () => (activeDeck ? cards.filter((c) => c.deckId === activeDeck.id) : []),
    [cards, activeDeck]
  );

  const buildQueue = (targetMode: 'due' | 'cram' | 'weak', sourceCards: Flashcard[]) => {
    if (targetMode === 'due') {
      return sourceCards.filter((c) => isCardDue(c, todayStr)).map((c) => c.id);
    }
    if (targetMode === 'weak') {
      const weak = [...sourceCards]
        .filter(
          (c) =>
            c.lapses > 0 ||
            c.lastGrade === 'again' ||
            c.lastGrade === 'hard' ||
            c.reps === 0
        )
        .sort((a, b) => a.stabilityDays - b.stabilityDays);
      return (weak.length > 0 ? weak : sourceCards).map((c) => c.id);
    }
    return sourceCards.map((c) => c.id);
  };

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!activeDeck) {
      setQueueIds([]);
      return;
    }
    const nextQueue = buildQueue(mode, deckCards);
    setQueueIds(nextQueue);
    setCurrentIndex(0);
    setIsRevealed(false);
    setIsAnswerFullscreen(false);
    setRecallNote('');
    setSessionStartMs(Date.now());
    setGradeCounts({ again: 0, hard: 0, good: 0, easy: 0 });
    setMissedIds([]);
    setCompletedRecord(null);
    setSessionXp(0);
    setCombo(0);
    setBestSessionCombo(0);
    setRewardToast(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeck?.id, mode]);

  const currentCard = useMemo(() => {
    const id = queueIds[currentIndex];
    return deckCards.find((c) => c.id === id) ?? null;
  }, [queueIds, currentIndex, deckCards]);

  const handleReveal = () => {
    if (rewardProfile.soundEnabled) {
      playRewardSound('reveal');
    }
    setIsRevealed(true);
  };

  const handleGrade = async (grade: RecallGrade) => {
    if (!currentCard || !activeDeck) return;

    const reward = computeCardReward({
      grade,
      currentCombo: combo,
      usedScratchpad: recallNote.trim().length > 0,
      isNewCard: currentCard.reps === 0,
    });
    const prevTodayCount = rewardProfile.todayCardsReviewed;
    const { updatedProfile, leveledUp, newRank } = recordCardReward(rewardProfile, reward);
    const hitDailyGoal =
      prevTodayCount < rewardProfile.dailyGoal &&
      updatedProfile.todayCardsReviewed >= updatedProfile.dailyGoal;

    onRewardProfileUpdated(updatedProfile);
    setSessionXp((prev) => prev + reward.totalXp);
    setCombo(reward.nextCombo);
    setBestSessionCombo((prev) => Math.max(prev, reward.nextCombo));

    setRewardToast({ reward, leveledUp, newRank });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setRewardToast(null);
    }, 1900);

    if (rewardProfile.soundEnabled) {
      playCardRewardSequence({
        reward,
        leveledUp,
        hitDailyGoal,
      });
    }

    const updatedCard = applyCardGrade(
      currentCard,
      grade,
      activeDeck.examDate,
      activeDeck.targetRetention
    );
    await onCardUpdated(updatedCard);

    const nextCounts: Record<RecallGrade, number> = {
      ...gradeCounts,
      [grade]: gradeCounts[grade] + 1,
    };
    setGradeCounts(nextCounts);

    const nextMissed =
      grade === 'again'
        ? Array.from(new Set([...missedIds, currentCard.id]))
        : missedIds;
    setMissedIds(nextMissed);

    const nextIdx = currentIndex + 1;
    if (nextIdx >= queueIds.length) {
      const durationSeconds = Math.max(1, Math.round((Date.now() - sessionStartMs) / 1000));
      const totalReviewed =
        nextCounts.again + nextCounts.hard + nextCounts.good + nextCounts.easy;
      const scorePercent = computeSessionScore(nextCounts);

      const record: StudySessionRecord = {
        id: crypto.randomUUID(),
        deckId: activeDeck.id,
        deckTitle: activeDeck.title,
        mode,
        completedAt: new Date().toISOString(),
        durationSeconds,
        totalCards: totalReviewed,
        counts: nextCounts,
        scorePercent,
      };
      await onSessionCompleted(record);
      if (rewardProfile.soundEnabled && !leveledUp) {
        playRewardSound('complete');
      }
      setIsAnswerFullscreen(false);
      setCompletedRecord(record);
    } else {
      setCurrentIndex(nextIdx);
      setIsRevealed(false);
      setIsAnswerFullscreen(false);
      setRecallNote('');
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') {
        return;
      }
      if (e.key === 'Escape' && isAnswerFullscreen) {
        e.preventDefault();
        setIsAnswerFullscreen(false);
        return;
      }
      if (completedRecord || !currentCard) return;

      if (e.code === 'Space' && !isRevealed) {
        e.preventDefault();
        handleReveal();
      } else if (isRevealed) {
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          setIsAnswerFullscreen((v) => !v);
          return;
        }
        if (e.key === '1') void handleGrade('again');
        if (e.key === '2') void handleGrade('hard');
        if (e.key === '3') void handleGrade('good');
        if (e.key === '4') void handleGrade('easy');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRevealed, isAnswerFullscreen, completedRecord, currentCard, currentIndex, queueIds]);

  const restartWithIds = (ids: string[]) => {
    setQueueIds(ids);
    setCurrentIndex(0);
    setIsRevealed(false);
    setIsAnswerFullscreen(false);
    setRecallNote('');
    setSessionStartMs(Date.now());
    setGradeCounts({ again: 0, hard: 0, good: 0, easy: 0 });
    setMissedIds([]);
    setCompletedRecord(null);
    setSessionXp(0);
    setCombo(0);
    setBestSessionCombo(0);
    setRewardToast(null);
  };

  if (!activeDeck) {
    return (
      <div className="max-w-md mx-auto paper-sheet rounded-lg p-10 text-center space-y-4">
        <h1 className="font-serif-display text-2xl font-semibold text-[#1F1A14]">
          No deck selected
        </h1>
        <p className="text-sm text-[#564D40]">Add a PDF to your library to start studying.</p>
        <button
          type="button"
          onClick={onBackToDecks}
          className="px-5 py-2 text-sm font-semibold rounded-md btn-primary-tactile cursor-pointer"
        >
          Open Library
        </button>
      </div>
    );
  }

  const gradePreviews = currentCard
    ? {
        again: previewGradeOutcome(
          currentCard,
          'again',
          activeDeck.examDate,
          activeDeck.targetRetention,
          todayStr
        ),
        hard: previewGradeOutcome(
          currentCard,
          'hard',
          activeDeck.examDate,
          activeDeck.targetRetention,
          todayStr
        ),
        good: previewGradeOutcome(
          currentCard,
          'good',
          activeDeck.examDate,
          activeDeck.targetRetention,
          todayStr
        ),
        easy: previewGradeOutcome(
          currentCard,
          'easy',
          activeDeck.examDate,
          activeDeck.targetRetention,
          todayStr
        ),
      }
    : null;

  const rankInfo = getRankInfo(rewardProfile.totalXp);
  const comboMultiplier = getComboMultiplier(combo);
  const rewardPreviewForGrade = (grade: RecallGrade) =>
    currentCard
      ? computeCardReward({
          grade,
          currentCombo: combo,
          usedScratchpad: recallNote.trim().length > 0,
          isNewCard: currentCard.reps === 0,
        })
      : null;

  const fullscreenSheetHeight = Math.max(460, viewportHeight - 175);

  return (
    <div className="space-y-3.5 relative">
      {/* Floating Per-Card Dopamine Reward Stamp */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[60]">
        <AnimatePresence mode="wait">
          {rewardToast && (
            <motion.div
              key={rewardToast.reward.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              className="paper-sheet rounded-lg p-3.5 w-72 shadow-[0_18px_36px_-10px_rgba(24,18,10,0.45)] border-[#B8933A]"
            >
              {rewardToast.leveledUp && (
                <div className="brass-plaque rounded-md px-2.5 py-1 mb-2 text-[11px] font-mono font-bold flex items-center justify-between">
                  <span>RANK PROMOTED!</span>
                  <span>
                    Lv. {rewardToast.newRank.level} · {rewardToast.newRank.title}
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-serif-display text-sm font-semibold text-[#1F1A14] leading-tight">
                    {rewardToast.reward.headline}
                  </p>
                  <p className="text-[11px] text-[#564D40] mt-0.5">
                    {rewardToast.reward.subline}
                  </p>
                </div>

                <span className="brass-plaque rounded-md px-2.5 py-1 font-mono text-sm font-bold shrink-0 tabular-nums inline-flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />+
                  {rewardToast.reward.totalXp} XP
                </span>
              </div>

              {(rewardToast.reward.comboBonusXp > 0 ||
                rewardToast.reward.scratchpadBonusXp > 0 ||
                rewardToast.reward.newCardBonusXp > 0) && (
                <div className="mt-2 pt-1.5 border-t border-[#E5DFD2] flex flex-wrap gap-2 font-mono text-[10px] text-[#5B5245] tabular-nums">
                  {rewardToast.reward.comboBonusXp > 0 && (
                    <span className="text-[#B45309] font-semibold">
                      {rewardToast.reward.comboMultiplier}× Streak (+
                      {rewardToast.reward.comboBonusXp})
                    </span>
                  )}
                  {rewardToast.reward.scratchpadBonusXp > 0 && (
                    <span className="text-[#174BB8] font-semibold">
                      Recall Note (+{rewardToast.reward.scratchpadBonusXp})
                    </span>
                  )}
                  {rewardToast.reward.newCardBonusXp > 0 && (
                    <span className="text-[#166534] font-semibold">
                      New Card (+{rewardToast.reward.newCardBonusXp})
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tactile Desk Toolbar & Per-Card Reward Meter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            aria-label="Active study deck"
            value={activeDeck.id}
            onChange={(e) => onSelectDeck(e.target.value)}
            className="px-3.5 py-1.5 text-sm font-semibold rounded-md btn-ivory-tactile focus:outline-none cursor-pointer"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>

          {!completedRecord && queueIds.length > 0 && (
            <span className="font-mono text-xs text-[#5B5245] tabular-nums">
              Card {currentIndex + 1} of {queueIds.length}
            </span>
          )}
        </div>

        {/* Live Scholar XP, Combo & Goal HUD */}
        <div className="paper-sheet rounded-lg px-3.5 py-1.5 flex flex-wrap items-center gap-3.5 text-xs">
          <MetricTooltip
            align="center"
            placement="bottom"
            title={`Level ${rankInfo.level} · ${rankInfo.title}`}
            meaning="Every card graded immediately awards Mastery XP. Consecutive Easy/Good/Hard recalls multiply your per-card XP!"
            detail={`${rewardProfile.totalXp.toLocaleString()} total XP · ${rankInfo.xpToNext} XP to next rank`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="brass-plaque rounded px-2 py-0.5 font-mono text-[11px] font-bold inline-flex items-center gap-1 tabular-nums">
                <Award className="w-3 h-3" aria-hidden="true" />
                Lv.{rankInfo.level}
              </span>
              <span className="recessed-well w-20 h-2 rounded-full overflow-hidden p-[1px] hidden sm:inline-block">
                <span
                  className="block h-full gold-meter rounded-full transition-all duration-300"
                  style={{ width: `${rankInfo.progressPct}%` }}
                />
              </span>
              <span className="font-mono font-semibold text-[#1F1A14] tabular-nums">
                +{sessionXp} XP
              </span>
            </span>
          </MetricTooltip>

          <span className="h-3.5 w-px bg-[#D7D0C0]" aria-hidden="true" />

          <MetricTooltip
            align="center"
            placement="bottom"
            title="Recall Streak Multiplier"
            meaning="Grade consecutive cards Hard, Good, or Easy without forgetting to boost XP rewards up to 2.0× per card."
            detail={`3+ streak = 1.25× · 5+ = 1.5× · 8+ = 2.0× (Current: ${combo}×)`}
          >
            <span
              className={`font-mono font-semibold inline-flex items-center gap-1 tabular-nums ${
                combo >= 3
                  ? 'text-[#B45309]'
                  : combo >= 1
                  ? 'text-[#1F1A14]'
                  : 'text-[#6B6153]'
              }`}
            >
              <Flame
                className={`w-3.5 h-3.5 ${
                  combo >= 3 ? 'text-[#D97706]' : 'text-[#8C8170]'
                }`}
                aria-hidden="true"
              />
              {combo}×{comboMultiplier > 1 ? ` (${comboMultiplier}× XP)` : ' streak'}
            </span>
          </MetricTooltip>

          <span className="h-3.5 w-px bg-[#D7D0C0] hidden md:inline-block" aria-hidden="true" />

          <MetricTooltip
            align="right"
            placement="bottom"
            title="Daily Recall Target"
            meaning="Number of cards actively reviewed today toward your daily study habit goal."
            detail={`${rewardProfile.todayCardsReviewed} / ${rewardProfile.dailyGoal} cards today`}
          >
            <span
              className={`hidden md:inline-flex items-center gap-1 font-mono font-semibold tabular-nums ${
                rewardProfile.todayCardsReviewed >= rewardProfile.dailyGoal
                  ? 'text-[#166534]'
                  : 'text-[#564D40]'
              }`}
            >
              <Target className="w-3.5 h-3.5" aria-hidden="true" />
              {rewardProfile.todayCardsReviewed}/{rewardProfile.dailyGoal}
            </span>
          </MetricTooltip>

          <button
            type="button"
            onClick={onToggleSound}
            aria-label={rewardProfile.soundEnabled ? 'Mute reward chimes' : 'Enable reward chimes'}
            title={rewardProfile.soundEnabled ? 'Reward sounds on' : 'Reward sounds muted'}
            className="p-1 rounded hover:bg-[#EAE4D6] text-[#564D40] hover:text-[#1F1A14] transition-colors cursor-pointer"
          >
            {rewardProfile.soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="recessed-well flex items-center p-1 rounded-lg gap-1">
            <button
              type="button"
              onClick={() => setFitMode('contain')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                fitMode === 'contain'
                  ? 'btn-ivory-tactile'
                  : 'text-[#564D40] hover:text-[#1F1A14]'
              }`}
            >
              Full A4 Page
            </button>
            <button
              type="button"
              onClick={() => setFitMode('width')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                fitMode === 'width'
                  ? 'btn-ivory-tactile'
                  : 'text-[#564D40] hover:text-[#1F1A14]'
              }`}
            >
              Fit Width
            </button>
          </div>

          <div className="recessed-well flex items-center p-1 rounded-lg gap-1">
            {(
              [
                { id: 'due', label: 'Due' },
                { id: 'cram', label: 'All Cards' },
                { id: 'weak', label: 'Weakest' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  mode === m.id
                    ? 'btn-ivory-tactile'
                    : 'text-[#564D40] hover:text-[#1F1A14]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Session Completed Score Plaque */}
      {completedRecord ? (
        <section className="max-w-lg mx-auto paper-sheet rounded-lg p-8 sm:p-10 text-center space-y-6 my-6">
          <div className="space-y-1">
            <p className="font-mono text-xs text-[#6B6153]">{completedRecord.deckTitle}</p>
            <div className="flex justify-center">
              <MetricTooltip
                align="center"
                placement="bottom"
                title="Active Recall Quiz Score"
                meaning="Weighted session recall percentage calculated from your self-grades across every card in this quiz."
                detail="Weights: Easy 100% · Good 90% · Hard 60% · Forgot 0%"
              >
                <p
                  className={`font-mono text-6xl font-semibold tracking-tight tabular-nums ${
                    completedRecord.scorePercent >= 80
                      ? 'text-[#166534]'
                      : completedRecord.scorePercent >= 60
                      ? 'text-[#B45309]'
                      : 'text-[#B91C1C]'
                  }`}
                >
                  {completedRecord.scorePercent}%
                </p>
              </MetricTooltip>
            </div>
            <p className="font-mono text-xs text-[#5B5245] tabular-nums pt-1">
              {completedRecord.totalCards} cards ·{' '}
              {Math.floor(completedRecord.durationSeconds / 60)}m{' '}
              {completedRecord.durationSeconds % 60}s
            </p>
          </div>

            <div className="recessed-well rounded-lg grid grid-cols-4 divide-x divide-[#C3BBA9] py-3">
            <div className="flex flex-col items-center">
              <MetricTooltip
                align="left"
                placement="top"
                title="Easy Recall Tier"
                meaning="Cards recalled effortlessly. Counts as 100% toward your session score and expands stability fastest."
                detail={`${completedRecord.counts.easy} of ${completedRecord.totalCards} cards (${Math.round(
                  (completedRecord.counts.easy / Math.max(1, completedRecord.totalCards)) * 100
                )}%)`}
              >
                <span className="block text-center">
                  <span className="block font-mono text-lg font-semibold text-[#166534] tabular-nums">
                    {completedRecord.counts.easy}
                  </span>
                  <span className="block text-[11px] font-medium text-[#564D40]">Easy</span>
                </span>
              </MetricTooltip>
            </div>
            <div className="flex flex-col items-center">
              <MetricTooltip
                align="center"
                placement="top"
                title="Good Recall Tier"
                meaning="Cards recalled accurately with normal effort. Counts as 90% toward your session score."
                detail={`${completedRecord.counts.good} of ${completedRecord.totalCards} cards (${Math.round(
                  (completedRecord.counts.good / Math.max(1, completedRecord.totalCards)) * 100
                )}%)`}
              >
                <span className="block text-center">
                  <span className="block font-mono text-lg font-semibold text-[#174BB8] tabular-nums">
                    {completedRecord.counts.good}
                  </span>
                  <span className="block text-[11px] font-medium text-[#564D40]">Good</span>
                </span>
              </MetricTooltip>
            </div>
            <div className="flex flex-col items-center">
              <MetricTooltip
                align="center"
                placement="top"
                title="Hard Recall Tier"
                meaning="Cards recalled with hesitation. Counts as 60% toward your session score and schedules a shorter review interval."
                detail={`${completedRecord.counts.hard} of ${completedRecord.totalCards} cards (${Math.round(
                  (completedRecord.counts.hard / Math.max(1, completedRecord.totalCards)) * 100
                )}%)`}
              >
                <span className="block text-center">
                  <span className="block font-mono text-lg font-semibold text-[#B45309] tabular-nums">
                    {completedRecord.counts.hard}
                  </span>
                  <span className="block text-[11px] font-medium text-[#564D40]">Hard</span>
                </span>
              </MetricTooltip>
            </div>
            <div className="flex flex-col items-center">
              <MetricTooltip
                align="right"
                placement="top"
                title="Forgot Tier (Lapse)"
                meaning="Cards you couldn't recall before flipping. Counts as 0% toward your session score and resets review spacing."
                detail={`${completedRecord.counts.again} of ${completedRecord.totalCards} cards (${Math.round(
                  (completedRecord.counts.again / Math.max(1, completedRecord.totalCards)) * 100
                )}%)`}
              >
                <span className="block text-center">
                  <span className="block font-mono text-lg font-semibold text-[#B91C1C] tabular-nums">
                    {completedRecord.counts.again}
                  </span>
                  <span className="block text-[11px] font-medium text-[#564D40]">Forgot</span>
                </span>
              </MetricTooltip>
            </div>
          </div>

          {/* Engraved Session Rewards Trophy Bar */}
          <div className="rounded-lg border border-[#D4B465] bg-[#FDF8EA] p-4 space-y-2.5 text-left">
            <div className="flex items-center justify-between gap-3">
              <span className="brass-plaque rounded px-2.5 py-0.5 font-mono text-xs font-bold inline-flex items-center gap-1.5 tabular-nums">
                <Award className="w-3.5 h-3.5" aria-hidden="true" />
                Lv. {rankInfo.level} · {rankInfo.title}
              </span>
              <span className="font-mono text-xs font-bold text-[#9A6B12] tabular-nums">
                +{sessionXp} XP Earned · Best Streak {bestSessionCombo}×
              </span>
            </div>
            <div className="recessed-well h-2.5 w-full rounded-full overflow-hidden p-[1px]">
              <div
                className="h-full gold-meter rounded-full transition-all duration-500"
                style={{ width: `${rankInfo.progressPct}%` }}
              />
            </div>
            <p className="font-mono text-[11px] text-[#6B6153] flex items-center justify-between tabular-nums">
              <span>{rewardProfile.totalXp.toLocaleString()} Total XP</span>
              <span>{rankInfo.xpToNext} XP to next rank</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {missedIds.length > 0 ? (
              <button
                type="button"
                onClick={() => restartWithIds(missedIds)}
                className="px-6 py-2.5 text-sm font-semibold rounded-md btn-primary-tactile cursor-pointer"
              >
                Retry {missedIds.length} Missed
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenExamPlan(activeDeck.id)}
                className="px-6 py-2.5 text-sm font-semibold rounded-md btn-primary-tactile cursor-pointer"
              >
                View Exam Plan
              </button>
            )}

            <button
              type="button"
              onClick={() => restartWithIds(deckCards.map((c) => c.id))}
              className="px-5 py-2.5 text-sm font-semibold rounded-md btn-ivory-tactile cursor-pointer"
            >
              Quiz Again
            </button>
          </div>
        </section>
      ) : queueIds.length === 0 || !currentCard ? (
        <section className="max-w-lg mx-auto paper-sheet rounded-lg p-10 text-center space-y-4 my-6">
          <h2 className="font-serif-display text-2xl font-semibold text-[#1F1A14]">
            {deckCards.length === 0 ? 'Empty deck' : 'You’re caught up for today'}
          </h2>
          <p className="text-sm text-[#564D40]">
            {deckCards.length === 0
              ? 'Add a PDF or create cards to begin.'
              : 'All scheduled cards have been reviewed. Run a full quiz anytime to test yourself.'}
          </p>
          {deckCards.length > 0 && (
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setMode('cram')}
                className="px-5 py-2 text-sm font-semibold rounded-md btn-primary-tactile cursor-pointer"
              >
                Quiz All {deckCards.length} Cards
              </button>
              <button
                type="button"
                onClick={() => onOpenExamPlan(activeDeck.id)}
                className="px-4 py-2 text-sm font-semibold rounded-md btn-ivory-tactile cursor-pointer"
              >
                Exam Plan
              </button>
            </div>
          )}
        </section>
      ) : (
        /* 2K Full-A4 Physical Paper Spread */
        <section className="space-y-4">
          <div className="recessed-well h-2 w-full rounded-full overflow-hidden p-[1px]">
            <div
              className="h-full bg-gradient-to-r from-[#2B6BE6] to-[#194BB8] rounded-full transition-all duration-300"
              style={{
                width: `${Math.round(
                  ((currentIndex + (isRevealed ? 0.5 : 0)) / queueIds.length) * 100
                )}%`,
              }}
            />
          </div>

          <div
            className={`grid gap-6 xl:gap-8 items-start ${
              isRevealed
                ? 'grid-cols-1 lg:grid-cols-2 max-w-[1760px] mx-auto'
                : 'max-w-4xl mx-auto grid-cols-1'
            }`}
          >
            {/* Question A4 Sheet */}
            <div className="paper-sheet rounded-md overflow-hidden p-2 bg-[#FCFBF7]">
              <div className="px-3 py-1.5 border-b border-rose-300/80 flex items-center justify-between font-mono text-[11px] text-[#6B6153]">
                <span>QUESTION</span>
                <span>
                  {currentCard.questionPage ? `PAGE ${currentCard.questionPage}` : 'CARD'}
                </span>
              </div>
              {currentCard.pdfFileId && currentCard.questionPage ? (
                <div className="mt-1 border border-[#DED8C8]">
                  <PdfPageCanvas
                    pdfFileId={currentCard.pdfFileId}
                    pageNumber={currentCard.questionPage}
                    fitMode={fitMode}
                    maxHeightPx={availableSheetHeight}
                    maxHeightClass={fitMode === 'width' ? 'max-h-[75vh]' : ''}
                  />
                </div>
              ) : (
                <div className="p-8 sm:p-10 ruled-paper min-h-[260px] flex items-center justify-center text-center font-serif-display text-xl text-[#1F1A14] whitespace-pre-wrap">
                  {currentCard.questionText}
                </div>
              )}
            </div>

            {/* Revealed Answer A4 Sheet */}
            {isRevealed && (
              <div className="paper-sheet rounded-md overflow-hidden p-2 bg-[#FCFBF7]">
                <div className="px-3 py-1.5 border-b border-emerald-400/70 flex items-center justify-between gap-2 font-mono text-[11px] text-[#166534]">
                  <span>ANSWER</span>
                  <div className="flex items-center gap-3">
                    <span>
                      {currentCard.answerPage ? `PAGE ${currentCard.answerPage}` : 'CARD'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAnswerFullscreen(true)}
                      aria-label="Open answer in fullscreen"
                      title="Fullscreen Answer (Press F)"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded btn-ivory-tactile text-[11px] font-sans font-semibold text-[#1F1A14] cursor-pointer"
                    >
                      <Maximize2 className="w-3 h-3" aria-hidden="true" />
                      <span>Fullscreen</span>
                    </button>
                  </div>
                </div>
                {currentCard.pdfFileId && currentCard.answerPage ? (
                  <div className="mt-1 border border-[#DED8C8]">
                    <PdfPageCanvas
                      pdfFileId={currentCard.pdfFileId}
                      pageNumber={currentCard.answerPage}
                      fitMode={fitMode}
                      maxHeightPx={availableSheetHeight}
                      maxHeightClass={fitMode === 'width' ? 'max-h-[75vh]' : ''}
                    />
                  </div>
                ) : currentCard.pdfFileId && !currentCard.answerPage ? (
                  <div className="p-10 min-h-[260px] flex items-center justify-center text-center font-mono text-xs text-[#5B5245]">
                    No even answer page follows page {currentCard.questionPage}.
                  </div>
                ) : (
                  <div className="p-8 sm:p-10 ruled-paper min-h-[260px] flex items-center justify-center text-center text-lg text-[#1F1A14] whitespace-pre-wrap">
                    {currentCard.answerText || 'No answer recorded.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fullscreen Answer Inspection Modal */}
          {isRevealed && isAnswerFullscreen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Fullscreen Answer View"
              className="fixed inset-0 z-50 bg-[#1B1510]/92 backdrop-blur-sm flex flex-col"
            >
              {/* Top Stitched Leather Bar */}
              <div className="leather-bar border-b border-black/50 px-5 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 font-mono text-xs text-[#FBF7EE] tabular-nums">
                  <span className="px-2 py-0.5 rounded bg-emerald-700/80 border border-emerald-400/40 text-emerald-50 font-semibold">
                    ANSWER {currentCard.answerPage ? `· PAGE ${currentCard.answerPage}` : ''}
                  </span>
                  <span className="text-[#D6CEC0] hidden sm:inline">
                    {activeDeck.title} · Card {currentIndex + 1} of {queueIds.length}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="recessed-well flex items-center p-1 rounded-lg gap-1">
                    <button
                      type="button"
                      onClick={() => setFitMode('contain')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                        fitMode === 'contain'
                          ? 'btn-ivory-tactile'
                          : 'text-[#564D40] hover:text-[#1F1A14]'
                      }`}
                    >
                      Full Page
                    </button>
                    <button
                      type="button"
                      onClick={() => setFitMode('width')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                        fitMode === 'width'
                          ? 'btn-ivory-tactile'
                          : 'text-[#564D40] hover:text-[#1F1A14]'
                      }`}
                    >
                      Fit Width
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAnswerFullscreen(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-md btn-ivory-tactile inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Exit Fullscreen</span>
                    <span className="font-mono text-[10px] text-[#6B6153] hidden sm:inline">
                      Esc
                    </span>
                  </button>
                </div>
              </div>

              {/* Full-Viewport Answer Sheet */}
              <div className="flex-1 overflow-auto p-3 sm:p-5 flex items-center justify-center">
                <div className="w-full max-w-[1400px] paper-sheet rounded-md overflow-hidden p-2 bg-[#FCFBF7]">
                  {currentCard.pdfFileId && currentCard.answerPage ? (
                    <div className="border border-[#DED8C8]">
                      <PdfPageCanvas
                        pdfFileId={currentCard.pdfFileId}
                        pageNumber={currentCard.answerPage}
                        fitMode={fitMode}
                        maxHeightPx={fullscreenSheetHeight}
                        maxHeightClass={fitMode === 'width' ? 'max-h-[calc(100vh-175px)]' : ''}
                      />
                    </div>
                  ) : currentCard.pdfFileId && !currentCard.answerPage ? (
                    <div className="p-16 min-h-[360px] flex items-center justify-center text-center font-mono text-sm text-[#5B5245]">
                      No even answer page follows page {currentCard.questionPage}.
                    </div>
                  ) : (
                    <div className="p-12 sm:p-16 ruled-paper min-h-[55vh] flex items-center justify-center text-center text-2xl leading-relaxed text-[#1F1A14] whitespace-pre-wrap">
                      {currentCard.answerText || 'No answer recorded.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Grading Keys Inside Fullscreen */}
              {gradePreviews && (
                <div className="border-t border-black/40 bg-[#251D16]/95 px-4 py-3 shrink-0">
                  <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleGrade('again')}
                      className="btn-ivory-tactile rounded-lg px-3 py-2 text-center transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-sm font-bold text-[#B91C1C]">Forgot</span>
                        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EAE4D6] text-[#5B5245] tabular-nums">
                          +{rewardPreviewForGrade('again')?.totalXp ?? 5} XP
                        </span>
                      </div>
                      <span className="block font-mono text-[11px] text-[#5B5245] mt-0.5 tabular-nums">
                        1 · {gradePreviews.again.label}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleGrade('hard')}
                      className="btn-ivory-tactile rounded-lg px-3 py-2 text-center transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-sm font-bold text-[#B45309]">Hard</span>
                        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] tabular-nums">
                          +{rewardPreviewForGrade('hard')?.totalXp ?? 15} XP
                        </span>
                      </div>
                      <span className="block font-mono text-[11px] text-[#5B5245] mt-0.5 tabular-nums">
                        2 · {gradePreviews.hard.label}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleGrade('good')}
                      className="btn-ivory-tactile rounded-lg px-3 py-2 text-center transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-sm font-bold text-[#174BB8]">Good</span>
                        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#DBEAFE] text-[#1E40AF] tabular-nums">
                          +{rewardPreviewForGrade('good')?.totalXp ?? 25} XP
                        </span>
                      </div>
                      <span className="block font-mono text-[11px] text-[#5B5245] mt-0.5 tabular-nums">
                        3 · {gradePreviews.good.label}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleGrade('easy')}
                      className="btn-ivory-tactile rounded-lg px-3 py-2 text-center transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-sm font-bold text-[#166534]">Easy</span>
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded brass-plaque tabular-nums">
                          +{rewardPreviewForGrade('easy')?.totalXp ?? 35} XP
                        </span>
                      </div>
                      <span className="block font-mono text-[11px] text-[#5B5245] mt-0.5 tabular-nums">
                        4 · {gradePreviews.easy.label}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Physical Controls */}
          {!isRevealed ? (
            <div className="max-w-xl mx-auto space-y-3 pt-1 text-center">
              {showScratchpad && (
                <textarea
                  rows={2}
                  value={recallNote}
                  onChange={(e) => setRecallNote(e.target.value)}
                  placeholder="Jot down what you recall..."
                  className="w-full px-4 py-2.5 text-sm rounded-lg recessed-input text-[#1F1A14] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35 text-left"
                />
              )}

              <div className="flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleReveal}
                  className="px-8 py-2.5 text-sm font-semibold rounded-lg btn-dark-key transition-all cursor-pointer"
                >
                  Show Answer
                </button>

                <button
                  type="button"
                  onClick={() => setShowScratchpad((v) => !v)}
                  className="text-xs text-[#5B5245] hover:text-[#1F1A14] underline underline-offset-4 cursor-pointer"
                >
                  {showScratchpad ? 'Hide scratchpad' : 'Jot recall notes'}
                </button>
                <span className="font-mono text-[11px] text-[#7A6F5E] hidden sm:inline">
                  Press Space
                </span>
              </div>
            </div>
          ) : (
            gradePreviews && (
              <div className="max-w-2xl mx-auto space-y-2.5 pt-1">
                {recallNote.trim().length > 0 && (
                  <p className="text-xs text-[#564D40] text-center">
                    Your note: <span className="font-medium text-[#1F1A14]">{recallNote}</span>
                  </p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    type="button"
                    onClick={() => void handleGrade('again')}
                    className="btn-ivory-tactile rounded-lg px-4 py-2.5 text-center transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-sm font-bold text-[#B91C1C]">Forgot</span>
                      <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EAE4D6] text-[#5B5245] tabular-nums">
                        +{rewardPreviewForGrade('again')?.totalXp ?? 5} XP
                      </span>
                    </div>
                    <span className="block font-mono text-[11px] text-[#5B5245] mt-0.5 tabular-nums">
                      1 · {gradePreviews.again.label}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleGrade('hard')}
                    className="btn-ivory-tactile rounded-lg px-4 py-2.5 text-center transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-sm font-bold text-[#B45309]">Hard</span>
                      <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] tabular-nums">
                        +{rewardPreviewForGrade('hard')?.totalXp ?? 15} XP
                      </span>
                    </div>
                    <span className="block font-mono text-[11px] text-[#5B5245] mt-0.5 tabular-nums">
                      2 · {gradePreviews.hard.label}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleGrade('good')}
                    className="btn-ivory-tactile rounded-lg px-4 py-2.5 text-center transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-sm font-bold text-[#174BB8]">Good</span>
                      <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#DBEAFE] text-[#1E40AF] tabular-nums">
                        +{rewardPreviewForGrade('good')?.totalXp ?? 25} XP
                      </span>
                    </div>
                    <span className="block font-mono text-[11px] text-[#5B5245] mt-0.5 tabular-nums">
                      3 · {gradePreviews.good.label}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleGrade('easy')}
                    className="btn-ivory-tactile rounded-lg px-4 py-2.5 text-center transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-sm font-bold text-[#166534]">Easy</span>
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded brass-plaque tabular-nums">
                        +{rewardPreviewForGrade('easy')?.totalXp ?? 35} XP
                      </span>
                    </div>
                    <span className="block font-mono text-[11px] text-[#5B5245] mt-0.5 tabular-nums">
                      4 · {gradePreviews.easy.label}
                    </span>
                  </button>
                </div>
              </div>
            )
          )}
        </section>
      )}
    </div>
  );
};
