import type {
  DailyScheduleEntry,
  Deck,
  Flashcard,
  ForgettingCurvePoint,
  RecallGrade,
} from '../types/flashcard';

export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

export function diffDays(targetDateStr: string, baseDateStr: string): number {
  const a = parseLocalDate(targetDateStr).getTime();
  const b = parseLocalDate(baseDateStr).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

export function formatShortDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatWeekdayShortDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Ebbinghaus / FSRS-inspired forgetting curve:
 * R(t) = 0.9 ^ (t / S)
 * When t = S (stabilityDays), retention is exactly 90%.
 */
export function calculateRetention(elapsedDays: number, stabilityDays: number): number {
  if (stabilityDays <= 0) return 0;
  if (elapsedDays <= 0) return 1;
  const r = Math.pow(0.9, elapsedDays / stabilityDays);
  return Math.max(0, Math.min(1, r));
}

/**
 * Compute optimal interval (days) before retention drops to targetRetention.
 */
export function intervalForRetention(stabilityDays: number, targetRetention: number): number {
  const clamped = Math.max(0.5, Math.min(0.98, targetRetention));
  if (stabilityDays <= 0) return 1;
  const raw = stabilityDays * (Math.log(clamped) / Math.log(0.9));
  return Math.max(1, Math.round(raw));
}

export function getCardCurrentRetention(card: Flashcard, todayStr: string = getLocalDateString()): number {
  if (card.reps === 0 || !card.lastReviewedAt) {
    return 0;
  }
  const lastDateStr = getLocalDateString(new Date(card.lastReviewedAt));
  const elapsed = Math.max(0, diffDays(todayStr, lastDateStr));
  return calculateRetention(elapsed, card.stabilityDays);
}

export interface GradePreview {
  nextIntervalDays: number;
  nextReviewDate: string;
  newStability: number;
  newDifficulty: number;
  label: string;
}

export function previewGradeOutcome(
  card: Flashcard,
  grade: RecallGrade,
  examDate: string | null,
  targetRetention: number = 0.9,
  todayStr: string = getLocalDateString()
): GradePreview {
  const prevStability = card.stabilityDays > 0 ? card.stabilityDays : 1;
  const prevDiff = card.difficulty || 5.0;

  let newDifficulty = prevDiff;
  let newStability = prevStability;
  let rawInterval = 1;

  if (grade === 'again') {
    newDifficulty = Math.min(10, prevDiff + 1.2);
    newStability = Math.max(0.6, prevStability * 0.35);
    rawInterval = 0; // Due immediately / re-queue in session, next day minimum
  } else if (grade === 'hard') {
    newDifficulty = Math.min(10, prevDiff + 0.4);
    newStability = card.reps === 0 ? 1.5 : Math.max(1.2, prevStability * 1.35);
    rawInterval = Math.max(1, intervalForRetention(newStability, targetRetention));
  } else if (grade === 'good') {
    newDifficulty = Math.max(1, prevDiff - 0.15);
    const gain = Math.max(1.6, 2.5 - (newDifficulty - 1) * 0.09);
    newStability = card.reps === 0 ? 3.0 : prevStability * gain;
    rawInterval = Math.max(2, intervalForRetention(newStability, targetRetention));
  } else {
    // easy
    newDifficulty = Math.max(1, prevDiff - 0.6);
    const gain = Math.max(2.1, 3.2 - (newDifficulty - 1) * 0.08);
    newStability = card.reps === 0 ? 6.0 : prevStability * gain;
    rawInterval = Math.max(4, intervalForRetention(newStability, targetRetention));
  }

  let finalInterval = rawInterval;

  // Exam-based reverse constraint: ensure reviews land before exam consolidation day
  if (examDate && grade !== 'again') {
    const daysToExam = diffDays(examDate, todayStr);
    if (daysToExam <= 1) {
      finalInterval = Math.max(0, daysToExam);
    } else {
      const consolidationOffset = daysToExam >= 3 ? daysToExam - 1 : daysToExam;
      // Never overshoot the final consolidation window before the exam
      if (finalInterval > consolidationOffset) {
        finalInterval = consolidationOffset;
      } else if (daysToExam <= 7 && finalInterval > Math.ceil(daysToExam * 0.6)) {
        // Compress spacing slightly in final exam week so cards get an extra touchpoint
        finalInterval = Math.max(1, Math.min(consolidationOffset, Math.ceil(finalInterval * 0.75)));
      }
    }
  }

  const nextReviewDate = addDays(todayStr, grade === 'again' ? 1 : finalInterval);
  const label =
    grade === 'again'
      ? 'Today (Re-queue)'
      : finalInterval === 0
      ? 'Today'
      : finalInterval === 1
      ? '1 day'
      : `${finalInterval} days`;

  return {
    nextIntervalDays: finalInterval,
    nextReviewDate,
    newStability: Number(newStability.toFixed(2)),
    newDifficulty: Number(newDifficulty.toFixed(2)),
    label,
  };
}

export function applyCardGrade(
  card: Flashcard,
  grade: RecallGrade,
  examDate: string | null,
  targetRetention: number = 0.9,
  now: Date = new Date()
): Flashcard {
  const todayStr = getLocalDateString(now);
  const preview = previewGradeOutcome(card, grade, examDate, targetRetention, todayStr);

  return {
    ...card,
    stabilityDays: preview.newStability,
    difficulty: preview.newDifficulty,
    reps: card.reps + 1,
    lapses: grade === 'again' ? card.lapses + 1 : card.lapses,
    lastReviewedAt: now.toISOString(),
    nextReviewDate: preview.nextReviewDate,
    lastGrade: grade,
  };
}

export function isCardDue(card: Flashcard, todayStr: string = getLocalDateString()): boolean {
  if (card.reps === 0) return true;
  return card.nextReviewDate <= todayStr;
}

/**
 * Reverse-engineers a daily review schedule from today up to the target exam date.
 * Works backward from the final consolidation day (examDate - 1) so every card
 * receives balanced spaced reinforcement leading up to exam day.
 */
export function buildReverseEngineeredSchedule(
  cards: Flashcard[],
  examDate: string,
  targetRetention: number = 0.9,
  todayStr: string = getLocalDateString()
): {
  schedule: DailyScheduleEntry[];
  curve: ForgettingCurvePoint[];
  examDayProjectedRetention: number;
  unreviewedExamRetention: number;
} {
  const rawDays = diffDays(examDate, todayStr);
  const totalSpanDays = Math.max(1, Math.min(180, rawDays));
  const finalConsolidationIdx = totalSpanDays >= 2 ? totalSpanDays - 1 : totalSpanDays;

  // Initialize day buckets [0 .. totalSpanDays]
  const dayCardSets: Array<Set<string>> = Array.from(
    { length: totalSpanDays + 1 },
    () => new Set<string>()
  );
  const dayNewCardSets: Array<Set<string>> = Array.from(
    { length: totalSpanDays + 1 },
    () => new Set<string>()
  );

  // Separate new cards vs already-studied cards
  const newCards = cards.filter((c) => c.reps === 0);
  const studiedCards = cards.filter((c) => c.reps > 0);

  // Spread new card introductions smoothly over the first 45% of available days (at least day 0)
  // so the user isn't overwhelmed on day 0 while leaving time for reverse-engineered reviews.
  const introWindowDays =
    totalSpanDays <= 2 ? 1 : Math.max(1, Math.min(newCards.length, Math.floor(totalSpanDays * 0.45)));

  // Helper to compute reverse-engineered review checkpoints from a startDay to finalConsolidationIdx
  const computeReverseCheckpoints = (
    startDay: number,
    initialStability: number
  ): number[] => {
    const checkpoints: number[] = [];
    if (startDay >= finalConsolidationIdx) {
      checkpoints.push(finalConsolidationIdx);
      return checkpoints;
    }

    // Work backwards from finalConsolidationIdx to find ideal spaced anchor points
    const backwardPoints: number[] = [finalConsolidationIdx];
    let cursor = finalConsolidationIdx;
    // Estimate achievable gaps working backward: e.g., 10d -> 5d -> 3d -> 2d -> 1d
    let step = Math.max(
      1,
      Math.round(
        Math.max(initialStability, 2) * (Math.log(targetRetention) / Math.log(0.9)) * 1.8
      )
    );
    // Cap initial backward step proportionally to remaining window
    const span = finalConsolidationIdx - startDay;
    if (span >= 4) {
      step = Math.min(step, Math.max(2, Math.round(span * 0.48)));
    } else {
      step = 1;
    }

    while (cursor - step > startDay) {
      cursor -= step;
      backwardPoints.push(cursor);
      step = Math.max(1, Math.round(step * 0.55));
    }

    backwardPoints.sort((a, b) => a - b);
    return backwardPoints;
  };

  // Assign new cards across intro window + reverse checkpoints
  newCards.forEach((card, index) => {
    const introDay = introWindowDays <= 1 ? 0 : index % introWindowDays;
    dayNewCardSets[introDay].add(card.id);
    dayCardSets[introDay].add(card.id);

    const checkpoints = computeReverseCheckpoints(introDay, 1.5);
    checkpoints.forEach((cpDay) => {
      if (cpDay > introDay && cpDay <= totalSpanDays) {
        dayCardSets[cpDay].add(card.id);
      }
    });
  });

  // Assign studied cards from their due day or today + reverse checkpoints
  studiedCards.forEach((card) => {
    const dueOffset = diffDays(card.nextReviewDate, todayStr);
    const firstTouchDay = Math.max(0, Math.min(finalConsolidationIdx, dueOffset));
    dayCardSets[firstTouchDay].add(card.id);

    const checkpoints = computeReverseCheckpoints(firstTouchDay, card.stabilityDays);
    checkpoints.forEach((cpDay) => {
      if (cpDay > firstTouchDay && cpDay <= totalSpanDays) {
        dayCardSets[cpDay].add(card.id);
      }
    });
  });

  // Simulate day-by-day memory stability & retention curve across all cards
  const simulatedStability = new Map<string, number>();
  const simulatedLastTouch = new Map<string, number>();
  const unreviewedStability = new Map<string, number>();
  const unreviewedLastTouch = new Map<string, number>();

  cards.forEach((card) => {
    if (card.reps > 0 && card.lastReviewedAt) {
      const lastDaysAgo = Math.max(
        0,
        diffDays(todayStr, getLocalDateString(new Date(card.lastReviewedAt)))
      );
      simulatedStability.set(card.id, Math.max(1, card.stabilityDays));
      simulatedLastTouch.set(card.id, -lastDaysAgo);
      unreviewedStability.set(card.id, Math.max(1, card.stabilityDays));
      unreviewedLastTouch.set(card.id, -lastDaysAgo);
    } else {
      simulatedStability.set(card.id, 0);
      simulatedLastTouch.set(card.id, 0);
      unreviewedStability.set(card.id, 0);
      unreviewedLastTouch.set(card.id, 0);
    }
  });

  const schedule: DailyScheduleEntry[] = [];
  const curve: ForgettingCurvePoint[] = [];

  for (let d = 0; d <= totalSpanDays; d++) {
    const dateStr = addDays(todayStr, d);
    const isExamDay = d === totalSpanDays && rawDays >= 0;
    const isFinalConsolidation = d === finalConsolidationIdx && !isExamDay;

    const scheduledIds = Array.from(dayCardSets[d]);
    const newIds = Array.from(dayNewCardSets[d]);

    // Update simulated stability for cards reviewed on day d (before measuring end-of-day retention)
    if (!isExamDay) {
      scheduledIds.forEach((id) => {
        const prevS = simulatedStability.get(id) ?? 0;
        const nextS = prevS === 0 ? 3.0 : Math.min(90, prevS * 2.15);
        simulatedStability.set(id, nextS);
        simulatedLastTouch.set(id, d);
      });
    }

    // Measure average retention across all cards on day d
    let totalScheduledRet = 0;
    let totalUnreviewedRet = 0;

    cards.forEach((card) => {
      const s = simulatedStability.get(card.id) ?? 0;
      const last = simulatedLastTouch.get(card.id) ?? 0;
      totalScheduledRet += s > 0 ? calculateRetention(Math.max(0, d - last), s) : 0;

      const uS = unreviewedStability.get(card.id) ?? 0;
      const uLast = unreviewedLastTouch.get(card.id) ?? 0;
      // Baseline if user did one pass today and never reviewed again
      const effectiveUS = uS > 0 ? uS : 1.5;
      totalUnreviewedRet += calculateRetention(Math.max(0, d - uLast), effectiveUS);
    });

    const avgScheduledPct =
      cards.length > 0 ? Math.round((totalScheduledRet / cards.length) * 100) : 0;
    const avgUnreviewedPct =
      cards.length > 0 ? Math.round((totalUnreviewedRet / cards.length) * 100) : 0;

    let phaseLabel = 'Spaced Reinforcement';
    if (isExamDay) {
      phaseLabel = 'Target Exam Day';
    } else if (isFinalConsolidation) {
      phaseLabel = 'Final Consolidation';
    } else if (newIds.length > 0 && d === 0) {
      phaseLabel = 'Launch & Initial Recall';
    } else if (newIds.length > 0) {
      phaseLabel = 'Acquisition & Review';
    } else if (scheduledIds.length === 0) {
      phaseLabel = 'Memory Consolidation Rest';
    }

    schedule.push({
      date: dateStr,
      dayIndex: d,
      isToday: d === 0,
      isExamDay,
      isFinalConsolidation,
      phaseLabel,
      newCards: newIds.length,
      reviewCards: Math.max(0, scheduledIds.length - newIds.length),
      totalCards: scheduledIds.length,
      projectedRetention: avgScheduledPct,
      cardIds: scheduledIds,
    });

    curve.push({
      dayIndex: d,
      date: dateStr,
      unreviewedRetention: avgUnreviewedPct,
      scheduledRetention: avgScheduledPct,
      hasReviewEvent: scheduledIds.length > 0 && !isExamDay,
    });
  }

  const lastPoint = curve[curve.length - 1];
  return {
    schedule,
    curve,
    examDayProjectedRetention: lastPoint ? lastPoint.scheduledRetention : 0,
    unreviewedExamRetention: lastPoint ? lastPoint.unreviewedRetention : 0,
  };
}

export function computeSessionScore(counts: Record<RecallGrade, number>): number {
  const total = counts.again + counts.hard + counts.good + counts.easy;
  if (total === 0) return 0;
  const weightedPoints =
    counts.easy * 100 + counts.good * 90 + counts.hard * 60 + counts.again * 0;
  return Math.round(weightedPoints / total);
}

export function calculateDeckReadiness(
  cards: Flashcard[],
  examDate: string | null,
  targetRetention: number = 0.9,
  todayStr: string = getLocalDateString()
): number {
  if (cards.length === 0) return 0;
  if (examDate) {
    const days = diffDays(examDate, todayStr);
    if (days >= 0) {
      const { examDayProjectedRetention } = buildReverseEngineeredSchedule(
        cards,
        examDate,
        targetRetention,
        todayStr
      );
      return examDayProjectedRetention;
    }
  }
  const avg =
    cards.reduce((sum, c) => sum + getCardCurrentRetention(c, todayStr), 0) / cards.length;
  return Math.round(avg * 100);
}
