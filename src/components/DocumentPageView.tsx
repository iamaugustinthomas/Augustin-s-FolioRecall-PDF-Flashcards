import React from 'react';
import type { DocumentKind } from '../types/flashcard';
import { resolveDocumentKind } from '../lib/docxParser';
import { PdfPageCanvas } from './PdfPageCanvas';
import { DocxPageView } from './DocxPageView';

interface DocumentPageViewProps {
  fileId: string;
  pageNumber: number;
  documentKind?: DocumentKind;
  sourceFileName?: string;
  buffer?: ArrayBuffer;
  className?: string;
  fitMode?: 'contain' | 'width';
  maxHeightPx?: number;
  maxHeightClass?: string;
}

export const DocumentPageView: React.FC<DocumentPageViewProps> = ({
  fileId,
  pageNumber,
  documentKind,
  sourceFileName,
  buffer,
  className,
  fitMode = 'contain',
  maxHeightPx,
  maxHeightClass,
}) => {
  const kind = resolveDocumentKind(documentKind, sourceFileName);

  if (kind === 'docx') {
    return (
      <DocxPageView
        fileId={fileId}
        pageNumber={pageNumber}
        buffer={buffer}
        className={className}
        fitMode={fitMode}
        maxHeightPx={maxHeightPx}
        maxHeightClass={maxHeightClass}
      />
    );
  }

  return (
    <PdfPageCanvas
      pdfFileId={fileId}
      pageNumber={pageNumber}
      buffer={buffer}
      className={className}
      fitMode={fitMode}
      maxHeightPx={maxHeightPx}
      maxHeightClass={maxHeightClass}
    />
  );
};
