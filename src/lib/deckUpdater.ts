import type {
  Deck,
  Flashcard,
  StagedPdfFile,
  StoredPdfFile,
} from '../types/flashcard';
import { getLocalDateString } from './spacedRepetition';

export interface UpdatedCardDiff {
  existingCard: Flashcard;
  updatedCard: Flashcard;
  reason: string;
}

export interface DeckFileUpdatePlan {
  updatedDeck: Deck;
  newPdfFiles: StoredPdfFile[];
  unchangedCards: Flashcard[];
  updatedCards: UpdatedCardDiff[];
  addedCards: Flashcard[];
  missingCards: Flashcard[];
  cardsToPut: Flashcard[];
  cardIdsToDelete: string[];
}

function normalizeText(value?: string): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Bound comparison length to keep diff calculation instant for huge passages
  const s1 = m > 260 ? a.slice(0, 260) : a;
  const s2 = n > 260 ? b.slice(0, 260) : b;
  const len1 = s1.length;
  const len2 = s2.length;

  let prev = new Array<number>(len2 + 1);
  let curr = new Array<number>(len2 + 1);

  for (let j = 0; j <= len2; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    curr[0] = i;
    const ch1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= len2; j++) {
      const cost = ch1 === s2.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[len2];
}

function similarityRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const minLen = Math.min(a.length, b.length);
  if (minLen / maxLen < 0.45) return 0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1 - dist / Math.min(maxLen, 260));
}

export function buildDeckFileUpdatePlan(params: {
  deck: Deck;
  existingCards: Flashcard[];
  stagedFiles: StagedPdfFile[];
  removeMissing?: boolean;
}): DeckFileUpdatePlan {
  const { deck, existingCards, stagedFiles, removeMissing = false } = params;
  const nowIso = new Date().toISOString();
  const todayStr = getLocalDateString();

  const unchangedCards: Flashcard[] = [];
  const updatedCards: UpdatedCardDiff[] = [];
  const addedCards: Flashcard[] = [];
  const newPdfFiles: StoredPdfFile[] = [];

  const matchedExistingIds = new Set<string>();
  const scopedCandidateIds = new Set<string>();

  const csvFiles = stagedFiles.filter((f) => f.documentKind === 'csv');
  const docFiles = stagedFiles.filter((f) => f.documentKind !== 'csv');

  // 1. Diff & match CSV / text cards while preserving SRS progress
  if (csvFiles.length > 0) {
    const existingTextCards = existingCards.filter((c) => !c.pdfFileId);
    existingTextCards.forEach((c) => scopedCandidateIds.add(c.id));

    const incomingRows: Array<{
      questionText: string;
      answerText: string;
      sourceFileName: string;
    }> = [];

    for (const file of csvFiles) {
      for (const draft of file.drafts) {
        incomingRows.push({
          questionText: draft.questionText ?? '',
          answerText: draft.answerText ?? '',
          sourceFileName: file.name,
        });
      }
    }

    const unmatchedRowIndices = new Set<number>(incomingRows.map((_, i) => i));
    const remainingTextCards = () =>
      existingTextCards.filter((c) => !matchedExistingIds.has(c.id));

    // Pass 1: Exact Question + Answer match
    for (const idx of Array.from(unmatchedRowIndices)) {
      const row = incomingRows[idx];
      const nq = normalizeText(row.questionText);
      const na = normalizeText(row.answerText);
      const exact = remainingTextCards().find(
        (c) =>
          normalizeText(c.questionText) === nq &&
          normalizeText(c.answerText) === na
      );
      if (exact) {
        matchedExistingIds.add(exact.id);
        unmatchedRowIndices.delete(idx);
        unchangedCards.push(exact);
      }
    }

    // Pass 2: Exact Question match (Answer edited / spelling fixed)
    for (const idx of Array.from(unmatchedRowIndices)) {
      const row = incomingRows[idx];
      const nq = normalizeText(row.questionText);
      if (!nq) continue;
      const match = remainingTextCards().find(
        (c) => normalizeText(c.questionText) === nq
      );
      if (match) {
        matchedExistingIds.add(match.id);
        unmatchedRowIndices.delete(idx);
        updatedCards.push({
          existingCard: match,
          updatedCard: {
            ...match,
            questionText: row.questionText,
            answerText: row.answerText,
            sourceFileName: row.sourceFileName,
            documentKind: 'csv',
          },
          reason: 'Answer updated',
        });
      }
    }

    // Pass 3: Exact Answer match (Question spelling / phrasing fixed)
    for (const idx of Array.from(unmatchedRowIndices)) {
      const row = incomingRows[idx];
      const na = normalizeText(row.answerText);
      if (!na) continue;
      const match = remainingTextCards().find(
        (c) => normalizeText(c.answerText) === na
      );
      if (match) {
        matchedExistingIds.add(match.id);
        unmatchedRowIndices.delete(idx);
        updatedCards.push({
          existingCard: match,
          updatedCard: {
            ...match,
            questionText: row.questionText,
            answerText: row.answerText,
            sourceFileName: row.sourceFileName,
            documentKind: 'csv',
          },
          reason: 'Question spelling updated',
        });
      }
    }

    // Pass 4: Fuzzy similarity match for spelling corrections in both Q & A
    const fuzzyPairs: Array<{
      rowIdx: number;
      card: Flashcard;
      score: number;
    }> = [];

    for (const idx of unmatchedRowIndices) {
      const row = incomingRows[idx];
      const nq = normalizeText(row.questionText);
      const na = normalizeText(row.answerText);
      for (const card of remainingTextCards()) {
        const qSim = similarityRatio(nq, normalizeText(card.questionText));
        const aSim = similarityRatio(na, normalizeText(card.answerText));
        const score = qSim * 0.65 + aSim * 0.35;
        if (qSim >= 0.72 || score >= 0.75 || (qSim >= 0.58 && aSim >= 0.8)) {
          fuzzyPairs.push({ rowIdx: idx, card, score });
        }
      }
    }

    fuzzyPairs.sort((a, b) => b.score - a.score);
    for (const pair of fuzzyPairs) {
      if (!unmatchedRowIndices.has(pair.rowIdx)) continue;
      if (matchedExistingIds.has(pair.card.id)) continue;
      const row = incomingRows[pair.rowIdx];
      matchedExistingIds.add(pair.card.id);
      unmatchedRowIndices.delete(pair.rowIdx);
      updatedCards.push({
        existingCard: pair.card,
        updatedCard: {
          ...pair.card,
          questionText: row.questionText,
          answerText: row.answerText,
          sourceFileName: row.sourceFileName,
          documentKind: 'csv',
        },
        reason: 'Spelling / wording corrected',
      });
    }

    // Pass 5: Remaining rows are brand-new flashcards
    for (const idx of Array.from(unmatchedRowIndices).sort((a, b) => a - b)) {
      const row = incomingRows[idx];
      addedCards.push({
        id: crypto.randomUUID(),
        deckId: deck.id,
        sourceFileName: row.sourceFileName,
        documentKind: 'csv',
        questionText: row.questionText,
        answerText: row.answerText,
        stabilityDays: 0,
        difficulty: 5.0,
        reps: 0,
        lapses: 0,
        lastReviewedAt: null,
        nextReviewDate: todayStr,
        createdAt: nowIso,
      });
    }
  }

  // 2. Diff & match PDF / DOCX files by page pairing while preserving SRS progress
  if (docFiles.length > 0) {
    const existingDocCards = existingCards.filter((c) => Boolean(c.pdfFileId));
    const distinctPdfIds = new Set(existingDocCards.map((c) => c.pdfFileId));

    for (const file of docFiles) {
      const pdfFileId = file.tempFileId;
      newPdfFiles.push({
        id: pdfFileId,
        name: file.name,
        size: file.size,
        pageCount: file.pageCount,
        mimeType: file.mimeType,
        documentKind: file.documentKind,
        data: file.data,
        createdAt: nowIso,
      });

      const exactNameCards = existingDocCards.filter(
        (c) =>
          !matchedExistingIds.has(c.id) &&
          (c.sourceFileName ?? '').toLowerCase() === file.name.toLowerCase()
      );

      const candidatePool =
        exactNameCards.length > 0
          ? exactNameCards
          : distinctPdfIds.size <= 1
          ? existingDocCards.filter((c) => !matchedExistingIds.has(c.id))
          : [];

      candidatePool.forEach((c) => scopedCandidateIds.add(c.id));

      for (const draft of file.drafts) {
        const matched = candidatePool.find(
          (c) =>
            !matchedExistingIds.has(c.id) && c.questionPage === draft.questionPage
        );

        if (matched) {
          matchedExistingIds.add(matched.id);
          updatedCards.push({
            existingCard: matched,
            updatedCard: {
              ...matched,
              pdfFileId,
              sourceFileName: file.name,
              documentKind: file.documentKind,
              questionPage: draft.questionPage,
              answerPage: draft.answerPage ?? undefined,
            },
            reason:
              matched.answerPage !== (draft.answerPage ?? undefined)
                ? 'Page pair updated'
                : 'Document pages refreshed',
          });
        } else {
          addedCards.push({
            id: crypto.randomUUID(),
            deckId: deck.id,
            pdfFileId,
            sourceFileName: file.name,
            documentKind: file.documentKind,
            questionPage: draft.questionPage,
            answerPage: draft.answerPage ?? undefined,
            stabilityDays: 0,
            difficulty: 5.0,
            reps: 0,
            lapses: 0,
            lastReviewedAt: null,
            nextReviewDate: todayStr,
            createdAt: nowIso,
          });
        }
      }
    }
  }

  const missingCards = existingCards.filter(
    (c) => scopedCandidateIds.has(c.id) && !matchedExistingIds.has(c.id)
  );

  const cardIdsToDelete = removeMissing ? missingCards.map((c) => c.id) : [];
  const cardsToPut = [...updatedCards.map((u) => u.updatedCard), ...addedCards];

  const uploadedNames = stagedFiles.map((f) => f.name);
  const existingSourceFiles = deck.sourceFiles ?? [];
  const mergedSourceFiles =
    existingSourceFiles.length <= 1 && uploadedNames.length === 1
      ? uploadedNames
      : Array.from(new Set([...existingSourceFiles, ...uploadedNames]));

  const updatedDescription =
    !deck.description || deck.description.startsWith('Stored file')
      ? `Stored file${mergedSourceFiles.length === 1 ? '' : 's'}: ${mergedSourceFiles.join(
          ', '
        )}`
      : deck.description;

  const updatedDeck: Deck = {
    ...deck,
    sourceFiles: mergedSourceFiles,
    description: updatedDescription,
    updatedAt: nowIso,
  };

  return {
    updatedDeck,
    newPdfFiles,
    unchangedCards,
    updatedCards,
    addedCards,
    missingCards,
    cardsToPut,
    cardIdsToDelete,
  };
}
