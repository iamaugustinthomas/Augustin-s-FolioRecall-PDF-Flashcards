import { renderAsync } from 'docx-preview';
import type { DocumentKind, StagedPdfFile } from '../types/flashcard';
import { getPdfFile } from './storage';

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface RenderedDocxPage {
  html: string;
  widthPx: number;
  heightPx: number;
}

export interface CachedDocxDocument {
  className: string;
  pages: RenderedDocxPage[];
}

const docxCache = new Map<string, Promise<CachedDocxDocument>>();

export function isDocxFile(file: { name: string; type?: string }): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.docx') || file.type === DOCX_MIME;
}

export function isPdfFile(file: { name: string; type?: string }): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.pdf') || file.type === 'application/pdf';
}

export function isSupportedStudyFile(file: { name: string; type?: string }): boolean {
  return isPdfFile(file) || isDocxFile(file);
}

export function resolveDocumentKind(
  documentKind?: DocumentKind,
  sourceFileName?: string
): DocumentKind {
  if (documentKind) return documentKind;
  if (sourceFileName) {
    const lower = sourceFileName.toLowerCase();
    if (lower.endsWith('.docx')) return 'docx';
    if (lower.endsWith('.csv')) return 'csv';
  }
  return 'pdf';
}

function makeScopedClassName(cacheKey: string): string {
  const clean = cacheKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) || 'doc';
  return `docx_${clean}`;
}

function injectDocxStyles(
  cacheKey: string,
  className: string,
  styleHost: HTMLElement
): void {
  const existing = document.head.querySelectorAll(
    `style[data-docx-key="${cacheKey}"]`
  );
  if (existing.length > 0) return;

  const styleNodes = Array.from(styleHost.querySelectorAll('style'));
  for (const node of styleNodes) {
    const cloned = document.createElement('style');
    cloned.setAttribute('data-docx-key', cacheKey);
    cloned.textContent = node.textContent;
    document.head.appendChild(cloned);
  }

  // Override docx-preview wrapper gray backdrop/padding so pages sit seamlessly inside paper cards
  const overrideStyle = document.createElement('style');
  overrideStyle.setAttribute('data-docx-key', cacheKey);
  overrideStyle.textContent = `
    .${className}-wrapper {
      background: transparent !important;
      padding: 0 !important;
      display: block !important;
    }
    .${className}-wrapper > section.${className} {
      margin: 0 !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(overrideStyle);
}

/**
 * Splits an overflowing single <section> (e.g. continuous DOCX without explicit
 * page breaks) into clean A4-proportioned <section> pages while preserving styles.
 */
function paginateOverflowingSection(
  section: HTMLElement,
  targetPageHeight: number
): HTMLElement[] {
  const article = section.querySelector(':scope > article') as HTMLElement | null;
  if (!article) return [section];

  const blocks = Array.from(article.children) as HTMLElement[];
  if (blocks.length <= 1) return [section];

  const computed = window.getComputedStyle(section);
  const padTop = parseFloat(computed.paddingTop) || 0;
  const padBottom = parseFloat(computed.paddingBottom) || 0;

  const headerEl = section.querySelector(':scope > header') as HTMLElement | null;
  const footerEl = section.querySelector(':scope > footer') as HTMLElement | null;
  const headerH = headerEl ? headerEl.offsetHeight : 0;
  const footerH = footerEl ? footerEl.offsetHeight : 0;

  const maxArticleHeight = Math.max(
    320,
    targetPageHeight - padTop - padBottom - headerH - footerH - 8
  );

  const buckets: HTMLElement[][] = [];
  let currentBucket: HTMLElement[] = [];
  let currentHeight = 0;

  for (const block of blocks) {
    const style = window.getComputedStyle(block);
    const marginTop = parseFloat(style.marginTop) || 0;
    const marginBottom = parseFloat(style.marginBottom) || 0;
    const blockH = Math.max(12, block.offsetHeight + marginTop + marginBottom);

    if (currentBucket.length > 0 && currentHeight + blockH > maxArticleHeight) {
      buckets.push(currentBucket);
      currentBucket = [block];
      currentHeight = blockH;
    } else {
      currentBucket.push(block);
      currentHeight += blockH;
    }
  }

  if (currentBucket.length > 0) {
    buckets.push(currentBucket);
  }

  if (buckets.length <= 1) return [section];

  return buckets.map((bucket) => {
    const pageShell = section.cloneNode(false) as HTMLElement;
    pageShell.style.height = `${Math.round(targetPageHeight)}px`;
    pageShell.style.minHeight = `${Math.round(targetPageHeight)}px`;

    if (headerEl) pageShell.appendChild(headerEl.cloneNode(true));

    const newArticle = article.cloneNode(false) as HTMLElement;
    for (const block of bucket) {
      newArticle.appendChild(block.cloneNode(true));
    }
    pageShell.appendChild(newArticle);

    if (footerEl) pageShell.appendChild(footerEl.cloneNode(true));
    return pageShell;
  });
}

export function getCachedDocxDocument(
  cacheKey: string,
  buffer?: ArrayBuffer
): Promise<CachedDocxDocument> {
  const existing = docxCache.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<CachedDocxDocument> => {
    let data = buffer;
    if (!data) {
      const stored = await getPdfFile(cacheKey);
      if (!stored) {
        throw new Error('Stored DOCX file could not be found in local IndexedDB.');
      }
      data = stored.data;
    }

    const className = makeScopedClassName(cacheKey);

    // Render offscreen so computed A4 dimensions & overflow pagination can be measured cleanly
    const offscreenRoot = document.createElement('div');
    offscreenRoot.style.position = 'fixed';
    offscreenRoot.style.left = '-20000px';
    offscreenRoot.style.top = '0';
    offscreenRoot.style.width = '1400px';
    offscreenRoot.style.visibility = 'hidden';
    offscreenRoot.style.pointerEvents = 'none';

    const styleHost = document.createElement('div');
    const bodyHost = document.createElement('div');
    offscreenRoot.appendChild(styleHost);
    offscreenRoot.appendChild(bodyHost);
    document.body.appendChild(offscreenRoot);

    try {
      const copy = new Uint8Array(data.slice(0));
      await renderAsync(copy.buffer, bodyHost, styleHost, {
        className,
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        useBase64URL: true,
        experimental: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
      });

      injectDocxStyles(cacheKey, className, styleHost);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const rawSections = Array.from(
        bodyHost.querySelectorAll(`section.${className}`)
      ) as HTMLElement[];

      if (rawSections.length === 0) {
        throw new Error('This DOCX file does not contain any renderable pages.');
      }

      const finalSections: HTMLElement[] = [];
      for (const sec of rawSections) {
        const declaredMinH = parseFloat(sec.style.minHeight) || 1123;
        const measuredH = sec.scrollHeight;
        if (rawSections.length === 1 && measuredH > declaredMinH * 1.12) {
          finalSections.push(...paginateOverflowingSection(sec, declaredMinH));
        } else {
          finalSections.push(sec);
        }
      }

      const pages: RenderedDocxPage[] = finalSections.map((sec) => {
        const declaredW = parseFloat(sec.style.width) || 794;
        const declaredH = parseFloat(sec.style.minHeight) || 1123;
        const widthPx = Math.max(300, Math.round(sec.offsetWidth || declaredW));
        const heightPx = Math.max(
          Math.round(declaredH),
          Math.round(sec.offsetHeight || declaredH)
        );
        return {
          html: sec.outerHTML,
          widthPx,
          heightPx,
        };
      });

      return {
        className,
        pages,
      };
    } finally {
      offscreenRoot.remove();
    }
  })().catch((err) => {
    docxCache.delete(cacheKey);
    throw err;
  });

  docxCache.set(cacheKey, promise);
  return promise;
}

export function clearCachedDocxDocument(cacheKey: string): void {
  docxCache.delete(cacheKey);
  if (typeof document !== 'undefined') {
    const styles = document.head.querySelectorAll(`style[data-docx-key="${cacheKey}"]`);
    styles.forEach((s) => s.remove());
  }
}

export function clearAllCachedDocxDocuments(): void {
  for (const key of Array.from(docxCache.keys())) {
    clearCachedDocxDocument(key);
  }
}

export async function stageDocxFiles(files: File[]): Promise<StagedPdfFile[]> {
  const staged: StagedPdfFile[] = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const tempFileId = crypto.randomUUID();
    const rendered = await getCachedDocxDocument(tempFileId, buffer);
    const pageCount = rendered.pages.length;

    const drafts: StagedPdfFile['drafts'] = [];
    for (let page = 1; page <= pageCount; page += 2) {
      const evenPage = page + 1 <= pageCount ? page + 1 : null;
      drafts.push({
        tempId: `${tempFileId}-${page}`,
        questionPage: page,
        answerPage: evenPage,
        missingEvenPage: evenPage === null,
      });
    }

    staged.push({
      tempFileId,
      name: file.name,
      size: file.size,
      pageCount,
      mimeType: file.type || DOCX_MIME,
      documentKind: 'docx',
      data: buffer,
      drafts,
    });
  }

  return staged;
}
