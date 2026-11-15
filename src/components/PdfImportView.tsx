import React, { useEffect, useRef, useState } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import type { StagedPdfFile } from '../types/flashcard';
import { createSampleStudyPdf, stagePdfFiles } from '../lib/pdfParser';
import { getLocalDateString } from '../lib/spacedRepetition';
import { PdfPageCanvas } from './PdfPageCanvas';

interface PdfImportViewProps {
  initialFiles?: File[];
  onSaveImportedDecks: (
    groups: Array<{
      title: string;
      examDate: string | null;
      files: StagedPdfFile[];
    }>
  ) => Promise<void>;
  onCancel: () => void;
}

export const PdfImportView: React.FC<PdfImportViewProps> = ({
  initialFiles,
  onSaveImportedDecks,
  onCancel,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingPdfs, setIsLoadingPdfs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedPdfFile[]>([]);
  const [combineIntoOneDeck, setCombineIntoOneDeck] = useState(true);
  const [combinedTitle, setCombinedTitle] = useState('');
  const [perFileTitles, setPerFileTitles] = useState<Record<string, string>>({});
  const [examDate, setExamDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const todayStr = getLocalDateString();

  const processFiles = async (fileList: File[]) => {
    const pdfFiles = fileList.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (pdfFiles.length === 0) {
      setErrorMsg('Please choose one or more valid PDF files.');
      return;
    }

    setErrorMsg(null);
    setIsLoadingPdfs(true);

    try {
      const results = await stagePdfFiles(pdfFiles);
      setStagedFiles(results);

      const defaultTitles: Record<string, string> = {};
      results.forEach((r) => {
        defaultTitles[r.tempFileId] = r.name.replace(/\.pdf$/i, '');
      });
      setPerFileTitles(defaultTitles);

      if (results.length === 1) {
        setCombinedTitle(results[0].name.replace(/\.pdf$/i, ''));
      } else {
        setCombinedTitle(`Study Deck (${results.length} PDFs)`);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Could not open PDF: ${err.message}`
          : 'Unable to open the selected PDF.'
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

  const handleSave = async () => {
    if (totalPairCount === 0) return;
    setIsSaving(true);
    try {
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
            title: (perFileTitles[file.tempFileId] || file.name.replace(/\.pdf$/i, '')).trim(),
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
            Add PDFs to Desk
          </h1>
          <p className="text-sm text-[#564D40]">
            Odd pages become questions. Even pages become answers. Stored raw on your device.
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
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFileChange}
          className="sr-only"
          id="pdf-upload-input"
        />

        <div className="border-2 border-dashed border-[#ACA391] rounded-lg px-6 py-10 text-center space-y-4 bg-[#E6E0D3]/60">
          <p className="font-serif-display text-xl font-semibold text-[#1F1A14]">
            Drop one or more PDF files into the tray
          </p>
          <p className="font-mono text-xs text-[#5B5245]">
            Processed locally in IndexedDB · Zero cloud uploads
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              disabled={isLoadingPdfs}
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2 text-sm font-semibold rounded-md btn-primary-tactile transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoadingPdfs ? 'Opening PDF…' : 'Choose PDFs'}
            </button>

            <button
              type="button"
              disabled={isLoadingPdfs}
              onClick={handleTestSamplePdf}
              className="px-4 py-2 text-sm font-semibold rounded-md btn-ivory-tactile transition-all cursor-pointer disabled:opacity-50"
            >
              Load Sample PDF
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
                  From {stagedFiles.length} PDF{stagedFiles.length === 1 ? '' : 's'}
                </p>
              </div>

              {stagedFiles.length > 1 && (
                <div className="recessed-well flex items-center p-1 rounded-lg self-start gap-1">
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
                {isSaving ? 'Binding Deck…' : 'Save & Start Studying'}
              </button>
            </div>
          </div>

          {/* Physical Pair Previews */}
          <div className="space-y-4">
            {stagedFiles.map((file) => (
              <div key={file.tempFileId} className="space-y-4">
                <p className="font-mono text-xs text-[#5B5245] tabular-nums">
                  {file.name} · {file.pageCount} pages
                </p>

                <div className="space-y-5">
                  {file.drafts.map((draft, idx) => (
                    <div key={draft.tempId} className="paper-sheet rounded-lg p-5 space-y-4">
                      <div className="flex items-center justify-between font-mono text-xs text-[#6B6153] tabular-nums pb-2 border-b border-[#E5DFD2]">
                        <span>
                          CARD {String(idx + 1).padStart(2, '0')} · PAGE {draft.questionPage} &amp;{' '}
                          {draft.answerPage ?? 'NO ANSWER PAGE'}
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

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                          <span className="block font-mono text-[11px] font-medium text-[#6B6153]">
                            QUESTION (PAGE {draft.questionPage})
                          </span>
                          <div className="rounded-sm overflow-hidden border border-[#C6BEB0] shadow-inner">
                            <PdfPageCanvas
                              pdfFileId={file.tempFileId}
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
                              <PdfPageCanvas
                                pdfFileId={file.tempFileId}
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
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
