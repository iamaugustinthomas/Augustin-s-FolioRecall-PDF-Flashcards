import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import type { Deck, Flashcard, StagedPdfFile } from '../types/flashcard';
import { createSampleStudyPdf } from '../lib/pdfParser';
import { DOCX_MIME } from '../lib/docxParser';
import { buildCsvDrafts, createSampleStudyCsv } from '../lib/csvParser';
import { isSupportedStudyFile, stageStudyFiles } from '../lib/documentFiles';
import { buildDeckFileUpdatePlan } from '../lib/deckUpdater';
import { getLocalDateString } from '../lib/spacedRepetition';
import { DocumentPageView } from './DocumentPageView';

interface PdfImportViewProps {
  initialFiles?: File[];
  existingDecks?: Deck[];
  existingCards?: Flashcard[];
  onSaveImportedDecks: (
    groups: Array<{
      title: string;
      examDate: string | null;
      files: StagedPdfFile[];
    }>
  ) => Promise<void>;
  onUpdateExistingDeck?: (
    deckId: string,
    stagedFiles: StagedPdfFile[],
    removeMissing: boolean
  ) => Promise<void>;
  onCancel: () => void;
}

export const PdfImportView: React.FC<PdfImportViewProps> = ({
  initialFiles,
  existingDecks = [],
  existingCards = [],
  onSaveImportedDecks,
  onUpdateExistingDeck,
  onCancel,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingPdfs, setIsLoadingPdfs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedPdfFile[]>([]);
  const [importTargetMode, setImportTargetMode] = useState<'new' | 'update'>('new');
  const [targetDeckId, setTargetDeckId] = useState<string>(existingDecks[0]?.id ?? '');
  const [removeMissing, setRemoveMissing] = useState(false);
  const [combineIntoOneDeck, setCombineIntoOneDeck] = useState(true);
  const [combinedTitle, setCombinedTitle] = useState('');
  const [perFileTitles, setPerFileTitles] = useState<Record<string, string>>({});
  const [examDate, setExamDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const todayStr = getLocalDateString();

  const stripDocExtension = (name: string) => name.replace(/\.(pdf|docx|csv)$/i, '');

  const processFiles = async (fileList: File[]) => {
    const validFiles = fileList.filter((f) => isSupportedStudyFile(f));
    if (validFiles.length === 0) {
      setErrorMsg('Please choose one or more valid PDF, DOCX, or CSV files.');
      return;
    }

    setErrorMsg(null);
    setIsLoadingPdfs(true);

    try {
      const results = await stageStudyFiles(validFiles);
      setStagedFiles(results);

      const defaultTitles: Record<string, string> = {};
      results.forEach((r) => {
        defaultTitles[r.tempFileId] = stripDocExtension(r.name);
      });
      setPerFileTitles(defaultTitles);

      if (results.length === 1) {
        setCombinedTitle(stripDocExtension(results[0].name));
      } else {
        setCombinedTitle(`Study Deck (${results.length} Files)`);
      }

      if (existingDecks.length > 0) {
        const uploadedLower = new Set(results.map((r) => r.name.toLowerCase()));
        const matchingDeck = existingDecks.find((d) =>
          (d.sourceFiles ?? []).some((sf) => uploadedLower.has(sf.toLowerCase()))
        );
        setTargetDeckId((prev) => matchingDeck?.id ?? (prev || existingDecks[0].id));
      }
      setRemoveMissing(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Could not open file: ${err.message}`
          : 'Unable to open the selected file.'
      );
    } finally {
      setIsLoadingPdfs(false);
    }
  };

  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      void processFiles(initialFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

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

  const handleTestSamplePdf = async () => {
    const sampleFile = createSampleStudyPdf();
    await processFiles([sampleFile]);
  };

  const handleTestSampleCsv = async () => {
    const sampleCsv = createSampleStudyCsv();
    await processFiles([sampleCsv]);
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

  const removeDraft = (tempFileId: string, tempId: string) => {
    setStagedFiles((prev) =>
      prev
        .map((file) =>
          file.tempFileId !== tempFileId
            ? file
            : { ...file, drafts: file.drafts.filter((d) => d.tempId !== tempId) }
        )
        .filter((file) => file.drafts.length > 0)
    );
  };

  const totalPairCount = stagedFiles.reduce((acc, f) => acc + f.drafts.length, 0);

  const selectedUpdateDeck = useMemo(
    () => existingDecks.find((d) => d.id === targetDeckId) ?? existingDecks[0] ?? null,
    [existingDecks, targetDeckId]
  );

  const updatePlan = useMemo(() => {
    if (importTargetMode !== 'update' || !selectedUpdateDeck || stagedFiles.length === 0) {
      return null;
    }
    return buildDeckFileUpdatePlan({
      deck: selectedUpdateDeck,
      existingCards: existingCards.filter((c) => c.deckId === selectedUpdateDeck.id),
      stagedFiles,
      removeMissing,
    });
  }, [importTargetMode, selectedUpdateDeck, existingCards, stagedFiles, removeMissing]);

  const handleSave = async () => {
    if (totalPairCount === 0) return;
    setIsSaving(true);
    try {
      if (importTargetMode === 'update' && selectedUpdateDeck && onUpdateExistingDeck) {
        await onUpdateExistingDeck(selectedUpdateDeck.id, stagedFiles, removeMissing);
        return;
      }
      if (combineIntoOneDeck || stagedFiles.length === 1) {
        await onSaveImportedDecks([
          {
            title: combinedTitle.trim() || 'Study Deck',
            examDate: examDate || null,
            files: stagedFiles,
          },
        ]);
      } else {
        await onSaveImportedDecks(
          stagedFiles.map((file) => ({
            title: (perFileTitles[file.tempFileId] || stripDocExtension(file.name)).trim(),
            examDate: examDate || null,
            files: [file],
          }))
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-serif-display text-3xl font-semibold tracking-tight text-[#1F1A14] drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]">
            Add PDF, DOCX, or CSV to Desk
          </h1>
          <p className="text-sm text-[#564D40]">
            PDF &amp; DOCX pair odd/even pages as-is. CSV imports Question &amp; Answer rows onto ruled cards.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-1.5 text-xs font-semibold rounded-md btn-ivory-tactile cursor-pointer"
        >
          Cancel
        </button>
      </div>

      {/* Recessed Desk Tray Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`recessed-well rounded-xl p-4 transition-all duration-150 ${
          isDragging ? 'ring-2 ring-[#194BB8]' : ''
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={`.pdf,application/pdf,.docx,${DOCX_MIME},.csv,text/csv`}
          multiple
          onChange={handleFileChange}
          className="sr-only"
          id="pdf-upload-input"
        />

        <div className="border-2 border-dashed border-[#ACA391] rounded-lg px-6 py-10 text-center space-y-4 bg-[#E6E0D3]/60">
          <p className="font-serif-display text-xl font-semibold text-[#1F1A14]">
            Drop PDF, DOCX, or CSV files into the tray
          </p>
          <p className="font-mono text-xs text-[#5B5245]">
            Processed locally in your browser · Zero cloud uploads
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              disabled={isLoadingPdfs}
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2 text-sm font-semibold rounded-md btn-primary-tactile transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoadingPdfs ? 'Opening files…' : 'Choose Files'}
            </button>

            <button
              type="button"
              disabled={isLoadingPdfs}
              onClick={handleTestSamplePdf}
              className="px-4 py-2 text-sm font-semibold rounded-md btn-ivory-tactile transition-all cursor-pointer disabled:opacity-50"
            >
              Load Sample PDF
            </button>

            <button
              type="button"
              disabled={isLoadingPdfs}
              onClick={handleTestSampleCsv}
              className="px-4 py-2 text-sm font-semibold rounded-md btn-ivory-tactile transition-all cursor-pointer disabled:opacity-50"
            >
              Load Sample CSV
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="paper-sheet border-red-300 rounded-lg p-4 flex items-center gap-3 text-sm text-[#B91C1C]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {stagedFiles.length > 0 && !isLoadingPdfs && (
        <section className="space-y-8">
          <div className="paper-sheet rounded-lg p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E3DDD0]">
              <div>
                <h2 className="font-serif-display text-xl font-semibold text-[#1F1A14] tabular-nums">
                  {totalPairCount} {totalPairCount === 1 ? 'card' : 'cards'} staged
                </h2>
                <p className="font-mono text-xs text-[#6B6153] tabular-nums">
                  From {stagedFiles.length} {stagedFiles.length === 1 ? 'file' : 'files'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 self-start">
                {existingDecks.length > 0 && onUpdateExistingDeck && (
                  <div className="recessed-well flex items-center p-1 rounded-lg gap-1">
                    <button
                      type="button"
                      onClick={() => setImportTargetMode('new')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        importTargetMode === 'new'
                          ? 'btn-ivory-tactile'
                          : 'text-[#564D40] hover:text-[#1F1A14]'
                      }`}
                    >
                      Create New Deck
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportTargetMode('update')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        importTargetMode === 'update'
                          ? 'btn-ivory-tactile'
                          : 'text-[#564D40] hover:text-[#1F1A14]'
                      }`}
                    >
                      Update Existing Deck
                    </button>
                  </div>
                )}

                {importTargetMode === 'new' && stagedFiles.length > 1 && (
                  <div className="recessed-well flex items-center p-1 rounded-lg gap-1">
                    <button
                      type="button"
                      onClick={() => setCombineIntoOneDeck(true)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        combineIntoOneDeck
                          ? 'btn-ivory-tactile'
                          : 'text-[#564D40] hover:text-[#1F1A14]'
                      }`}
                    >
                      One Deck
                    </button>
                    <button
                      type="button"
                      onClick={() => setCombineIntoOneDeck(false)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        !combineIntoOneDeck
                          ? 'btn-ivory-tactile'
                          : 'text-[#564D40] hover:text-[#1F1A14]'
                      }`}
                    >
                      Separate Decks
                    </button>
                  </div>
                )}
              </div>
            </div>

            {importTargetMode === 'update' && selectedUpdateDeck ? (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="update-target-deck"
                    className="block text-xs font-semibold text-[#564D40] mb-1.5"
                  >
                    Deck to Update (Preserves existing study progress &amp; intervals)
                  </label>
                  <select
                    id="update-target-deck"
                    value={selectedUpdateDeck.id}
                    onChange={(e) => setTargetDeckId(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-semibold rounded-md btn-ivory-tactile cursor-pointer"
                  >
                    {existingDecks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>

                {updatePlan && (
                  <>
                    <div className="recessed-well rounded-lg grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#C3BBA9] text-center py-3">
                      <div>
                        <p className="font-mono text-lg font-semibold text-[#5B5245] tabular-nums">
                          {updatePlan.unchangedCards.length}
                        </p>
                        <p className="text-[11px] font-medium text-[#564D40]">Unchanged</p>
                      </div>
                      <div>
                        <p className="font-mono text-lg font-semibold text-[#174BB8] tabular-nums">
                          {updatePlan.updatedCards.length}
                        </p>
                        <p className="text-[11px] font-medium text-[#564D40]">Updated / Fixes</p>
                      </div>
                      <div>
                        <p className="font-mono text-lg font-semibold text-[#166534] tabular-nums">
                          {updatePlan.addedCards.length}
                        </p>
                        <p className="text-[11px] font-medium text-[#564D40]">New Cards</p>
                      </div>
                      <div>
                        <p className="font-mono text-lg font-semibold text-[#B45309] tabular-nums">
                          {updatePlan.missingCards.length}
                        </p>
                        <p className="text-[11px] font-medium text-[#564D40]">Only in Old Deck</p>
                      </div>
                    </div>

                    {updatePlan.missingCards.length > 0 && (
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
                            {updatePlan.missingCards.length}
                          </strong>{' '}
                          existing {updatePlan.missingCards.length === 1 ? 'card' : 'cards'} not
                          present in the uploaded file
                        </span>
                      </label>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {combineIntoOneDeck || stagedFiles.length === 1 ? (
                  <div className="md:col-span-2">
                    <label
                      htmlFor="imported-deck-title"
                      className="block text-xs font-semibold text-[#564D40] mb-1.5"
                    >
                      Deck Name
                    </label>
                    <input
                      id="imported-deck-title"
                      type="text"
                      value={combinedTitle}
                      onChange={(e) => setCombinedTitle(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-md recessed-input text-[#1F1A14] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                    />
                  </div>
                ) : (
                  <div className="md:col-span-2 space-y-2">
                    <span className="block text-xs font-semibold text-[#564D40]">Deck Names</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {stagedFiles.map((f) => (
                        <input
                          key={f.tempFileId}
                          type="text"
                          aria-label={`Deck title for ${f.name}`}
                          value={perFileTitles[f.tempFileId] ?? ''}
                          onChange={(e) =>
                            setPerFileTitles((prev) => ({
                              ...prev,
                              [f.tempFileId]: e.target.value,
                            }))
                          }
                          className="w-full px-3.5 py-2 text-sm rounded-md recessed-input text-[#1F1A14] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="imported-exam-date"
                    className="block text-xs font-semibold text-[#564D40] mb-1.5"
                  >
                    Target Exam Date
                  </label>
                  <input
                    id="imported-exam-date"
                    type="date"
                    min={todayStr}
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-md recessed-input text-[#1F1A14] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/35"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-4 pt-1">
              <button
                type="button"
                onClick={() => setStagedFiles([])}
                className="text-xs font-semibold text-[#6B6153] hover:text-[#1F1A14] cursor-pointer"
              >
                Clear Tray
              </button>
              <button
                type="button"
                disabled={isSaving || totalPairCount === 0}
                onClick={handleSave}
                className="px-6 py-2 text-sm font-semibold rounded-md btn-primary-tactile transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving
                  ? importTargetMode === 'update'
                    ? 'Updating Deck…'
                    : 'Binding Deck…'
                  : importTargetMode === 'update'
                  ? 'Update Deck & Start Studying'
                  : 'Save & Start Studying'}
              </button>
            </div>
          </div>

          {/* Physical Pair Previews */}
          <div className="space-y-6">
            {stagedFiles.map((file) => {
              const isCsv = file.documentKind === 'csv' && Boolean(file.csvConfig);
              return (
                <div key={file.tempFileId} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-mono text-xs text-[#5B5245] tabular-nums">
                      {file.name} ·{' '}
                      {isCsv
                        ? `${file.drafts.length} ${file.drafts.length === 1 ? 'row' : 'rows'}`
                        : `${file.pageCount} pages`}
                    </p>

                    {isCsv && file.csvConfig && (
                      <div className="paper-sheet rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-4 text-xs">
                        <label className="inline-flex items-center gap-2 font-medium text-[#1F1A14] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={file.csvConfig.hasHeader}
                            onChange={(e) =>
                              updateCsvMapping(file.tempFileId, {
                                hasHeader: e.target.checked,
                              })
                            }
                            className="rounded border-[#ACA391] text-[#194BB8] cursor-pointer"
                          />
                          <span>First row is header</span>
                        </label>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-[#6B6153]">
                            Question:
                          </span>
                          <select
                            aria-label={`Question column for ${file.name}`}
                            value={file.csvConfig.questionCol}
                            onChange={(e) =>
                              updateCsvMapping(file.tempFileId, {
                                questionCol: Number(e.target.value),
                              })
                            }
                            className="px-2.5 py-1 text-xs font-semibold rounded btn-ivory-tactile cursor-pointer"
                          >
                            {file.csvConfig.headers.map((header, colIdx) => (
                              <option key={colIdx} value={colIdx}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-[#166534]">
                            Answer:
                          </span>
                          <select
                            aria-label={`Answer column for ${file.name}`}
                            value={file.csvConfig.answerCol}
                            onChange={(e) =>
                              updateCsvMapping(file.tempFileId, {
                                answerCol: Number(e.target.value),
                              })
                            }
                            className="px-2.5 py-1 text-xs font-semibold rounded btn-ivory-tactile cursor-pointer"
                          >
                            {file.csvConfig.headers.map((header, colIdx) => (
                              <option key={colIdx} value={colIdx}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-5">
                    {file.drafts.map((draft, idx) => (
                      <div key={draft.tempId} className="paper-sheet rounded-lg p-5 space-y-4">
                        <div className="flex items-center justify-between font-mono text-xs text-[#6B6153] tabular-nums pb-2 border-b border-[#E5DFD2]">
                          <span>
                            {isCsv
                              ? `CARD ${String(idx + 1).padStart(2, '0')} · CSV ROW ${draft.questionPage}`
                              : `CARD ${String(idx + 1).padStart(2, '0')} · PAGE ${
                                  draft.questionPage
                                } & ${draft.answerPage ?? 'NO ANSWER PAGE'}`}
                          </span>

                          <button
                            type="button"
                            aria-label={`Remove card ${idx + 1}`}
                            onClick={() => removeDraft(file.tempFileId, draft.tempId)}
                            className="p-1 text-[#7A6F5E] hover:text-[#B91C1C] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>

                        {isCsv ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                              <span className="block font-mono text-[11px] font-medium text-[#6B6153]">
                                QUESTION
                              </span>
                              <div className="p-5 ruled-paper min-h-[140px] rounded-sm border border-[#DED8C8] bg-[#FCFBF7] font-serif-display text-base text-[#1F1A14] whitespace-pre-wrap">
                                {draft.questionText}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <span className="block font-mono text-[11px] font-medium text-[#166534]">
                                ANSWER
                              </span>
                              <div className="p-5 ruled-paper min-h-[140px] rounded-sm border border-[#DED8C8] bg-[#FCFBF7] text-sm text-[#1F1A14] whitespace-pre-wrap">
                                {draft.answerText || 'No answer in this row.'}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                              <span className="block font-mono text-[11px] font-medium text-[#6B6153]">
                                QUESTION (PAGE {draft.questionPage})
                              </span>
                              <div className="rounded-sm overflow-hidden border border-[#C6BEB0] shadow-inner">
                                <DocumentPageView
                                  fileId={file.tempFileId}
                                  documentKind={file.documentKind}
                                  sourceFileName={file.name}
                                  pageNumber={draft.questionPage}
                                  buffer={file.data}
                                  fitMode="contain"
                                  maxHeightPx={560}
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <span className="block font-mono text-[11px] font-medium text-[#166534]">
                                ANSWER ({draft.answerPage ? `PAGE ${draft.answerPage}` : 'MISSING'})
                              </span>
                              {draft.answerPage ? (
                                <div className="rounded-sm overflow-hidden border border-[#C6BEB0] shadow-inner">
                                  <DocumentPageView
                                    fileId={file.tempFileId}
                                    documentKind={file.documentKind}
                                    sourceFileName={file.name}
                                    pageNumber={draft.answerPage}
                                    buffer={file.data}
                                    fitMode="contain"
                                    maxHeightPx={560}
                                  />
                                </div>
                              ) : (
                                <div className="h-44 recessed-well rounded-sm flex items-center justify-center p-4 text-center font-mono text-xs text-[#5B5245]">
                                  Odd total page count — no even answer page follows page{' '}
                                  {draft.questionPage}.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
