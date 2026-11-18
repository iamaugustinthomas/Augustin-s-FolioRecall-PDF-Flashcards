import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { StagedPdfFile } from '../types/flashcard';
import { getPdfFile } from './storage';

// Configure local bundled worker so PDF rendering runs 100% offline in the browser
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const docCache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();

export function getCachedPdfDocument(
  cacheKey: string,
  buffer?: ArrayBuffer
): Promise<pdfjsLib.PDFDocumentProxy> {
  const existing = docCache.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    let data = buffer;
    if (!data) {
      const stored = await getPdfFile(cacheKey);
      if (!stored) {
        throw new Error('Stored PDF file could not be found in local IndexedDB.');
      }
      data = stored.data;
    }
    // Pass a copy of Uint8Array so pdfjs worker transfer never detaches the cached buffer
    const copy = new Uint8Array(data.slice(0));
    const loadingTask = pdfjsLib.getDocument({ data: copy });
    return loadingTask.promise;
  })().catch((err) => {
    docCache.delete(cacheKey);
    throw err;
  });

  docCache.set(cacheKey, promise);
  return promise;
}

export function clearCachedPdfDocument(cacheKey: string): void {
  const existing = docCache.get(cacheKey);
  if (existing) {
    docCache.delete(cacheKey);
    void existing
      .then((doc) => {
        const maybeDestroy = doc as unknown as { destroy?: () => Promise<void> };
        if (typeof maybeDestroy.destroy === 'function') {
          return maybeDestroy.destroy();
        }
        return doc.cleanup();
      })
      .catch(() => {});
  }
}

export function clearAllCachedPdfDocuments(): void {
  for (const key of Array.from(docCache.keys())) {
    clearCachedPdfDocument(key);
  }
}

/**
 * Inspects uploaded PDF files without parsing text or rasterizing pages.
 * Simply reads total page count and pairs odd pages (1, 3, 5...) as questions
 * with even pages (2, 4, 6...) as answers, keeping the raw PDF bytes to store locally.
 */
export async function stagePdfFiles(files: File[]): Promise<StagedPdfFile[]> {
  const staged: StagedPdfFile[] = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const tempFileId = crypto.randomUUID();
    const pdfDoc = await getCachedPdfDocument(tempFileId, buffer);
    const pageCount = pdfDoc.numPages;

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
      mimeType: file.type || 'application/pdf',
      documentKind: 'pdf',
      data: buffer,
      drafts,
    });
  }

  return staged;
}

/**
 * Generates a valid multi-page PDF binary completely in browser memory
 * (odd pages = questions, even pages = answers) so users can test
 * native PDF page rendering immediately.
 */
export function createSampleStudyPdf(): File {
  const pages: Array<{ title: string; subtitle: string; body: string[] }> = [
    {
      title: 'Question 1 (Page 1)',
      subtitle: 'Cellular Bioenergetics',
      body: [
        'What is the net ATP and NADH yield from one molecule of glucose',
        'during glycolysis, and where in the cell does this pathway occur?',
      ],
    },
    {
      title: 'Answer 1 (Page 2)',
      subtitle: 'Cellular Bioenergetics',
      body: [
        'Glycolysis takes place in the cytosol (anaerobic).',
        'Net yield per glucose: 2 ATP (substrate-level phosphorylation),',
        '2 NADH, and 2 pyruvate molecules.',
      ],
    },
    {
      title: 'Question 2 (Page 3)',
      subtitle: 'Cognitive Science',
      body: [
        'According to the Ebbinghaus forgetting curve, what happens to',
        'memory retention over elapsed time t, and how does active recall',
        'alter memory stability S?',
      ],
    },
    {
      title: 'Answer 2 (Page 4)',
      subtitle: 'Cognitive Science',
      body: [
        'Retention decays exponentially: R(t) = 0.9 ^ (t / S).',
        'Successful active recall increases stability S, flattening the',
        'decay slope so each subsequent interval grows longer.',
      ],
    },
    {
      title: 'Question 3 (Page 5)',
      subtitle: 'Cardiovascular Physiology',
      body: [
        'Explain the Bohr effect on the hemoglobin-oxygen dissociation',
        'curve when tissue CO2 increases and pH drops during exercise.',
      ],
    },
    {
      title: 'Answer 3 (Page 6)',
      subtitle: 'Cardiovascular Physiology',
      body: [
        'Increased CO2 and lower pH shift the oxygen-hemoglobin curve',
        'to the right, reducing hemoglobin affinity for O2 and enhancing',
        'oxygen unloading to metabolically active tissues.',
      ],
    },
    {
      title: 'Question 4 (Page 7)',
      subtitle: 'Thermodynamics',
      body: [
        'Under constant temperature and pressure, what sign of Gibbs free',
        'energy change (delta G) indicates a spontaneous reaction?',
      ],
    },
    {
      title: 'Answer 4 (Page 8)',
      subtitle: 'Thermodynamics',
      body: [
        'A negative delta G (delta G < 0) indicates an exergonic,',
        'thermodynamically spontaneous forward process.',
      ],
    },
  ];

  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const objects: string[] = [];
  const pageObjNums: number[] = [];

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('');
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  );

  let nextObjNum = 4;
  for (const p of pages) {
    const contentLines: string[] = [
      'BT',
      '/F1 12 Tf',
      '72 720 Td',
      `(${esc(p.subtitle)}) Tj`,
      '0 -32 Td',
      '/F1 20 Tf',
      `(${esc(p.title)}) Tj`,
      '0 -36 Td',
      '/F1 14 Tf',
    ];
    for (const line of p.body) {
      contentLines.push(`(${esc(line)}) Tj`);
      contentLines.push('0 -22 Td');
    }
    contentLines.push('ET');
    const streamStr = contentLines.join('\n');

    const contentObjNum = nextObjNum++;
    const pageObjNum = nextObjNum++;
    pageObjNums.push(pageObjNum);

    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamStr.length} >>\nstream\n${streamStr}\nendstream\nendobj\n`
    );
    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
  }

  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums
    .map((n) => `${n} 0 R`)
    .join(' ')}] /Count ${pageObjNums.length} >>\nendobj\n`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new File([pdf], 'sample-study-flashcards.pdf', { type: 'application/pdf' });
}
