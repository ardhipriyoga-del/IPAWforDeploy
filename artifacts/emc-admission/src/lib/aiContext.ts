import { getDB } from './db';

export interface AIApplicationContext {
  generatedAt: string;
  scope: string;
  recordCounts: Record<string, number>;
  stores: Record<string, unknown[]>;
}

const REDACTED_KEY = '[DISEMBUNYIKAN]';
const OMITTED_BINARY_VALUE = '[DATA BINER TIDAK DIKIRIM]';

const sensitiveKeyPattern =
  /password|passhash|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key|cloudapiurl|baseurl/i;
const binaryKeyPattern = /base64|pdf|foto/i;

function sanitizeValue(value: unknown, key = ''): unknown {
  if (sensitiveKeyPattern.test(key)) return REDACTED_KEY;
  if (binaryKeyPattern.test(key)) return OMITTED_BINARY_VALUE;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeValue(childValue, childKey),
      ]),
    );
  }

  return value;
}

/**
 * Export all local application data for the AI context.
 *
 * This intentionally reads every IndexedDB object store, including stores
 * that are not part of cloud backup (for example master tariff data).
 * Credentials and large binary attachments are never sent to the provider.
 */
export async function exportAllStoresForAI(): Promise<AIApplicationContext> {
  const db = await getDB();
  const stores: Record<string, unknown[]> = {};
  const recordCounts: Record<string, number> = {};

  for (const storeName of Array.from(db.objectStoreNames)) {
    const rows = await db.getAll(storeName as never);
    recordCounts[storeName] = rows.length;
    stores[storeName] = rows.map((row) => sanitizeValue(row));
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: 'Seluruh data lokal IP Admission Workspace pada perangkat ini',
    recordCounts,
    stores,
  };
}