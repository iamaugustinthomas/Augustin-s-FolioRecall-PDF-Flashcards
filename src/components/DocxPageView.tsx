import React, { useEffect, useRef, useState } from 'react';
import { getCachedDocxDocument, type CachedDocxDocument } from '../lib/docxParser';

interface DocxPageViewProps {
  fileId: string;
  pageNumber: number;
  buffer?: ArrayBuffer;
  className?: string;
  fitMode?: 'contain' | 'width';
  maxHeightPx?: number;
  maxHeightClass?: string;
}

export const DocxPageView: React.FC<DocxPageViewProps> = ({
  fileId,
  pageNumber,
  buffer,
  className = '',
  fitMode = 'contain',
  maxHeightPx,
  maxHeightClass = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(760);
  const [docData, setDocData] = useState<CachedDocxDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void getCachedDocxDocument(fileId, buffer)
      .then((res) => {
        if (!cancelled) {
          setDocData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to render DOCX page.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileId, buffer]);

  const page = docData?.pages[pageNumber - 1] ?? null;

  let cssScale = 1;
  let scaledW = containerWidth;
  let scaledH = 300;

  if (page) {
    const scaleByWidth = Math.max(120, containerWidth) / page.widthPx;
    cssScale = scaleByWidth;
    if (fitMode === 'contain' && maxHeightPx && maxHeightPx > 0) {
      const scaleByHeight = maxHeightPx / page.heightPx;
      cssScale = Math.min(scaleByWidth, scaleByHeight);
    }
    scaledW = Math.max(1, Math.floor(page.widthPx * cssScale));
    scaledH = Math.max(1, Math.floor(page.heightPx * cssScale));
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-white ${
        fitMode === 'width' ? 'overflow-auto' : 'overflow-hidden'
      } ${maxHeightClass} ${className}`}
    >
      {error ? (
        <div className="p-6 text-xs text-red-700">
          Unable to display DOCX page {pageNumber}: {error}
        </div>
      ) : isLoading || !docData || !page ? (
        <div className="p-8 text-center font-mono text-xs text-[#6B6153]">
          {isLoading ? `Rendering page ${pageNumber}…` : `Page ${pageNumber} not found.`}
        </div>
      ) : (
        <div className="flex justify-center">
          <div
            style={{ width: `${scaledW}px`, height: `${scaledH}px` }}
            className="relative overflow-hidden bg-white shrink-0"
          >
            <div
              className={`${docData.className}-wrapper`}
              style={{
                width: `${page.widthPx}px`,
                height: `${page.heightPx}px`,
                transform: `scale(${cssScale})`,
                transformOrigin: 'top left',
              }}
              aria-label={`DOCX page ${pageNumber}`}
              dangerouslySetInnerHTML={{ __html: page.html }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
