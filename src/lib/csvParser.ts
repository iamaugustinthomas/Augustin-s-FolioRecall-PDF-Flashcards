import type { StagedPdfFile } from '../types/flashcard';

export function isCsvFile(file: { name: string; type?: string }): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith('.csv') ||
    file.type === 'text/csv' ||
    file.type === 'application/csv' ||
    file.type === 'text/comma-separated-values'
  );
}

function detectDelimiter(sample: string): string {
  const firstLines = sample.split(/\r?\n/).slice(0, 5).join('\n');
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  let tabs = 0;

  for (let i = 0; i < firstLines.length; i++) {
    const ch = firstLines[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semicolons++;
      else if (ch === '\t') tabs++;
    }
  }

  if (tabs > commas && tabs >= semicolons) return '\t';
  if (semicolons > commas && commas === 0) return ';';
  return ',';
}

/**
 * RFC-4180 compliant CSV parser supporting UTF-8 BOM, quoted fields,
 * escaped double quotes (""), multi-line cells, and auto-detected delimiters.
 */
export function parseCsvRows(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) {
    rows.push(row);
  }

  return rows;
}

const QUESTION_HEADER_HINTS = new Set([
  'question',
  'questions',
  'q',
  'front',
  'prompt',
  'term',
  'card_front',
  'cue',
  'word',
]);

const ANSWER_HEADER_HINTS = new Set([
  'answer',
  'answers',
  'a',
  'back',
  'response',
  'definition',
  'card_back',
  'meaning',
  'explanation',
]);

export function detectCsvLayout(rows: string[][]): {
  hasHeader: boolean;
  headers: string[];
  questionCol: number;
  answerCol: number;
} {
  const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const firstRow = rows[0] ?? [];
  const normalized = firstRow.map((cell) =>
    cell.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  );

  let qIdx = normalized.findIndex((h) => QUESTION_HEADER_HINTS.has(h));
  let aIdx = normalized.findIndex((h) => ANSWER_HEADER_HINTS.has(h));
  const hasHeader = rows.length > 1 && (qIdx !== -1 || aIdx !== -1);

  if (qIdx === -1) qIdx = 0;
  if (aIdx === -1) aIdx = maxCols > 1 ? (qIdx === 0 ? 1 : 0) : 0;

  const headers = Array.from({ length: maxCols }, (_, idx) => {
    const label = firstRow[idx]?.trim();
    return hasHeader && label ? label : `Column ${idx + 1}`;
  });

  return {
    hasHeader,
    headers,
    questionCol: qIdx,
    answerCol: aIdx,
  };
}

export function buildCsvDrafts(
  tempFileId: string,
  rows: string[][],
  hasHeader: boolean,
  questionCol: number,
  answerCol: number
): StagedPdfFile['drafts'] {
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const drafts: StagedPdfFile['drafts'] = [];

  dataRows.forEach((cols, idx) => {
    const q = (cols[questionCol] ?? '').trim();
    const a = questionCol === answerCol ? '' : (cols[answerCol] ?? '').trim();
    if (!q && !a) return;

    drafts.push({
      tempId: `${tempFileId}-row-${idx}`,
      questionPage: idx + 1,
      answerPage: idx + 1,
      missingEvenPage: a.length === 0,
      questionText: q || '(Empty question)',
      answerText: a,
    });
  });

  return drafts;
}

export async function stageCsvFiles(files: File[]): Promise<StagedPdfFile[]> {
  const staged: StagedPdfFile[] = [];

  for (const file of files) {
    const text = await file.text();
    const rows = parseCsvRows(text);
    if (rows.length === 0) {
      throw new Error(`"${file.name}" does not contain any CSV rows.`);
    }

    const tempFileId = crypto.randomUUID();
    const { hasHeader, headers, questionCol, answerCol } = detectCsvLayout(rows);
    const drafts = buildCsvDrafts(tempFileId, rows, hasHeader, questionCol, answerCol);

    if (drafts.length === 0) {
      throw new Error(`"${file.name}" has no non-empty flashcard rows.`);
    }

    staged.push({
      tempFileId,
      name: file.name,
      size: file.size,
      pageCount: drafts.length,
      mimeType: file.type || 'text/csv',
      documentKind: 'csv',
      data: new ArrayBuffer(0),
      csvConfig: {
        rows,
        headers,
        hasHeader,
        questionCol,
        answerCol,
      },
      drafts,
    });
  }

  return staged;
}

export function createSampleStudyCsv(): File {
  const csvContent = [
    'Question,Answer',
    '"What is the spacing effect in cognitive psychology?","Spacing study sessions across intervals produces stronger long-term retention than massed cramming in a single session."',
    '"Why does active recall outperform passive re-reading?","Retrieving an answer from memory strengthens synaptic recall pathways and reveals weak spots immediately."',
    '"In Ebbinghaus\'s forgetting curve R(t) = 0.9^(t/S), what does S represent?","Memory stability (in days): the elapsed interval after which recall probability drops to 90%."',
    '"How does exam-date spaced repetition schedule final reviews?","It works backward from the day before the exam (final consolidation) so every card receives a fresh reinforcement checkpoint."',
  ].join('\n');

  return new File([csvContent], 'sample-memory-science.csv', { type: 'text/csv' });
}
