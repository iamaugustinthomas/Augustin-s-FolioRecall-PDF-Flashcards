import React, { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import type { Deck, Flashcard, StagedPdfFile } from '../types/flashcard';
import { getLocalDateString } from '../lib/spacedRepetition';
import type { DeckFileUpdatePlan } from '../lib/deckUpdater';
import { DocumentPageView } from './DocumentPageView';
import { DeckFileUpdaterPanel } from './DeckFileUpdaterPanel';

interface DeckDetailViewProps {
  deck: Deck;
  cards: Flashcard[];
  onBack: () => void;
  onSaveCard: (card: Flashcard) => Promise<void>;
  onDeleteCard: (cardId: string) => Promise<void>;
  onRenameDeck: (deckId: string, title: string, description: string) => Promise<void>;
  onUpdateDeckFromFiles: (params: {
    deckId: string;
    stagedFiles: StagedPdfFile[];
    removeMissing: boolean;
  }) => Promise<DeckFileUpdatePlan | null>;
}

export const DeckDetailView: React.FC<DeckDetailViewProps> = ({
  deck,
  cards,
  onBack,
  onSaveCard,
  onDeleteCard,
  onRenameDeck,
  onUpdateDeckFromFiles,
}) => {
  const [deckTitle, setDeckTitle] = useState(deck.title);
  const [deckDesc, setDeckDesc] = useState(deck.description);
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState('');
  const [editA, setEditA] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckTitle.trim()) return;
    await onRenameDeck(deck.id, deckTitle.trim(), deckDesc.trim());
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleAddManualCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQ.trim() || !newA.trim()) return;

    const card: Flashcard = {
      id: crypto.randomUUID(),
      deckId: deck.id,
      questionText: newQ.trim(),
      answerText: newA.trim(),
      stabilityDays: 0,
      difficulty: 5.0,
      reps: 0,
      lapses: 0,
      lastReviewedAt: null,
      nextReviewDate: getLocalDateString(),
      createdAt: new Date().toISOString(),
    };
    await onSaveCard(card);
    setNewQ('');
    setNewA('');
  };

  const startEdit = (card: Flashcard) => {
    setEditingCardId(card.id);
    setEditQ(card.questionText ?? '');
    setEditA(card.answerText ?? '');
  };

  const commitEdit = async (card: Flashcard) => {
    await onSaveCard({
      ...card,
      questionText: editQ.trim() || card.questionText,
      answerText: editA.trim(),
    });
    setEditingCardId(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="px-3.5 py-1.5 text-xs font-semibold rounded-md btn-ivory-tactile inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Library</span>
        </button>

        <span className="font-mono text-xs text-[#5B5245] tabular-nums">
          {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        </span>
      </div>

      {/* Deck Metadata */}
      <form onSubmit={handleSaveMeta} className="paper-sheet rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="detail-title" className="block text-xs font-semibold text-[#564D40] mb-1.5">
              Deck Name
            </label>
            <input
              id="detail-title"
              type="text"
              required
              value={deckTitle}
              onChange={(e) => setDeckTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-md recessed-input text-[#1F1A14] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
            />
          </div>
          <div>
            <label htmlFor="detail-desc" className="block text-xs font-semibold text-[#564D40] mb-1.5">
              Notes
            </label>
            <input
              id="detail-desc"
              type="text"
              value={deckDesc}
              onChange={(e) => setDeckDesc(e.target.value)}
              placeholder="Optional notes..."
              className="w-full px-3.5 py-2 text-sm rounded-md recessed-input text-[#1F1A14] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          {savedNotice && <span className="font-mono text-xs text-[#166534]">Saved</span>}
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-semibold rounded-md btn-dark-key cursor-pointer"
          >
            Save
          </button>
        </div>
      </form>

      {/* Update Deck from Revised File */}
      <DeckFileUpdaterPanel
        deck={deck}
        existingCards={cards}
        onApplyUpdate={onUpdateDeckFromFiles}
      />

      {/* Add Card Manually */}
      <form onSubmit={handleAddManualCard} className="paper-sheet rounded-lg p-6 space-y-4">
        <h2 className="font-serif-display text-lg font-semibold text-[#1F1A14]">
          Add Text Card
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="new-card-q" className="block text-xs font-semibold text-[#564D40] mb-1.5">
              Question
            </label>
            <textarea
              id="new-card-q"
              rows={3}
              required
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
              placeholder="Question..."
              className="w-full px-3.5 py-2 text-sm rounded-md recessed-input text-[#1F1A14] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
            />
          </div>
          <div>
            <label htmlFor="new-card-a" className="block text-xs font-semibold text-[#564D40] mb-1.5">
              Answer
            </label>
            <textarea
              id="new-card-a"
              rows={3}
              required
              value={newA}
              onChange={(e) => setNewA(e.target.value)}
              placeholder="Answer..."
              className="w-full px-3.5 py-2 text-sm rounded-md recessed-input text-[#1F1A14] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-semibold rounded-md btn-ivory-tactile inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add Card</span>
          </button>
        </div>
      </form>

      {/* Cards List */}
      <section className="space-y-4">
        <h2 className="font-serif-display text-xl font-semibold text-[#1F1A14]">Deck Cards</h2>
        {cards.length === 0 ? (
          <div className="paper-sheet rounded-lg p-8 text-center text-sm text-[#564D40]">
            No cards in this deck yet.
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map((card, i) => {
              const isPdfCard = Boolean(card.pdfFileId && card.questionPage);
              const isEditing = editingCardId === card.id;
              return (
                <div key={card.id} className="paper-sheet rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3 font-mono text-xs text-[#6B6153] tabular-nums pb-2 border-b border-[#E5DFD2]">
                    <span>
                      CARD {String(i + 1).padStart(2, '0')}
                      {card.questionPage ? ` · PAGE ${card.questionPage}` : ''}
                      {card.answerPage ? ` & ${card.answerPage}` : ''}
                      {' · '}Reps {card.reps}
                    </span>
                    <div className="flex items-center gap-3">
                      {!isPdfCard &&
                        (isEditing ? (
                          <button
                            type="button"
                            onClick={() => void commitEdit(card)}
                            className="font-sans text-xs font-semibold text-[#174BB8] cursor-pointer"
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(card)}
                            className="font-sans text-xs font-medium text-[#564D40] hover:text-[#1F1A14] cursor-pointer"
                          >
                            Edit
                          </button>
                        ))}
                      <button
                        type="button"
                        aria-label={`Delete card ${i + 1}`}
                        onClick={() => void onDeleteCard(card.id)}
                        className="p-1 text-[#7A6F5E] hover:text-[#B91C1C] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {isPdfCard ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <p className="font-mono text-[11px] text-[#6B6153]">
                          QUESTION (PAGE {card.questionPage})
                        </p>
                        <div className="rounded-sm overflow-hidden border border-[#C6BEB0]">
                          <DocumentPageView
                            fileId={card.pdfFileId!}
                            documentKind={card.documentKind}
                            sourceFileName={card.sourceFileName}
                            pageNumber={card.questionPage!}
                            fitMode="contain"
                            maxHeightPx={540}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="font-mono text-[11px] text-[#166534]">
                          ANSWER ({card.answerPage ? `PAGE ${card.answerPage}` : 'MISSING'})
                        </p>
                        {card.answerPage ? (
                          <div className="rounded-sm overflow-hidden border border-[#C6BEB0]">
                            <DocumentPageView
                              fileId={card.pdfFileId!}
                              documentKind={card.documentKind}
                              sourceFileName={card.sourceFileName}
                              pageNumber={card.answerPage}
                              fitMode="contain"
                              maxHeightPx={540}
                            />
                          </div>
                        ) : (
                          <div className="h-40 recessed-well rounded-sm flex items-center justify-center font-mono text-xs text-[#5B5245]">
                            No even answer page in document
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <textarea
                        rows={3}
                        value={editQ}
                        onChange={(e) => setEditQ(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm rounded-md recessed-input"
                      />
                      <textarea
                        rows={3}
                        value={editA}
                        onChange={(e) => setEditA(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm rounded-md recessed-input"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                      <div className="space-y-1">
                        <p className="font-mono text-[11px] text-[#6B6153]">QUESTION</p>
                        <p className="text-[#1F1A14] whitespace-pre-wrap">{card.questionText}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-mono text-[11px] text-[#6B6153]">ANSWER</p>
                        <p className="text-[#564D40] whitespace-pre-wrap">{card.answerText}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
