import { getDB } from './db';
import { apiUrl, hasApiProxy } from './apiConfig';
import { initDefaultSettingsAndAdmin } from './auth';

// ── Constants ──────────────────────────────────────────────────────────────────

// URL default Google Apps Script — dapat diubah via Pengaturan > Backup & Restore
export const DEFAULT_CLOUD_API =
  'https://script.google.com/macros/s/AKfycbzaZQohZ2CobI1auBmKWNF4bvONWM4WU1RHurPeWtm1jN-pHepS8Y8dAkO1eMv_eB-JeA/exec';

// Alias untuk backward compat (komponen lain mengimpor CLOUD_API)
export const CLOUD_API = DEFAULT_CLOUD_API;

const API_KEY = 'IPAW-EMC';

/** Deteksi mode offline: app dibuka sebagai file lokal (file:// protocol) */
function isOfflineMode(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'file:';
}

// Object stores yang diikutkan dalam backup cloud
// (masterTarifs & masterTarifItems dikecualikan karena ukurannya besar)
const BACKUP_STORES = [
  // Master User wajib ikut backup agar akun dan perubahan password tersedia
  // saat aplikasi dipulihkan di perangkat lain.
  'users',
  'patients',
  'episodes',
  'pendings',
  'justInfos',
  'operanShifts',
  'importLogs',
  'activityLogs',
  'settings',
  'estimasiBiaya',
  'syncLogs',
  'billingRules',
  'billingChecks',
] as const;

// ── Baca URL GAS dari settings (dengan fallback ke DEFAULT) ───────────────────

export const getCloudApiUrl = async (): Promise<string> => {
  try {
    const db = await getDB();
    const entry = await db.get('settings', 'cloudApiUrl');
    const url: string = entry?.value?.trim();
    if (url && url.startsWith('https://script.google.com/')) {
      return url;
    }
  } catch {
    // fallback
  }
  return DEFAULT_CLOUD_API;
};

// ── Logging helper ─────────────────────────────────────────────────────────────

function logRequest(tag: string, url: string): void {
  console.log(`[CloudSync][${tag}] → ${url}`);
}

function logResponse(tag: string, status: number, ok: boolean): void {
  const icon = ok ? '✓' : '✗';
  console.log(`[CloudSync][${tag}] ${icon} HTTP ${status}`);
}

function logError(tag: string, err: unknown): void {
  console.error(`[CloudSync][${tag}] ✗ Error:`, err);
}

// ── Export semua stores ke plain object ────────────────────────────────────────

export const exportAllStores = async (): Promise<Record<string, any[]>> => {
  // Pastikan proses inisialisasi akun sudah selesai sebelum membaca store.
  // Ini juga memulihkan akun admin default bila database browser masih kosong
  // setelah instalasi baru atau migrasi IndexedDB.
  await initDefaultSettingsAndAdmin();
  const db = await getDB();
  const result: Record<string, any[]> = {};
  for (const store of BACKUP_STORES) {
    result[store] = await db.getAll(store as any);
  }
  if (!Array.isArray(result.users) || result.users.length === 0) {
    throw new Error(
      'Master User belum tersedia di perangkat ini. Buka ulang aplikasi atau login kembali, lalu ulangi backup.',
    );
  }
  return result;
};

// ── Import semua stores dari plain object ─────────────────────────────────────

export const importAllStores = async (data: Record<string, any[]>): Promise<void> => {
  if (!Array.isArray(data.users) || data.users.length === 0) {
    throw new Error('Data Cloud tidak memiliki Master User. Restore dibatalkan agar akun lokal tidak terhapus.');
  }

  const db = await getDB();
  for (const store of BACKUP_STORES) {
    if (!Array.isArray(data[store])) continue;
    const tx = db.transaction(store as any, 'readwrite');
    await tx.objectStore(store as any).clear();
    for (const row of data[store]) {
      await (tx.objectStore(store as any) as any).put(row);
    }
    await tx.done;
  }
};

// ── Cek status koneksi ke cloud ───────────────────────────────────────────────

export const checkCloudStatus = async (): Promise<'online' | 'offline'> => {
  if (!navigator.onLine) return 'offline';

  try {
    const cloudUrl = await getCloudApiUrl();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12_000);

    let res: Response;

    if (isOfflineMode() || !hasApiProxy()) {
      // Mode offline / static hosting (Netlify dll): panggil GAS langsung
      const targetUrl = `${cloudUrl}?action=status`;
      logRequest('status/direct', targetUrl);
      try {
        res = await fetch(targetUrl, { signal: ctrl.signal });
        clearTimeout(timeout);
        logResponse('status/direct', res.status, res.ok);
      } catch (err) {
        clearTimeout(timeout);
        logError('status/direct', err);
        return 'offline';
      }
      if (!res.ok) return 'offline';
      const json = await res.json();
      // GAS mengembalikan { status: 'ok' }
      return json.status === 'ok' ? 'online' : 'offline';
    } else {
      // Mode online lewat proxy API server
      const proxyUrl = apiUrl(`/api/cloud/status?url=${encodeURIComponent(cloudUrl)}`);
      logRequest('status/proxy', proxyUrl);
      try {
        res = await fetch(proxyUrl, { signal: ctrl.signal });
        clearTimeout(timeout);
        logResponse('status/proxy', res.status, res.ok);
      } catch (err) {
        clearTimeout(timeout);
        logError('status/proxy', err);
        return 'offline';
      }
      if (!res.ok) {
        console.warn(
          `[CloudSync][status/proxy] HTTP ${res.status} — endpoint tidak tersedia. ` +
          'Periksa apakah API server berjalan dan VITE_API_BASE_URL sudah dikonfigurasi dengan benar.',
        );
        return 'offline';
      }
      const json = await res.json();
      return json.online ? 'online' : 'offline';
    }
  } catch (err) {
    logError('status', err);
    return 'offline';
  }
};

// ── Sync status lengkap ────────────────────────────────────────────────────────

export interface SyncStatusResult {
  status: 'online' | 'offline';
  lastBackup: number | null;
  autoBackupEnabled: boolean;
}

export const syncStatus = async (): Promise<SyncStatusResult> => {
  const [status, db] = await Promise.all([checkCloudStatus(), getDB()]);
  const [lastBackupEntry, autoEntry] = await Promise.all([
    db.get('settings', 'lastCloudBackup'),
    db.get('settings', 'autoCloudBackup'),
  ]);
  return {
    status,
    lastBackup: lastBackupEntry?.value ?? null,
    autoBackupEnabled: autoEntry?.value ?? false,
  };
};

// ── Backup ke Cloud ───────────────────────────────────────────────────────────

export const backupCloud = async (): Promise<void> => {
  const cloudUrl = await getCloudApiUrl();
  const database = await exportAllStores();

  const payload = JSON.stringify({
    action: 'restore',   // GAS doPost menggunakan 'restore' untuk operasi simpan
    apiKey: API_KEY,
    database,
    // Keep this duplicate field for older Netlify Functions and GAS deployments
    // that read the stores directly from the request envelope.
    users: database.users,
  });

  let res: Response;

  if (isOfflineMode() || !hasApiProxy()) {
    // Mode offline / static hosting (Netlify dll): POST langsung ke GAS
    // Content-Type text/plain = simple request, tidak trigger CORS preflight
    logRequest('backup/direct', cloudUrl);
    try {
      res = await fetch(cloudUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
        signal: AbortSignal.timeout(60_000),
      });
      logResponse('backup/direct', res.status, res.ok);
    } catch (err) {
      logError('backup/direct', err);
      throw err;
    }
  } else {
    // Mode online: lewat proxy API server
    const proxyUrl = apiUrl(`/api/cloud/backup?url=${encodeURIComponent(cloudUrl)}`);
    logRequest('backup/proxy', proxyUrl);
    try {
      res = await fetch(proxyUrl, {
        method: 'POST',
        // Proxy same-origin dapat menerima JSON langsung. Mode direct tetap
        // memakai text/plain di atas agar tidak memicu CORS preflight ke GAS.
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(60_000),
      });
      logResponse('backup/proxy', res.status, res.ok);
    } catch (err) {
      logError('backup/proxy', err);
      throw err;
    }

    // A previously deployed Netlify Function may still reject the old envelope
    // before its bundle refreshes. The payload has already been verified locally
    // by exportAllStores(), so retry the same safe payload directly to GAS.
    if (res.status === 400) {
      let errorText = '';
      try {
        const errorJson = await res.clone().json();
        errorText = String(errorJson?.error ?? '');
      } catch {
        // Keep the original response for the normal error handling below.
      }
      if (errorText.includes('Payload backup tidak memiliki Master User')) {
        logRequest('backup/direct-fallback', cloudUrl);
        try {
          res = await fetch(cloudUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: payload,
            signal: AbortSignal.timeout(60_000),
          });
          logResponse('backup/direct-fallback', res.status, res.ok);
        } catch (err) {
          logError('backup/direct-fallback', err);
          throw err;
        }
      }
    }
  }

  if (!res.ok) {
    let errMsg = `Server merespons HTTP ${res.status}`;
    if (res.status === 404) {
      errMsg =
        `HTTP 404 — endpoint backup tidak ditemukan. ` +
        `Pastikan API server berjalan dan VITE_API_BASE_URL dikonfigurasi dengan benar. ` +
        `URL yang dipanggil: ${res.url}`;
    } else {
      try {
        const j = await res.json();
        if (j?.error) errMsg = j.error;
      } catch { /* ignore */ }
    }
    throw new Error(errMsg);
  }

  const json = await res.json();
  // GAS langsung: { success, message } — proxy: { success, action, detail }
  if (json?.success === false) {
    throw new Error(json.error || json.message || 'Upload gagal di sisi server');
  }

  const db = await getDB();
  await db.put('settings', { key: 'lastCloudBackup', value: Date.now() });
};

// ── Restore dari Cloud ────────────────────────────────────────────────────────
// KEAMANAN: data lokal TIDAK akan dihapus jika download gagal

export const restoreCloud = async (): Promise<void> => {
  const cloudUrl = await getCloudApiUrl();

  // GAS doGet dengan action=restore mengembalikan data yang tersimpan
  const restoreUrl = `${cloudUrl}?action=restore&apiKey=${API_KEY}`;

  let res: Response;

  if (isOfflineMode() || !hasApiProxy()) {
    // Mode offline / static hosting (Netlify dll): GET langsung ke GAS
    logRequest('restore/direct', restoreUrl);
    try {
      res = await fetch(restoreUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(60_000),
      });
      logResponse('restore/direct', res.status, res.ok);
    } catch (err) {
      logError('restore/direct', err);
      throw err;
    }
  } else {
    // Mode online: lewat proxy API server
    const proxyUrl = apiUrl(`/api/cloud/restore?url=${encodeURIComponent(restoreUrl)}`);
    logRequest('restore/proxy', proxyUrl);
    try {
      res = await fetch(proxyUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(60_000),
      });
      logResponse('restore/proxy', res.status, res.ok);
    } catch (err) {
      logError('restore/proxy', err);
      throw err;
    }
  }

  if (!res.ok) {
    let errMsg = `Server merespons HTTP ${res.status} — data lokal tidak diubah`;
    if (res.status === 404) {
      errMsg =
        `HTTP 404 — endpoint restore tidak ditemukan. ` +
        `Pastikan API server berjalan dan VITE_API_BASE_URL dikonfigurasi. ` +
        `URL yang dipanggil: ${res.url} — data lokal tidak diubah`;
    } else {
      try {
        const j = await res.json();
        if (j?.error) errMsg = j.error + ' — data lokal tidak diubah';
      } catch { /* ignore */ }
    }
    throw new Error(errMsg);
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error('Respons dari Cloud bukan JSON yang valid — data lokal tidak diubah');
  }

  if (!json?.success) {
    throw new Error(json?.error || 'Download gagal — data lokal tidak diubah');
  }

  // Proxy mengembalikan { success, data } — GAS langsung: { success, database }
  const data: Record<string, any[]> = json.data ?? json.database;
  if (!data || typeof data !== 'object') {
    throw new Error('Format data dari Cloud tidak valid — data lokal tidak diubah');
  }
  if (!Array.isArray(data.users) || data.users.length === 0) {
    throw new Error('Data Cloud tidak memiliki Master User — data lokal tidak diubah');
  }

  // 2. Restore — hanya dijalankan jika download berhasil
  await importAllStores(data);

  const db = await getDB();
  await db.put('settings', { key: 'lastCloudBackup', value: Date.now() });
};

// ── Sync users dari cloud ke IndexedDB lokal (silent, hanya users) ────────────
// Dipakai saat startup agar user yang dibuat di perangkat lain langsung tersedia.

export const syncUsersFromCloud = async (): Promise<void> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    const cloudUrl = await getCloudApiUrl();
    const restoreUrl = `${cloudUrl}?action=restore&apiKey=${API_KEY}`;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10_000);

    let res: Response;
    if (isOfflineMode() || !hasApiProxy()) {
      logRequest('syncUsers/direct', restoreUrl);
      res = await fetch(restoreUrl, { signal: ctrl.signal });
      clearTimeout(timeout);
      logResponse('syncUsers/direct', res.status, res.ok);
    } else {
      const proxyUrl = apiUrl(`/api/cloud/restore?url=${encodeURIComponent(restoreUrl)}`);
      logRequest('syncUsers/proxy', proxyUrl);
      res = await fetch(proxyUrl, { signal: ctrl.signal });
      clearTimeout(timeout);
      logResponse('syncUsers/proxy', res.status, res.ok);
    }

    if (!res.ok) {
      console.warn(`[CloudSync][syncUsers] HTTP ${res.status} — sync user dibatalkan`);
      return;
    }
    const json = await res.json();
    if (!json?.success) return;

    const data: Record<string, any[]> = json.data ?? json.database;
    if (!Array.isArray(data?.users) || data.users.length === 0) return;

    // Upsert users saja — jangan clear, agar user lokal yang belum ter-backup tetap ada
    const db = await getDB();
    const tx = db.transaction('users', 'readwrite');
    for (const u of data.users) {
      await (tx.objectStore('users') as any).put(u);
    }
    await tx.done;
  } catch (err) {
    // Silent fail — jangan pernah memblokir startup app
    logError('syncUsers', err);
  }
};

// ── Auto Backup (panggil setelah perubahan data penting) ──────────────────────

export const triggerAutoBackup = async (): Promise<void> => {
  try {
    const db = await getDB();
    const autoEntry = await db.get('settings', 'autoCloudBackup');
    if (!autoEntry?.value) return;

    // Fire & forget — tidak memblokir caller, gagal secara senyap
    backupCloud().catch((err) => {
      logError('autoBackup', err);
    });
  } catch {
    // Silent fail
  }
};
