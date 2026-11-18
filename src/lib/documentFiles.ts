import type { StagedPdfFile } from '../types/flashcard';
import { isCsvFile, stageCsvFiles } from './csvParser';
import {
  clearAllCachedDocxDocuments,
  clearCachedDocxDocument,
  isDocxFile,
  isPdfFile,
  stageDocxFiles,
} from './docxParser';
import {
  clearAllCachedPdfDocuments,
  clearCachedPdfDocument,
  stagePdfFiles,
} from './pdfParser';

export function isSupportedStudyFile(file: { name: string; type?: string }): boolean {
  return isPdfFile(file) || isDocxFile(file) || isCsvFile(file);
}

export async function stageStudyFiles(files: File[]): Promise<StagedPdfFile[]> {
  const staged: StagedPdfFile[] = [];

  for (const file of files) {
    if (isDocxFile(file)) {
      const items = await stageDocxFiles([file]);
      staged.push(...items);
    } else if (isPdfFile(file)) {
      const items = await stagePdfFiles([file]);
      staged.push(...items);
    } else if (isCsvFile(file)) {
      const items = await stageCsvFiles([file]);
      staged.push(...items);
    }
  }

  return staged;
}

export function clearCachedStudyDocument(id: string): void {
  clearCachedPdfDocument(id);
  clearCachedDocxDocument(id);
}

export function clearAllCachedStudyDocuments(): void {
  clearAllCachedPdfDocuments();
  clearAllCachedDocxDocuments();
}
