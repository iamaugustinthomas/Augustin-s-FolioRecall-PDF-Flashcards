import type {
  Deck,
  DocumentKind,
  Flashcard,
  StoredPdfFile,
  StudySessionRecord,
} from '../types/flashcard';

const DB_NAME = 'foliorecall_offline_db';
const DB_VERSION = 2;

const STORE_DECKS = 'decks';
const STORE_CARDS = 'cards';
const STORE_SESSIONS = 'sessions';
const STORE_PDFS = 'pdfFiles';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DECKS)) {
        db.createObjectStore(STORE_DECKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CARDS)) {
        const cardStore = db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
        cardStore.createIndex('deckId', 'deckId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessionStore.createIndex('deckId', 'deckId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PDFS)) {
        db.createObjectStore(STORE_PDFS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function runTx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => Promise<T> | T
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        let resultValue: T;

        Promise.resolve(action(tx))
          .then((val) => {
            resultValue = val;
          })
          .catch((err) => {
            try {
              tx.abort();
            } catch {
              // ignore abort error
            }
            reject(err);
          });

        tx.oncomplete = () => {
          db.close();
          resolve(resultValue);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB transaction failed'));
        };
      })
  );
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllDecks(): Promise<Deck[]> {
  return runTx(STORE_DECKS, 'readonly', async (tx) => {
    const store = tx.objectStore(STORE_DECKS);
    const items = await reqToPromise<Deck[]>(store.getAll());
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

export async function saveDeck(deck: Deck): Promise<void> {
  return runTx(STORE_DECKS, 'readwrite', async (tx) => {
    await reqToPromise(tx.objectStore(STORE_DECKS).put(deck));
  });
}

export async function savePdfFiles(files: StoredPdfFile[]): Promise<void> {
  if (files.length === 0) return;
  return runTx(STORE_PDFS, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE_PDFS);
    for (const file of files) {
      store.put(file);
    }
  });
}

export async function getPdfFile(pdfFileId: string): Promise<StoredPdfFile | undefined> {
  return runTx(STORE_PDFS, 'readonly', async (tx) => {
    return reqToPromise<StoredPdfFile | undefined>(tx.objectStore(STORE_PDFS).get(pdfFileId));
  });
}

export async function getAllPdfFiles(): Promise<StoredPdfFile[]> {
  return runTx(STORE_PDFS, 'readonly', async (tx) => {
    return reqToPromise<StoredPdfFile[]>(tx.objectStore(STORE_PDFS).getAll());
  });
}

export async function deleteDeckAndCards(deckId: string): Promise<string[]> {
  return runTx(
    [STORE_DECKS, STORE_CARDS, STORE_SESSIONS, STORE_PDFS],
    'readwrite',
    async (tx) => {
      await reqToPromise(tx.objectStore(STORE_DECKS).delete(deckId));

      const cardStore = tx.objectStore(STORE_CARDS);
      const cardIdx = cardStore.index('deckId');
      const cardKeys = await reqToPromise<IDBValidKey[]>(cardIdx.getAllKeys(deckId));
      for (const key of cardKeys) {
        await reqToPromise(cardStore.delete(key));
      }

      const sessionStore = tx.objectStore(STORE_SESSIONS);
      const sessionIdx = sessionStore.index('deckId');
      const sessionKeys = await reqToPromise<IDBValidKey[]>(sessionIdx.getAllKeys(deckId));
      for (const key of sessionKeys) {
        await reqToPromise(sessionStore.delete(key));
      }

      // Garbage-collect any stored PDF files no longer referenced by remaining cards
      const remainingCards = await reqToPromise<Flashcard[]>(cardStore.getAll());
      const activePdfIds = new Set(
        remainingCards.map((c) => c.pdfFileId).filter((id): id is string => Boolean(id))
      );

      const pdfStore = tx.objectStore(STORE_PDFS);
      const allPdfKeys = await reqToPromise<IDBValidKey[]>(pdfStore.getAllKeys());
      const removedPdfIds: string[] = [];
      for (const key of allPdfKeys) {
        const id = String(key);
        if (!activePdfIds.has(id)) {
          await reqToPromise(pdfStore.delete(key));
          removedPdfIds.push(id);
        }
      }

      return removedPdfIds;
    }
  );
}

export async function getAllCards(): Promise<Flashcard[]> {
  return runTx(STORE_CARDS, 'readonly', async (tx) => {
    return reqToPromise<Flashcard[]>(tx.objectStore(STORE_CARDS).getAll());
  });
}

export async function saveCard(card: Flashcard): Promise<void> {
  return runTx(STORE_CARDS, 'readwrite', async (tx) => {
    await reqToPromise(tx.objectStore(STORE_CARDS).put(card));
  });
}

export async function saveCards(cards: Flashcard[]): Promise<void> {
  if (cards.length === 0) return;
  return runTx(STORE_CARDS, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE_CARDS);
    for (const card of cards) {
      store.put(card);
    }
  });
}

export async function deleteCard(cardId: string): Promise<void> {
  return runTx(STORE_CARDS, 'readwrite', async (tx) => {
    await reqToPromise(tx.objectStore(STORE_CARDS).delete(cardId));
  });
}

export async function applyDeckFileUpdate(params: {
  updatedDeck: Deck;
  newPdfFiles: StoredPdfFile[];
  cardsToPut: Flashcard[];
  cardIdsToDelete: string[];
}): Promise<string[]> {
  const { updatedDeck, newPdfFiles, cardsToPut, cardIdsToDelete } = params;
  return runTx(
    [STORE_DECKS, STORE_CARDS, STORE_PDFS],
    'readwrite',
    async (tx) => {
      await reqToPromise(tx.objectStore(STORE_DECKS).put(updatedDeck));

      const pdfStore = tx.objectStore(STORE_PDFS);
      for (const file of newPdfFiles) {
        await reqToPromise(pdfStore.put(file));
      }

      const cardStore = tx.objectStore(STORE_CARDS);
      for (const id of cardIdsToDelete) {
        await reqToPromise(cardStore.delete(id));
      }
      for (const card of cardsToPut) {
        await reqToPromise(cardStore.put(card));
      }

      // Garbage-collect replaced PDF/DOCX blobs no longer referenced by any card
      const allCards = await reqToPromise<Flashcard[]>(cardStore.getAll());
      const activePdfIds = new Set(
        allCards.map((c) => c.pdfFileId).filter((id): id is string => Boolean(id))
      );

      const allPdfKeys = await reqToPromise<IDBValidKey[]>(pdfStore.getAllKeys());
      const removedPdfIds: string[] = [];
      for (const key of allPdfKeys) {
        const id = String(key);
        if (!activePdfIds.has(id)) {
          await reqToPromise(pdfStore.delete(key));
          removedPdfIds.push(id);
        }
      }

      return removedPdfIds;
    }
  );
}

export async function getAllSessions(): Promise<StudySessionRecord[]> {
  return runTx(STORE_SESSIONS, 'readonly', async (tx) => {
    const items = await reqToPromise<StudySessionRecord[]>(
      tx.objectStore(STORE_SESSIONS).getAll()
    );
    return items.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  });
}

export async function saveSession(session: StudySessionRecord): Promise<void> {
  return runTx(STORE_SESSIONS, 'readwrite', async (tx) => {
    await reqToPromise(tx.objectStore(STORE_SESSIONS).put(session));
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface SerializedPdfBackup {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  mimeType?: string;
  documentKind?: DocumentKind;
  base64Data: string;
  createdAt: string;
}

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  decks: Deck[];
  cards: Flashcard[];
  sessions: StudySessionRecord[];
  pdfFiles?: SerializedPdfBackup[];
}

export async function exportBackup(): Promise<BackupPayload> {
  const [decks, cards, sessions, pdfs] = await Promise.all([
    getAllDecks(),
    getAllCards(),
    getAllSessions(),
    getAllPdfFiles(),
  ]);
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    decks,
    cards,
    sessions,
    pdfFiles: pdfs.map((p) => ({
      id: p.id,
      name: p.name,
      size: p.size,
      pageCount: p.pageCount,
      mimeType: p.mimeType,
      documentKind: p.documentKind,
      base64Data: arrayBufferToBase64(p.data),
      createdAt: p.createdAt,
    })),
  };
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  if (!Array.isArray(payload.decks) || !Array.isArray(payload.cards)) {
    throw new Error('Invalid backup format: missing decks or cards.');
  }
  return runTx(
    [STORE_DECKS, STORE_CARDS, STORE_SESSIONS, STORE_PDFS],
    'readwrite',
    async (tx) => {
      const dStore = tx.objectStore(STORE_DECKS);
      const cStore = tx.objectStore(STORE_CARDS);
      const sStore = tx.objectStore(STORE_SESSIONS);
      const pStore = tx.objectStore(STORE_PDFS);

      for (const d of payload.decks) dStore.put(d);
      for (const c of payload.cards) cStore.put(c);
      for (const s of payload.sessions ?? []) sStore.put(s);
      for (const p of payload.pdfFiles ?? []) {
        pStore.put({
          id: p.id,
          name: p.name,
          size: p.size,
          pageCount: p.pageCount,
          mimeType: p.mimeType,
          documentKind: p.documentKind,
          data: base64ToArrayBuffer(p.base64Data),
          createdAt: p.createdAt,
        } satisfies StoredPdfFile);
      }
    }
  );
}

export async function clearAllLocalData(): Promise<void> {
  return runTx(
    [STORE_DECKS, STORE_CARDS, STORE_SESSIONS, STORE_PDFS],
    'readwrite',
    async (tx) => {
      tx.objectStore(STORE_DECKS).clear();
      tx.objectStore(STORE_CARDS).clear();
      tx.objectStore(STORE_SESSIONS).clear();
      tx.objectStore(STORE_PDFS).clear();
    }
  );
}

export async function estimateStorageFootprint(): Promise<{
  usedBytes: number | null;
  quotaBytes: number | null;
}> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      return {
        usedBytes: est.usage ?? null,
        quotaBytes: est.quota ?? null,
      };
    } catch {
      return { usedBytes: null, quotaBytes: null };
    }
  }
  return { usedBytes: null, quotaBytes: null };
}
