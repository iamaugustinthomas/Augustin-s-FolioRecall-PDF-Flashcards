export type RecallGrade = 'again' | 'hard' | 'good' | 'easy';

export interface StoredPdfFile {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  data: ArrayBuffer;
  createdAt: string;
}

export interface Flashcard {
  id: string;
  deckId: string;
  pdfFileId?: string;
  sourceFileName?: string;
  questionPage?: number;
  answerPage?: number;
  // Used only when a user adds a manual text card without a PDF
  questionText?: string;
  answerText?: string;
  stabilityDays: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
  nextReviewDate: string; // YYYY-MM-DD local date
  lastGrade?: RecallGrade;
  createdAt: string;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  examDate: string | null; // YYYY-MM-DD local date
  targetRetention: number; // 0.80 - 0.95
  sourceFiles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StudySessionRecord {
  id: string;
  deckId: string;
  deckTitle: string;
  mode: 'due' | 'cram' | 'weak';
  completedAt: string;
  durationSeconds: number;
  totalCards: number;
  counts: Record<RecallGrade, number>;
  scorePercent: number;
}

export interface DailyScheduleEntry {
  date: string; // YYYY-MM-DD
  dayIndex: number;
  isToday: boolean;
  isExamDay: boolean;
  isFinalConsolidation: boolean;
  phaseLabel: string;
  newCards: number;
  reviewCards: number;
  totalCards: number;
  projectedRetention: number; // 0 - 100
  cardIds: string[];
}

export interface ForgettingCurvePoint {
  dayIndex: number;
  date: string;
  unreviewedRetention: number; // 0 - 100
  scheduledRetention: number; // 0 - 100
  hasReviewEvent: boolean;
}

export interface StagedPdfFile {
  tempFileId: string;
  name: string;
  size: number;
  pageCount: number;
  data: ArrayBuffer;
  drafts: Array<{
    tempId: string;
    questionPage: number;
    answerPage: number | null;
    missingEvenPage: boolean;
  }>;
}

export type AppView = 'decks' | 'import' | 'study' | 'exam' | 'deck-detail';
