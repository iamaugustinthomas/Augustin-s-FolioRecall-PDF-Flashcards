import React, { useEffect, useRef, useState } from 'react';
import { getCachedPdfDocument } from '../lib/pdfParser';

interface PdfPageCanvasProps {
  pdfFileId: string;
  pageNumber: number;
  buffer?: ArrayBuffer;
  className?: string;
  fitMode?: 'contain' | 'width';
  maxHeightPx?: number;
  maxHeightClass?: string;
}

export const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfFileId,
  pageNumber,
  buffer,
  className = '',
  fitMode = 'contain',
  maxHeightPx,
  maxHeightClass = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number>(760);

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
    let activeRenderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const renderPage = async () => {
      setIsRendering(true);
      setError(null);

      try {
        const doc = await getCachedPdfDocument(pdfFileId, buffer);
        if (cancelled) return;

        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const targetCssWidth = Math.max(120, containerWidth);
        const scaleByWidth = targetCssWidth / baseViewport.width;

        let cssScale = scaleByWidth;
        if (fitMode === 'contain' && maxHeightPx && maxHeightPx > 0) {
          const scaleByHeight = maxHeightPx / baseViewport.height;
          cssScale = Math.min(scaleByWidth, scaleByHeight);
        }

        const renderViewport = page.getViewport({ scale: cssScale * dpr });

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(renderViewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(renderViewport.height / dpr)}px`;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({
          canvasContext: ctx,
          viewport: renderViewport,
          canvas,
        });
        activeRenderTask = task;

        await task.promise;
        if (!cancelled) {
          setIsRendering(false);
        }
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        if (name === 'RenderingCancelledException') return;
        setError(err instanceof Error ? err.message : 'Unable to render PDF page.');
        setIsRendering(false);
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (activeRenderTask) {
        try {
          activeRenderTask.cancel();
        } catch {
          // ignore cancellation
        }
      }
    };
  }, [pdfFileId, pageNumber, buffer, containerWidth, fitMode, maxHeightPx]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-white ${
        fitMode === 'width' ? 'overflow-auto' : 'overflow-hidden'
      } ${maxHeightClass} ${className}`}
    >
      {error ? (
        <div className="p-6 text-xs text-red-700">
          Unable to display page {pageNumber}: {error}
        </div>
      ) : (
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            aria-label={`PDF page ${pageNumber}`}
            className={`block transition-opacity duration-150 ${
              isRendering ? 'opacity-50' : 'opacity-100'
            }`}
          />
        </div>
      )}
    </div>
  );
};
