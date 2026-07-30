import * as XLSX from 'xlsx';
import { getDB } from './db';
import { exportAllStores, importAllStores } from './cloudSync';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Safely parse a field that should be an array.
 *  Excel flattens arrays to JSON strings; empty arrays become undefined cells. */
const parseArr = (val: any): any[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try { return JSON.parse(val); } catch (_) {}
  }
  return [];
};

/** Safely parse a field that should be an object/array (stored as JSON string). */
const parseJson = (val: any, fallback: any = null): any => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (_) {}
  }
  return fallback;
};

// ── Hasil Restore ─────────────────────────────────────────────────────────────

export interface RestoreResult {
  masterTarifMissing: boolean;
  masterItemMissing: boolean;
}

// ── Backup (Excel / .xlsx) ─────────────────────────────────────────────────────
// Master Tarif dan Master Item TIDAK disertakan untuk menjaga ukuran file kecil.

export const backupData = async () => {
  const db = await getDB();

  // Ambil semua store yang dibackup secara paralel (tanpa masterTarifs & masterTarifItems)
  const [
    users, patients, episodes, pendings,
    justInfos, operanShifts, importLogs, activityLogs,
    settings, estimasiBiaya, syncLogs,
  ] = await Promise.all([
    db.getAll('users'),
    db.getAll('patients'),
    db.getAll('episodes'),
    db.getAll('pendings'),
    db.getAll('justInfos'),
    db.getAll('operanShifts'),
    db.getAll('importLogs'),
    db.getAll('activityLogs'),
    db.getAll('settings'),
    db.getAll('estimasiBiaya'),
    db.getAll('syncLogs'),
  ]);

  const workbook = XLSX.utils.book_new();

  // ── AppInfo sheet (checksum + metadata) ────────────────────────────────────
  const appInfo = [
    { key: 'AppName',    value: 'IP Admission Workspace' },
    { key: 'Version',    value: '5.0.0' },
    { key: 'BackupDate', value: new Date().toISOString() },
    { key: 'Checksum',   value: 'IPAW_VALID' },
    { key: 'Note',       value: 'MasterTarif dan MasterItem tidak disertakan untuk menjaga ukuran file kecil' },
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(appInfo), 'AppInfo');

  // ── Core stores ────────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settings),     'Settings');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(users),         'Users');

  // Patients split by status
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(
    patients.filter(p => p.status === 'aktif')),          'PatientsAktif');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(
    patients.filter(p => p.status === 'pulang')),         'PatientsPulang');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(
    patients.filter(p => p.status === 'pulang_pending')), 'PatientsPulangPending');

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(episodes),      'Episodes');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pendings.map(p => ({
    ...p,
    komentar:         JSON.stringify(p.komentar         ?? []),
    auditLog:         JSON.stringify(p.auditLog         ?? []),
  }))),                                                                            'Pendings');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(justInfos),     'JustInfos');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(operanShifts.map(o => ({
    ...o,
    ringkasanPending: JSON.stringify(o.ringkasanPending ?? []),
  }))),                                                                            'OperanShifts');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importLogs.map(l => ({
    ...l,
    errors: JSON.stringify(l.errors ?? []),
  }))),                                                                            'ImportLogs');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(activityLogs),  'ActivityLogs');

  // ── Estimasi Biaya ─────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(estimasiBiaya.map(e => ({
    ...e,
    items:           JSON.stringify(e.items ?? []),
    obatDetailItems: JSON.stringify(e.obatDetailItems ?? []),
  }))),                                                                            'EstimasiBiaya');

  // ── Sync Logs ──────────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(syncLogs),      'SyncLogs');

  // Master Tarif TIDAK disertakan (MasterTarifs & MasterTarifItems dikecualikan)

  const filename = `IPAW_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  XLSX.writeFile(workbook, filename);
};

// ── Backup (JSON) ──────────────────────────────────────────────────────────────

export const backupDataJSON = async (): Promise<void> => {
  const database = await exportAllStores();
  const payload = JSON.stringify({
    appName: 'IP Admission Workspace',
    version: '5.0.0',
    backupDate: new Date().toISOString(),
    checksum: 'IPAW_VALID',
    database,
  }, null, 2);

  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IPAW_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Catat waktu backup lokal
  const db = await getDB();
  await db.put('settings', { key: 'lastLocalBackup', value: Date.now() });
};

// ── Restore (JSON) ─────────────────────────────────────────────────────────────

export const restoreDataJSON = async (file: File): Promise<void> => {
  const text = await file.text();
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('File bukan JSON yang valid.');
  }

  if (payload.checksum !== 'IPAW_VALID' && payload.checksum !== 'EMC_VALID') {
    throw new Error('File backup tidak valid: checksum tidak cocok.');
  }
  if (!payload.database || typeof payload.database !== 'object') {
    throw new Error('Format file backup tidak valid: field "database" tidak ditemukan.');
  }

  await importAllStores(payload.database);
};

// ── Restore (Excel / .xlsx) ────────────────────────────────────────────────────

export const restoreData = async (file: File): Promise<RestoreResult> => {
  await new Promise<void>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // ── Validasi ─────────────────────────────────────────────────────────
        if (!workbook.SheetNames.includes('AppInfo')) {
          throw new Error('File backup tidak valid: sheet AppInfo tidak ditemukan.');
        }
        const appInfoSheet = XLSX.utils.sheet_to_json<any>(workbook.Sheets['AppInfo']);
        const checksum = appInfoSheet.find((r: any) => r.key === 'Checksum')?.value;
        if (checksum !== 'IPAW_VALID' && checksum !== 'EMC_VALID') {
          throw new Error('File backup tidak valid: checksum tidak cocok.');
        }

        const db = await getDB();

        // Deteksi versi backup
        const hasV2MasterTarif = workbook.SheetNames.includes('MasterTarifs');
        const hasV3            = workbook.SheetNames.includes('EstimasiBiaya');
        const hasV4            = workbook.SheetNames.includes('SyncLogs');

        const storeNames: string[] = [
          'users', 'patients', 'episodes', 'pendings',
          'justInfos', 'operanShifts', 'importLogs', 'activityLogs', 'settings',
          // Master Tarif hanya di-restore jika ada di file lama (backward compat)
          ...(hasV2MasterTarif ? ['masterTarifs', 'masterTarifItems'] : []),
          ...(hasV3 ? ['estimasiBiaya'] : []),
          ...(hasV4 ? ['syncLogs'] : []),
        ];

        const tx = db.transaction(storeNames as any, 'readwrite');

        // ── Helper restorer per sheet ──────────────────────────────────────────
        const restoreSheet = async (
          sheetName: string,
          storeName: any,
          transform?: (row: any) => any,
        ) => {
          if (!workbook.SheetNames.includes(sheetName)) return;
          const items = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetName]);
          await tx.objectStore(storeName).clear();
          for (const raw of items) {
            const row = transform ? transform(raw) : raw;
            await tx.objectStore(storeName).put(row);
          }
        };

        // ── Core stores ───────────────────────────────────────────────────────
        await restoreSheet('Settings',     'settings');
        await restoreSheet('Users',        'users');

        // Patients — gabungkan semua sheet status
        await tx.objectStore('patients').clear();
        for (const sheet of ['PatientsAktif', 'PatientsPulang', 'PatientsPulangPending']) {
          if (workbook.SheetNames.includes(sheet)) {
            const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheet]);
            for (const p of rows) await tx.objectStore('patients').put(p);
          }
        }

        await restoreSheet('Episodes',     'episodes');
        await restoreSheet('Pendings',     'pendings', row => ({
          ...row,
          komentar:         parseArr(row.komentar),
          auditLog:         parseArr(row.auditLog),
        }));
        await restoreSheet('JustInfos',    'justInfos');
        await restoreSheet('OperanShifts', 'operanShifts', row => ({
          ...row,
          ringkasanPending: parseArr(row.ringkasanPending),
        }));
        await restoreSheet('ImportLogs',   'importLogs', row => ({
          ...row,
          errors: parseArr(row.errors),
        }));
        await restoreSheet('ActivityLogs', 'activityLogs');

        // ── v2 backward compat: Master Tarif dari file lama ───────────────────
        if (hasV2MasterTarif) {
          await restoreSheet('MasterTarifs',     'masterTarifs');
          await restoreSheet('MasterTarifItems', 'masterTarifItems');
        }
        // Master Tarif dari file baru (v5+): TIDAK di-restore — dibiarkan apa adanya

        // ── v3: Estimasi Biaya ─────────────────────────────────────────────────
        if (hasV3) {
          await restoreSheet('EstimasiBiaya', 'estimasiBiaya', row => ({
            ...row,
            items:           parseJson(row.items, []),
            obatDetailItems: parseJson(row.obatDetailItems, []),
          }));
        }

        // ── v4: Sync Logs ──────────────────────────────────────────────────────
        if (hasV4) {
          await restoreSheet('SyncLogs', 'syncLogs');
        }

        await tx.done;
        resolve();
      } catch (err: any) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });

  // Setelah restore, cek ketersediaan Master Tarif & Master Item
  const db = await getDB();
  const tarifCount = await db.count('masterTarifs');
  const itemCount  = await db.count('masterTarifItems');

  return {
    masterTarifMissing: tarifCount === 0,
    masterItemMissing:  itemCount  === 0,
  };
};
