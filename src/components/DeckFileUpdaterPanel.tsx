import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, RefreshCw } from 'lucide-react';
import type { Deck, Flashcard, StagedPdfFile } from '../types/flashcard';
import { DOCX_MIME } from '../lib/docxParser';
import { buildCsvDrafts } from '../lib/csvParser';
import { isSupportedStudyFile, stageStudyFiles } from '../lib/documentFiles';
import { buildDeckFileUpdatePlan, type DeckFileUpdatePlan } from '../lib/deckUpdater';

interface DeckFileUpdaterPanelProps {
  deck: Deck;
  existingCards: Flashcard[];
  onApplyUpdate: (params: {
    deckId: string;
    stagedFiles: StagedPdfFile[];
    removeMissing: boolean;
  }) => Promise<DeckFileUpdatePlan | null>;
}

export const DeckFileUpdaterPanel: React.FC<DeckFileUpdaterPanelProps> = ({
  deck,
  existingCards,
  onApplyUpdate,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedPdfFile[]>([]);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [lastResultSummary, setLastResultSummary] = useState<string | null>(null);

  const processFiles = async (fileList: File[]) => {
    const validFiles = fileList.filter((f) => isSupportedStudyFile(f));
    if (validFiles.length === 0) {
      setErrorMsg('Please select a valid PDF, DOCX, or CSV file.');
      return;
    }

    setErrorMsg(null);
    setLastResultSummary(null);
    setRemoveMissing(false);
    setIsParsing(true);
    try {
      const staged = await stageStudyFiles(validFiles);
      setStagedFiles(staged);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? `Could not read file: ${err.message}` : 'Unable to parse file.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const updateCsvMapping = (
    tempFileId: string,
    patch: { hasHeader?: boolean; questionCol?: number; answerCol?: number }
  ) => {
    setStagedFiles((prev) =>
      prev.map((file) => {
        if (file.tempFileId !== tempFileId || !file.csvConfig) return file;
        const nextHasHeader = patch.hasHeader ?? file.csvConfig.hasHeader;
        const nextQCol = patch.questionCol ?? file.csvConfig.questionCol;
        const nextACol = patch.answerCol ?? file.csvConfig.answerCol;

        const firstRow = file.csvConfig.rows[0] ?? [];
        const maxCols = file.csvConfig.headers.length;
        const nextHeaders = Array.from({ length: maxCols }, (_, idx) => {
          const label = firstRow[idx]?.trim();
          return nextHasHeader && label ? label : `Column ${idx + 1}`;
        });

        const nextDrafts = buildCsvDrafts(
          file.tempFileId,
          file.csvConfig.rows,
          nextHasHeader,
          nextQCol,
          nextACol
        );

        return {
          ...file,
          pageCount: nextDrafts.length,
          csvConfig: {
            ...file.csvConfig,
            hasHeader: nextHasHeader,
            headers: nextHeaders,
            questionCol: nextQCol,
            answerCol: nextACol,
          },
          drafts: nextDrafts,
        };
      })
    );
  };

  const plan = useMemo(() => {
    if (stagedFiles.length === 0) return null;
    return buildDeckFileUpdatePlan({
      deck,
      existingCards,
      stagedFiles,
      removeMissing,
    });
  }, [deck, existingCards, stagedFiles, removeMissing]);

  const handleApply = async () => {
    if (!plan) return;
    setIsApplying(true);
    setErrorMsg(null);
    try {
      const applied = await onApplyUpdate({
        deckId: deck.id,
        stagedFiles,
        removeMissing,
      });
      if (applied) {
        const parts: string[] = [];
        if (applied.updatedCards.length > 0) {
          parts.push(`${applied.updatedCards.length} updated`);
        }
        if (applied.addedCards.length > 0) {
          parts.push(`${applied.addedCards.length} added`);
        }
        if (applied.cardIdsToDelete.length > 0) {
          parts.push(`${applied.cardIdsToDelete.length} removed`);
        }
        if (parts.length === 0) {
          parts.push('All cards matched with no changes needed');
        }
        setLastResultSummary(
          `Deck synced (${parts.join(' · ')}) — existing spaced-repetition progress preserved.`
        );
        setStagedFiles([]);
        setRemoveMissing(false);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? `Update failed: ${err.message}` : 'Failed to apply deck update.'
      );
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <section className="paper-sheet rounded-lg p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif-display text-lg font-semibold text-[#1F1A14] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#174BB8]" aria-hidden="true" />
            <span>Update Deck from Revised File</span>
          </h2>
          <p className="text-xs text-[#564D40] mt-0.5">
            Upload an updated CSV, PDF, or DOCX with spelling fixes or extra cards — your review
            history &amp; intervals stay intact.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={`.pdf,application/pdf,.docx,${DOCX_MIME},.csv,text/csv`}
          multiple
          onChange={handleFileChange}
          className="sr-only"
          id={`update-deck-file-${deck.id}`}
        />
        <button
          type="button"
          disabled={isParsing || isApplying}
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 text-xs font-semibold rounded-md btn-ivory-tactile inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
        >
          <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isParsing ? 'Reading file…' : 'Upload Updated File'}</span>
        </button>
      </div>

      {stagedFiles.length === 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`recessed-well rounded-lg p-3 transition-all ${
            isDragging ? 'ring-2 ring-[#194BB8]' : ''
          }`}
        >
          <div className="border border-dashed border-[#ACA391] rounded px-4 py-4 text-center text-xs text-[#5B5245] bg-[#E6E0D3]/50">
            Drop an updated <span className="font-mono font-semibold">.csv</span>,{' '}
            <span className="font-mono font-semibold">.pdf</span>, or{' '}
            <span className="font-mono font-semibold">.docx</span> here to compare edits &amp; new
            cards.
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50/80 px-3.5 py-2.5 flex items-center gap-2 text-xs text-[#B91C1C]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {lastResultSummary && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50/80 px-3.5 py-2.5 flex items-center gap-2 text-xs font-medium text-[#166534]">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{lastResultSummary}</span>
        </div>
      )}

      {stagedFiles.length > 0 && plan && (
        <div className="space-y-4 pt-2 border-t border-[#E3DDD0]">
          {/* CSV Column Mapping if applicable */}
          {stagedFiles
            .filter((f) => f.documentKind === 'csv' && f.csvConfig)
            .map((file) => (
              <div
                key={file.tempFileId}
                className="recessed-well rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <span className="font-mono text-[#5B5245]">{file.name}</span>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 font-medium text-[#1F1A14] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={file.csvConfig!.hasHeader}
                      onChange={(e) =>
                        updateCsvMapping(file.tempFileId, { hasHeader: e.target.checked })
                      }
                      className="rounded border-[#ACA391] text-[#194BB8] cursor-pointer"
                    />
                    <span>First row is header</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-[#6B6153]">Question:</span>
                    <select
                      aria-label={`Question column for ${file.name}`}
                      value={file.csvConfig!.questionCol}
                      onChange={(e) =>
                        updateCsvMapping(file.tempFileId, {
                          questionCol: Number(e.target.value),
                        })
                      }
                      className="px-2 py-1 text-xs font-semibold rounded btn-ivory-tactile cursor-pointer"
                    >
                      {file.csvConfig!.headers.map((header, idx) => (
                        <option key={idx} value={idx}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-[#166534]">Answer:</span>
                    <select
                      aria-label={`Answer column for ${file.name}`}
                      value={file.csvConfig!.answerCol}
                      onChange={(e) =>
                        updateCsvMapping(file.tempFileId, {
                          answerCol: Number(e.target.value),
                        })
                      }
                      className="px-2 py-1 text-xs font-semibold rounded btn-ivory-tactile cursor-pointer"
                    >
                      {file.csvConfig!.headers.map((header, idx) => (
                        <option key={idx} value={idx}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}

          {/* 4-column Diff Summary */}
          <div className="recessed-well rounded-lg grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#C3BBA9] text-center py-3">
            <div>
              <p className="font-mono text-lg font-semibold text-[#5B5245] tabular-nums">
                {plan.unchangedCards.length}
              </p>
              <p className="text-[11px] font-medium text-[#564D40]">Unchanged</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-[#174BB8] tabular-nums">
                {plan.updatedCards.length}
              </p>
              <p className="text-[11px] font-medium text-[#564D40]">Updated / Fixes</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-[#166534] tabular-nums">
                {plan.addedCards.length}
              </p>
              <p className="text-[11px] font-medium text-[#564D40]">New Cards</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-[#B45309] tabular-nums">
                {plan.missingCards.length}
              </p>
              <p className="text-[11px] font-medium text-[#564D40]">Only in Old Deck</p>
            </div>
          </div>

          {/* Preview of Updated Cards (e.g. spelling corrections) */}
          {plan.updatedCards.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-[11px] font-semibold text-[#174BB8]">
                CARDS TO UPDATE ({plan.updatedCards.length}) · STUDY PROGRESS PRESERVED
              </p>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {plan.updatedCards.slice(0, 12).map((diff) => (
                  <div
                    key={diff.existingCard.id}
                    className="rounded-md border border-[#DED8C8] bg-[#FCFBF7] p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-[#6B6153]">
                      <span className="font-semibold text-[#174BB8]">{diff.reason}</span>
                      <span>
                        {diff.existingCard.reps > 0
                          ? `Progress kept · ${diff.existingCard.reps} reps`
                          : 'New card state kept'}
                      </span>
                    </div>

                    {diff.updatedCard.pdfFileId ? (
                      <p className="font-mono text-[11px] text-[#1F1A14]">
                        {diff.updatedCard.sourceFileName} · Page {diff.updatedCard.questionPage}
                        {diff.updatedCard.answerPage ? ` & ${diff.updatedCard.answerPage}` : ''}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <span className="block font-mono text-[10px] text-[#7A6F5E]">
                            PREVIOUS
                          </span>
                          <p className="text-[#5B5245] line-clamp-2">
                            {diff.existingCard.questionText} — {diff.existingCard.answerText}
                          </p>
                        </div>
                        <div>
                          <span className="block font-mono text-[10px] text-[#166534]">
                            UPDATED
                          </span>
                          <p className="text-[#1F1A14] font-medium line-clamp-2">
                            {diff.updatedCard.questionText} — {diff.updatedCard.answerText}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {plan.updatedCards.length > 12 && (
                  <p className="font-mono text-[11px] text-[#6B6153]">
                    +{plan.updatedCards.length - 12} more updated cards…
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Preview of New Cards */}
          {plan.addedCards.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-[11px] font-semibold text-[#166534]">
                NEW CARDS TO ADD ({plan.addedCards.length})
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {plan.addedCards.slice(0, 10).map((card) => (
                  <div
                    key={card.id}
                    className="rounded-md border border-[#DED8C8] bg-[#FCFBF7] px-3 py-2 text-xs flex items-center justify-between gap-3"
                  >
                    {card.pdfFileId ? (
                      <span className="font-mono text-[#1F1A14]">
                        {card.sourceFileName} · Page {card.questionPage}
                        {card.answerPage ? ` & ${card.answerPage}` : ''}
                      </span>
                    ) : (
                      <span className="text-[#1F1A14] truncate">
                        <span className="font-semibold">{card.questionText}</span> —{' '}
                        <span className="text-[#564D40]">{card.answerText}</span>
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-[#166534] shrink-0">NEW</span>
                  </div>
                ))}
                {plan.addedCards.length > 10 && (
                  <p className="font-mono text-[11px] text-[#6B6153]">
                    +{plan.addedCards.length - 10} more new cards…
                  </p>
                )}
              </div>
            </div>
          )}

          {plan.missingCards.length > 0 && (
            <label className="recessed-well rounded-md px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-[#1F1A14] cursor-pointer">
              <input
                type="checkbox"
                checked={removeMissing}
                onChange={(e) => setRemoveMissing(e.target.checked)}
                className="rounded border-[#ACA391] text-[#B91C1C] cursor-pointer"
              />
              <span>
                Remove{' '}
                <strong className="font-semibold text-[#B91C1C]">
                  {plan.missingCards.length}
                </strong>{' '}
                existing {plan.missingCards.length === 1 ? 'card' : 'cards'} not present in the
                uploaded file (leave unchecked to keep them)
              </span>
            </label>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setStagedFiles([]);
                setRemoveMissing(false);
                setErrorMsg(null);
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-[#6B6153] hover:text-[#1F1A14] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isApplying}
              onClick={() => void handleApply()}
              className="px-5 py-2 text-xs font-semibold rounded-md btn-primary-tactile cursor-pointer disabled:opacity-50"
            >
              {isApplying
                ? 'Updating Deck…'
                : `Apply Update (${plan.updatedCards.length} updated, ${plan.addedCards.length} new)`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
