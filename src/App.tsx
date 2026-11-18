import { useCallback, useEffect, useState } from 'react';
import type {
  AppView,
  Deck,
  Flashcard,
  StagedPdfFile,
  StoredPdfFile,
  StudySessionRecord,
} from './types/flashcard';
import {
  applyDeckFileUpdate,
  deleteCard,
  deleteDeckAndCards,
  getAllCards,
  getAllDecks,
  getAllSessions,
  saveCard,
  saveCards,
  saveDeck,
  savePdfFiles,
  saveSession,
} from './lib/storage';
import {
  buildDeckFileUpdatePlan,
  type DeckFileUpdatePlan,
} from './lib/deckUpdater';
import {
  clearAllCachedStudyDocuments,
  clearCachedStudyDocument,
} from './lib/documentFiles';
import {
  createSampleStudyPdf,
  stagePdfFiles,
} from './lib/pdfParser';
import { addDays, getLocalDateString, isCardDue } from './lib/spacedRepetition';
import {
  loadRewardProfile,
  playRewardSound,
  saveRewardProfile,
  speakAnnouncerLine,
  stopAnnouncerVoiceover,
  type RewardProfile,
} from './lib/rewards';
import { TopBar } from './components/TopBar';
import { DecksView } from './components/DecksView';
import { PdfImportView } from './components/PdfImportView';
import { StudyView } from './components/StudyView';
import { ExamPlannerView } from './components/ExamPlannerView';
import { DeckDetailView } from './components/DeckDetailView';
import { StorageModal } from './components/StorageModal';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('decks');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [sessions, setSessions] = useState<StudySessionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState<'due' | 'cram' | 'weak'>('due');
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [isImportingSample, setIsImportingSample] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>(undefined);
  const [rewardProfile, setRewardProfile] = useState<RewardProfile>(() =>
    loadRewardProfile()
  );

  const handleToggleSound = () => {
    setRewardProfile((prev) => {
      const nextEnabled = !prev.soundEnabled;
      const next = { ...prev, soundEnabled: nextEnabled };
      saveRewardProfile(next);
      if (nextEnabled) {
        playRewardSound('sound_on');
      } else {
        stopAnnouncerVoiceover();
      }
      return next;
    });
  };

  const handleToggleVoiceover = () => {
    setRewardProfile((prev) => {
      const nextVoice = !prev.voiceoverEnabled;
      const next = {
        ...prev,
        voiceoverEnabled: nextVoice,
        soundEnabled: nextVoice ? true : prev.soundEnabled,
      };
      saveRewardProfile(next);
      if (nextVoice) {
        speakAnnouncerLine('Announcer ready!', { tier: 'skill', withStinger: true, delayMs: 60 });
      } else {
        stopAnnouncerVoiceover();
      }
      return next;
    });
  };

  const loadLocalData = useCallback(async () => {
    try {
      const [loadedDecks, loadedCards, loadedSessions] = await Promise.all([
        getAllDecks(),
        getAllCards(),
        getAllSessions(),
      ]);
      setDecks(loadedDecks);
      setCards(loadedCards);
      setSessions(loadedSessions);
      setSelectedDeckId((prev) => {
        if (prev && loadedDecks.some((d) => d.id === prev)) return prev;
        return loadedDecks[0]?.id ?? null;
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLocalData();
  }, [loadLocalData]);

  const todayStr = getLocalDateString();
  const totalDue = cards.filter((c) => isCardDue(c, todayStr)).length;

  const handleSaveImportedDecks = async (
    groups: Array<{
      title: string;
      examDate: string | null;
      files: StagedPdfFile[];
    }>
  ) => {
    const nowIso = new Date().toISOString();
    const newDecks: Deck[] = [];
    const newCards: Flashcard[] = [];
    const pdfsToStore: StoredPdfFile[] = [];

    for (const group of groups) {
      const deckId = crypto.randomUUID();
      newDecks.push({
        id: deckId,
        title: group.title,
        description: `Stored file${group.files.length === 1 ? '' : 's'}: ${group.files
          .map((f) => f.name)
          .join(', ')}`,
        examDate: group.examDate,
        targetRetention: 0.9,
        sourceFiles: group.files.map((f) => f.name),
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      for (const file of group.files) {
        if (file.documentKind === 'csv') {
          for (const draft of file.drafts) {
            newCards.push({
              id: crypto.randomUUID(),
              deckId,
              sourceFileName: file.name,
              documentKind: 'csv',
              questionText: draft.questionText ?? '',
              answerText: draft.answerText ?? '',
              stabilityDays: 0,
              difficulty: 5.0,
              reps: 0,
              lapses: 0,
              lastReviewedAt: null,
              nextReviewDate: todayStr,
              createdAt: nowIso,
            });
          }
          continue;
        }

        const pdfFileId = file.tempFileId;
        pdfsToStore.push({
          id: pdfFileId,
          name: file.name,
          size: file.size,
          pageCount: file.pageCount,
          mimeType: file.mimeType,
          documentKind: file.documentKind,
          data: file.data,
          createdAt: nowIso,
        });

        for (const draft of file.drafts) {
          newCards.push({
            id: crypto.randomUUID(),
            deckId,
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

    await savePdfFiles(pdfsToStore);
    for (const d of newDecks) {
      await saveDeck(d);
    }
    await saveCards(newCards);
    await loadLocalData();
    setDroppedFiles(undefined);

    if (newDecks[0]) {
      setSelectedDeckId(newDecks[0].id);
      setStudyMode('due');
      setActiveView('study');
    } else {
      setActiveView('decks');
    }
  };

  const handleUpdateDeckFromFiles = async (params: {
    deckId: string;
    stagedFiles: StagedPdfFile[];
    removeMissing: boolean;
    navigateToStudy?: boolean;
  }): Promise<DeckFileUpdatePlan | null> => {
    const targetDeck = decks.find((d) => d.id === params.deckId);
    if (!targetDeck) return null;

    const existingDeckCards = cards.filter((c) => c.deckId === targetDeck.id);
    const plan = buildDeckFileUpdatePlan({
      deck: targetDeck,
      existingCards: existingDeckCards,
      stagedFiles: params.stagedFiles,
      removeMissing: params.removeMissing,
    });

    const removedPdfIds = await applyDeckFileUpdate({
      updatedDeck: plan.updatedDeck,
      newPdfFiles: plan.newPdfFiles,
      cardsToPut: plan.cardsToPut,
      cardIdsToDelete: plan.cardIdsToDelete,
    });
    removedPdfIds.forEach((id) => clearCachedStudyDocument(id));

    await loadLocalData();
    setDroppedFiles(undefined);

    if (params.navigateToStudy) {
      setSelectedDeckId(targetDeck.id);
      setStudyMode('due');
      setActiveView('study');
    }

    return plan;
  };

  const handleDropPdfFiles = async (files: File[]) => {
    setDroppedFiles(files);
    setActiveView('import');
  };

  const handleRunSamplePdfImport = async () => {
    setIsImportingSample(true);
    try {
      const samplePdf = createSampleStudyPdf();
      const staged = await stagePdfFiles([samplePdf]);
      const defaultExamDate = addDays(todayStr, 10);
      await handleSaveImportedDecks([
        {
          title: 'Bioenergetics & Memory (Sample)',
          examDate: defaultExamDate,
          files: staged,
        },
      ]);
    } finally {
      setIsImportingSample(false);
    }
  };

  const handleCreateManualDeck = async (title: string, examDate: string | null) => {
    const nowIso = new Date().toISOString();
    const newDeck: Deck = {
      id: crypto.randomUUID(),
      title,
      description: '',
      examDate,
      targetRetention: 0.9,
      sourceFiles: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await saveDeck(newDeck);
    await loadLocalData();
    setSelectedDeckId(newDeck.id);
    setActiveView('deck-detail');
  };

  const handleDeleteDeck = async (deckId: string) => {
    const removedPdfIds = await deleteDeckAndCards(deckId);
    removedPdfIds.forEach((id) => clearCachedStudyDocument(id));
    await loadLocalData();
  };

  const handleCardUpdated = async (updated: Flashcard) => {
    await saveCard(updated);
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleSaveCard = async (card: Flashcard) => {
    await saveCard(card);
    await loadLocalData();
  };

  const handleDeleteCard = async (cardId: string) => {
    await deleteCard(cardId);
    await loadLocalData();
  };

  const handleRenameDeck = async (
    deckId: string,
    title: string,
    description: string
  ) => {
    const existing = decks.find((d) => d.id === deckId);
    if (!existing) return;
    await saveDeck({
      ...existing,
      title,
      description,
      updatedAt: new Date().toISOString(),
    });
    await loadLocalData();
  };

  const handleSessionCompleted = async (record: StudySessionRecord) => {
    await saveSession(record);
    setSessions((prev) => [record, ...prev]);
  };

  const handleUpdateDeckExamSettings = async (
    deckId: string,
    examDate: string | null,
    targetRetention: number
  ) => {
    const existing = decks.find((d) => d.id === deckId);
    if (!existing) return;
    const updated: Deck = {
      ...existing,
      examDate,
      targetRetention,
      updatedAt: new Date().toISOString(),
    };
    await saveDeck(updated);
    setDecks((prev) => prev.map((d) => (d.id === deckId ? updated : d)));
  };

  const handleStartStudy = (deckId: string, mode: 'due' | 'cram' | 'weak') => {
    setSelectedDeckId(deckId);
    setStudyMode(mode);
    setActiveView('study');
  };

  const handleQuickStartReview = () => {
    if (decks.length === 0) {
      setActiveView('import');
      return;
    }
    const deckWithDue = decks.find((d) =>
      cards.some((c) => c.deckId === d.id && isCardDue(c, todayStr))
    );
    const targetDeck = deckWithDue ?? decks[0];
    const hasDue = cards.some((c) => c.deckId === targetDeck.id && isCardDue(c, todayStr));
    handleStartStudy(targetDeck.id, hasDue ? 'due' : 'cram');
  };

  const detailDeck = decks.find((d) => d.id === selectedDeckId) ?? null;

  return (
    <div className="min-h-screen flex flex-col desk-linen text-[#1F1A14]">
      <TopBar
        activeView={activeView}
        onNavigate={(view) => {
          if (view !== 'import') setDroppedFiles(undefined);
          setActiveView(view);
        }}
        hasCards={cards.length > 0}
        totalDue={totalDue}
        onQuickStartReview={handleQuickStartReview}
        onOpenSettings={() => setIsStorageModalOpen(true)}
      />

      <main
        className={`flex-1 w-full max-w-[1840px] mx-auto px-6 sm:px-10 ${
          activeView === 'study' ? 'py-5 sm:py-6' : 'py-8 sm:py-10'
        }`}
      >
        {isLoading ? (
          <div className="py-20 text-center font-mono text-xs text-[#6B6153]">
            Opening local vault…
          </div>
        ) : (
          <>
            {activeView === 'decks' && (
              <DecksView
                decks={decks}
                cards={cards}
                sessions={sessions}
                rewardProfile={rewardProfile}
                onStartStudy={handleStartStudy}
                onOpenExamPlan={(deckId) => {
                  setSelectedDeckId(deckId);
                  setActiveView('exam');
                }}
                onOpenDeckDetail={(deckId) => {
                  setSelectedDeckId(deckId);
                  setActiveView('deck-detail');
                }}
                onDeleteDeck={handleDeleteDeck}
                onGoToImport={() => setActiveView('import')}
                onDropPdfFiles={handleDropPdfFiles}
                onCreateManualDeck={handleCreateManualDeck}
                onRunSamplePdfImport={handleRunSamplePdfImport}
                isImportingSample={isImportingSample}
              />
            )}

            {activeView === 'import' && (
              <PdfImportView
                initialFiles={droppedFiles}
                existingDecks={decks}
                existingCards={cards}
                onSaveImportedDecks={handleSaveImportedDecks}
                onUpdateExistingDeck={async (deckId, stagedFiles, removeMissing) => {
                  await handleUpdateDeckFromFiles({
                    deckId,
                    stagedFiles,
                    removeMissing,
                    navigateToStudy: true,
                  });
                }}
                onCancel={() => {
                  setDroppedFiles(undefined);
                  setActiveView('decks');
                }}
              />
            )}

            {activeView === 'study' && (
              <StudyView
                decks={decks}
                cards={cards}
                selectedDeckId={selectedDeckId}
                initialMode={studyMode}
                rewardProfile={rewardProfile}
                onRewardProfileUpdated={setRewardProfile}
                onToggleSound={handleToggleSound}
                onToggleVoiceover={handleToggleVoiceover}
                onSelectDeck={(deckId) => setSelectedDeckId(deckId)}
                onCardUpdated={handleCardUpdated}
                onSessionCompleted={handleSessionCompleted}
                onOpenExamPlan={(deckId) => {
                  setSelectedDeckId(deckId);
                  setActiveView('exam');
                }}
                onBackToDecks={() => setActiveView('decks')}
              />
            )}

            {activeView === 'exam' && (
              <ExamPlannerView
                decks={decks}
                cards={cards}
                selectedDeckId={selectedDeckId}
                onSelectDeck={(deckId) => setSelectedDeckId(deckId)}
                onUpdateDeckExamSettings={handleUpdateDeckExamSettings}
                onStartStudy={handleStartStudy}
              />
            )}

            {activeView === 'deck-detail' && detailDeck && (
              <DeckDetailView
                deck={detailDeck}
                cards={cards.filter((c) => c.deckId === detailDeck.id)}
                onBack={() => setActiveView('decks')}
                onSaveCard={handleSaveCard}
                onDeleteCard={handleDeleteCard}
                onRenameDeck={handleRenameDeck}
                onUpdateDeckFromFiles={(params) =>
                  handleUpdateDeckFromFiles({ ...params, navigateToStudy: false })
                }
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-[#C6BEB0] bg-[#DDD7C9]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
        <div className="max-w-[1840px] mx-auto px-6 sm:px-10 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5B5245]">
          <p>{"Augustin's FolioRecall · Stored privately on your device"}</p>
          <button
            type="button"
            onClick={() => setIsStorageModalOpen(true)}
            className="font-semibold text-[#1F1A14] hover:text-[#174BB8] underline underline-offset-4 transition-colors cursor-pointer"
          >
            Settings &amp; Storage
          </button>
        </div>
      </footer>

      <StorageModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        deckCount={decks.length}
        cardCount={cards.length}
        sessionCount={sessions.length}
        rewardProfile={rewardProfile}
        onUpdateRewardProfile={setRewardProfile}
        onDataChanged={async () => {
          clearAllCachedStudyDocuments();
          setRewardProfile(loadRewardProfile());
          await loadLocalData();
        }}
      />
    </div>
  );
}
