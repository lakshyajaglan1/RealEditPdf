// src/lib/pdfSessionStore.ts
// Client-side IndexedDB persistence for seamless cross-tool workflow chaining

export interface PdfSessionRecord {
  bytes: Uint8Array;
  fileName: string;
  updatedAt: number;
}

const DB_NAME = 'RealEditPdf_Session';
const DB_VERSION = 1;
const STORE_NAME = 'active_pdf';
const RECORD_KEY = 'current_pdf_session';

// In-memory fallback in case IndexedDB is restricted or disabled in browser
let inMemoryRecord: PdfSessionRecord | null = null;

function openSessionDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Format bytes into readable string (e.g. "1.42 MB", "420 KB")
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Save a PDF buffer to the shared IndexedDB session store
 */
export async function savePdfToSession(
  inputBytes: Uint8Array | ArrayBuffer,
  fileName = 'Document.pdf'
): Promise<void> {
  const bytes = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
  const record: PdfSessionRecord = {
    bytes,
    fileName: fileName || 'Document.pdf',
    updatedAt: Date.now(),
  };

  inMemoryRecord = record;

  try {
    const db = await openSessionDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record, RECORD_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[pdfSessionStore] IndexedDB put failed, falling back to in-memory store:', err);
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('realeditpdf:session-updated', { detail: { fileName: record.fileName } }));
    } catch {}
  }
}

/**
 * Retrieve the active PDF session record from IndexedDB or memory
 */
export async function getPdfFromSession(): Promise<PdfSessionRecord | null> {
  const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  function normalizeRecord(rec: any): PdfSessionRecord | null {
    if (!rec || !rec.bytes) return null;
    if (rec.updatedAt && Date.now() - rec.updatedAt > MAX_SESSION_AGE_MS) {
      clearPdfSession();
      return null;
    }
    if (!(rec.bytes instanceof Uint8Array)) {
      if (rec.bytes instanceof ArrayBuffer) {
        rec.bytes = new Uint8Array(rec.bytes);
      } else if (rec.bytes.buffer instanceof ArrayBuffer) {
        rec.bytes = new Uint8Array(rec.bytes.buffer, rec.bytes.byteOffset || 0, rec.bytes.byteLength);
      } else {
        rec.bytes = new Uint8Array(Object.values(rec.bytes));
      }
    }
    return rec as PdfSessionRecord;
  }

  try {
    const db = await openSessionDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY);

      request.onsuccess = () => {
        const result = request.result;
        const normalized = normalizeRecord(result);
        if (normalized) {
          inMemoryRecord = normalized;
          resolve(normalized);
        } else {
          resolve(normalizeRecord(inMemoryRecord));
        }
      };

      request.onerror = () => {
        resolve(normalizeRecord(inMemoryRecord));
      };
    });
  } catch (err) {
    console.warn('[pdfSessionStore] IndexedDB get failed, using in-memory store:', err);
    return normalizeRecord(inMemoryRecord);
  }
}

/**
 * Clear the stored PDF session
 */
export async function clearPdfSession(): Promise<void> {
  inMemoryRecord = null;
  try {
    const db = await openSessionDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(RECORD_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[pdfSessionStore] IndexedDB delete error:', err);
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('realeditpdf:session-cleared'));
    } catch {}
  }
}

/**
 * Check if a session PDF exists
 */
export async function hasSessionPdf(): Promise<boolean> {
  const record = await getPdfFromSession();
  return !!(record && record.bytes && record.bytes.length > 0);
}

/**
 * Open the standard "Export Complete" workflow chaining modal
 */
export function openExportCompleteModal(options: {
  fileName?: string;
  fileSizeBytes?: number;
  downloadUrl?: string;
  blob?: Blob;
}): void {
  if (typeof document === 'undefined') return;

  const modal = document.getElementById('export-complete-modal');
  if (!modal) return;

  const fileNameEl = document.getElementById('export-modal-filename');
  const fileSizeEl = document.getElementById('export-modal-filesize');
  const downloadBtn = document.getElementById('export-modal-download-btn') as HTMLAnchorElement | null;

  const name = options.fileName || 'RealEditPDF-Document.pdf';
  if (fileNameEl) fileNameEl.textContent = name;

  if (fileSizeEl && options.fileSizeBytes !== undefined) {
    fileSizeEl.textContent = formatBytes(options.fileSizeBytes);
  }

  if (downloadBtn) {
    if (options.downloadUrl) {
      downloadBtn.href = options.downloadUrl;
      downloadBtn.download = name;
      downloadBtn.classList.remove('hidden');
    } else if (options.blob) {
      const url = URL.createObjectURL(options.blob);
      downloadBtn.href = url;
      downloadBtn.download = name;
      downloadBtn.classList.remove('hidden');
    }
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

/**
 * Close the "Export Complete" modal
 */
export function closeExportCompleteModal(): void {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('export-complete-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// Attach to window for direct interoperability in inline or bundled scripts
if (typeof window !== 'undefined') {
  (window as any).pdfSessionStore = {
    savePdfToSession,
    getPdfFromSession,
    clearPdfSession,
    hasSessionPdf,
    formatBytes,
    openExportCompleteModal,
    closeExportCompleteModal,
  };
}
