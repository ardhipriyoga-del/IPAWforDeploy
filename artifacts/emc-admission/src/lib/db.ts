import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface User {
  id?: number;
  username: string;
  namaLengkap: string;
  role: 'superuser' | 'officer';
  passwordHash: string;
  aktif: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Patient {
  noRM: string;
  namaPasien: string;
  episodeNo: string;
  ward: string;
  roomName: string;
  roomType: string;
  bedCode: string;
  dpjp: string;
  dob: string;
  agama: string;
  sexDesc: string;
  admissionDate: string;
  dischargeDate: string | null;
  medicalDischarge: string | null;
  payor: string;
  statusBPJS: string;
  diagnosaMasuk: string;
  diagnosakUtama: string;
  diagnosaTambahan: string;
  alertVIP: string;
  noHpPJ?: string;
  status: 'aktif' | 'pulang' | 'pulang_pending';
  sumberData?: 'manual' | 'trakcare';
  bookmarked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Episode {
  id?: number;
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  admissionDate: string;
  dischargeDate: string | null;
  status: 'aktif' | 'pulang';
  archivedAt: number;
}

export interface Pending {
  id: string;
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  ruangan: string;
  kelas: string;
  dpjp: string;
  payor: string;
  kategori: string;
  isiPending: string;
  prioritas: 'normal' | 'urgent' | 'critical';
  status: 'pending' | 'diproses' | 'selesai';
  deadline: string | null;
  fotoBase64?: string;
  shift: 'pagi' | 'sore' | 'malam';
  userId: number;
  userName: string;
  komentar: Array<{
    text: string;
    userId: number;
    userName: string;
    timestamp: number;
  }>;
  auditLog: Array<{
    action: string;
    userId: number;
    userName: string;
    timestamp: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface JustInfo {
  id: string;
  noRM: string;
  episodeNo: string;
  isi: string;
  shift: string;
  userId: number;
  userName: string;
  createdAt: number;
}

export interface OperanShift {
  id: string;
  tanggal: string;
  shiftSerah: string;
  shiftTerima: string;
  userSerahId: number;
  userSerahNama: string;
  userTerimaId: number;
  userTerimaNama: string;
  jamOperan: string;
  totalPasien: number;
  totalPending: number;
  totalPendingSelesai: number;
  totalPendingBerlanjut: number;
  ringkasanPending: any[];
  pdfBase64: string;
  createdAt: number;
}

export interface ImportLog {
  id?: number;
  tanggal: string;
  userNama: string;
  totalRows: number;
  newPatients: number;
  updatedPatients: number;
  archivedPatients: number;
  errors: string[];
  createdAt: number;
}

export interface ActivityLog {
  id?: number;
  timestamp: number;
  tanggal: string;
  jam: string;
  userId: number;
  username: string;
  namaUser: string;
  role: 'superuser' | 'officer' | 'system';
  modul: string;
  aktivitas: string;
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  detail: string;
  oldValue: string;
  newValue: string;
  browser: string;
  device: string;
  os: string;
  status: 'Success' | 'Warning' | 'Failed' | 'Info';
  keterangan: string;
  durasi: number;
  errorCode: string;
  errorMessage: string;
}

export interface Setting {
  key: string;
  value: any;
}

// ── Sync Log ──────────────────────────────────────────────────────────────────

export interface SyncLog {
  id?: number;
  tanggal: string;
  jam: string;
  newPatients: number;
  updatedPatients: number;
  dischargedPatients: number;
  errors: number;
  duration: number;
  createdAt: number;
}

// ── Master Tarif ──────────────────────────────────────────────────────────────

export interface MasterTarif {
  id?: number;
  nama: string;
  rumahSakit: string;
  jenisTarif: string;
  tanggalBerlaku: string;
  tanggalImport: string;
  jumlahItem: number;
  status: 'aktif' | 'nonaktif';
  importedBy: string;
  createdAt: number;
}

export interface MasterTarifItem {
  id?: number;
  masterTarifId: number;
  hospitals: string;
  jenisTarif: string;
  fromDateTarif: string;
  itpRowId: string;
  orderItem: string;
  orderItemCode: string;
  kelasTarif: string;
  price: number;
}

// ── Estimasi Biaya Rawat ──────────────────────────────────────────────────────

export interface EstimasiItem {
  id: string;
  kategori: string;
  namaItem: string;
  qty: number;
  harga: number;
  hargaOverride: boolean;
  matchStatus: 'exact' | 'alias' | 'fuzzy' | 'unmapped' | 'manual';
  matchedName: string;
  masterTarifItemId?: number;
}

export interface EstimasiBiaya {
  id: string;
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  namaFileCP: string;
  kelasTarif: string;
  kelasPerawatan: string;
  diagnosa: string;
  lamaRawat: number;
  items: EstimasiItem[];
  bulkObatTotal: number;
  obatDetailItems: Array<{ kategori: string; namaItem: string; qty: number }>;
  adminOverrideValue?: number;
  adminOverrideBy?: string;
  totalSebelumAdmin: number;
  biayaAdmin: number;
  biayaMaterai: number;
  grandTotal: number;
  uploadedBy: string;
  uploadedAt: number;
  createdAt: number;
  updatedAt: number;
}

// ── Billing Check ─────────────────────────────────────────────────────────────

export type BillingItemStatus = 'sesuai' | 'selisih' | 'tidak_ditemukan';
export type BillingOverallStatus = 'valid' | 'warning' | 'invalid';

export interface BillingCheckItem {
  itemCode: string;
  namaItem: string;
  kategori: string;
  qty: number;
  hargaBilling: number;
  totalBilling: number;
  hargaMaster: number;
  selisih: number;
  totalSelisih: number;
  status: BillingItemStatus;
  matchedMasterName: string;
}

export interface BillingRuleResult {
  ruleId: number;
  namaItem: string;
  tipe: string;
  keterangan: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
}

// ── Billing Rule v2 (custom rule builder) ────────────────────────────────────

export type RuleOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'not_contains' | 'empty' | 'not_empty';
export type RuleField = 'penjamin' | 'kelas' | 'kode_tarif' | 'nama_item' | 'kelompok' | 'lokasi' | 'qty' | 'harga_billing' | 'harga_master' | 'selisih';
export type RuleAction = 'lolos' | 'warning' | 'error' | 'abaikan' | 'gunakan_master' | 'pesan_khusus';
export type RuleLogic = 'AND' | 'OR';

export interface RuleCondition {
  id: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
}

export interface BillingRule {
  id?: number;
  nama: string;
  deskripsi: string;
  prioritas: number;
  aktif: boolean;
  warna: string;
  ikon: string;
  pesan: string;
  logicType: RuleLogic;
  conditions: RuleCondition[];
  aksi: RuleAction;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface BillingCheck {
  id: string;
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  namaFileBilling: string;
  masterTarifId: number;
  masterTarifNama: string;
  penjamin: string;
  kelasTarif: string;
  lamaRawat: number;
  items: BillingCheckItem[];
  ruleResults: BillingRuleResult[];
  totalItem: number;
  itemSesuai: number;
  itemSelisih: number;
  itemTidakDitemukan: number;
  totalBilling: number;
  totalSelisih: number;
  ruleTerpenuhi: number;
  ruleTidakTerpenuhi: number;
  overallStatus: BillingOverallStatus;
  catatan: string;
  checkedById: number;
  checkedByName: string;
  createdAt: number;
}

// ── Notifikasi Billing Sementara ──────────────────────────────────────────────

export interface NotifikasiBillingStatus {
  id: string;         // episodeNo as key
  noRM: string;
  episodeNo: string;
  estimasiBilling: number;
  sudahDikirim: boolean;
  sentAt?: number;
  updatedAt: number;
}

export interface KasirTemplate {
  id?: number;
  namaTemplate: string;
  kategori: string;
  isiTemplate: string;
  aktif: boolean;
  urutan: number;
  createdAt: number;
  updatedAt: number;
}

// ── Uraian Konfirmasi Asuransi ─────────────────────────────────────────────────

export interface UraianRiwayat {
  id: string;
  tanggal: string;
  jam: string;
  uraian: string;
  petugas: string;
}

export interface UraianKonfirmasi {
  noRM: string;
  // Manual fields
  noKartu: string;
  kelasDitempati: string;
  jatahKelas: string;
  apsPenuhSesuai: string;
  tlpAsuransi: string;
  email: string;
  // Riwayat
  riwayat: UraianRiwayat[];
  // Checklist
  konfirmasiMasukDengan: string;
  vitamin: 'dijamin' | 'tidak_dijamin';
  suplemen: 'dijamin' | 'tidak_dijamin';
  nonMedis: 'dijamin' | 'tidak_dijamin';
  herbal: 'dijamin' | 'tidak_dijamin';
  selisihBayar: 'internal' | 'bayar_ditempat';
  benefitAneka: string;
  batasanKonfirmasi: string;
  lma: 'ada' | 'belum_ada';
  jaminan: 'sudah_ada' | 'belum_ada';
  suratPernyataan: 'ada' | 'belum_ada';
  // Meta
  updatedAt: number;
  updatedBy: string;
}

// ── DB Schema ─────────────────────────────────────────────────────────────────

interface EMCDBSchema extends DBSchema {
  users: {
    key: number;
    value: User;
  };
  patients: {
    key: string;
    value: Patient;
  };
  episodes: {
    key: number;
    value: Episode;
    indexes: {
      'noRM': string;
      'episodeNo': string;
    };
  };
  pendings: {
    key: string;
    value: Pending;
    indexes: {
      'noRM': string;
      'episodeNo': string;
      'status': string;
    };
  };
  justInfos: {
    key: string;
    value: JustInfo;
    indexes: {
      'noRM': string;
    };
  };
  operanShifts: {
    key: string;
    value: OperanShift;
    indexes: {
      'tanggal': string;
    };
  };
  importLogs: {
    key: number;
    value: ImportLog;
  };
  activityLogs: {
    key: number;
    value: ActivityLog;
    indexes: {
      'timestamp': number;
      'username': string;
      'modul': string;
      'status': string;
    };
  };
  settings: {
    key: string;
    value: Setting;
  };
  // v2 stores
  masterTarifs: {
    key: number;
    value: MasterTarif;
  };
  masterTarifItems: {
    key: number;
    value: MasterTarifItem;
    indexes: {
      'masterTarifId': number;
    };
  };
  // v3 stores
  estimasiBiaya: {
    key: string;
    value: EstimasiBiaya;
    indexes: {
      'noRM': string;
    };
  };
  // v4 stores
  syncLogs: {
    key: number;
    value: SyncLog;
  };
  // v5 stores
  billingRules: {
    key: number;
    value: BillingRule;
  };
  billingChecks: {
    key: string;
    value: BillingCheck;
    indexes: {
      'noRM': string;
    };
  };
  // v7 stores
  notifikasiBilling: {
    key: string;
    value: NotifikasiBillingStatus;
    indexes: {
      'noRM': string;
    };
  };
  // v8 stores
  kasirTemplates: {
    key: number;
    value: KasirTemplate;
  };
  // v9 stores
  uraianKonfirmasi: {
    key: string;
    value: UraianKonfirmasi;
  };
}

let dbPromise: Promise<IDBPDatabase<EMCDBSchema>> | null = null;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<EMCDBSchema>('emc_admission_db', 10, {
      upgrade(db, oldVersion, _newVersion, tx) {
        // v1 stores
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('patients')) {
          db.createObjectStore('patients', { keyPath: 'noRM' });
        }
        if (!db.objectStoreNames.contains('episodes')) {
          const epStore = db.createObjectStore('episodes', { keyPath: 'id', autoIncrement: true });
          epStore.createIndex('noRM', 'noRM');
          epStore.createIndex('episodeNo', 'episodeNo');
        }
        if (!db.objectStoreNames.contains('pendings')) {
          const pendStore = db.createObjectStore('pendings', { keyPath: 'id' });
          pendStore.createIndex('noRM', 'noRM');
          pendStore.createIndex('episodeNo', 'episodeNo');
          pendStore.createIndex('status', 'status');
        }
        if (!db.objectStoreNames.contains('justInfos')) {
          const jiStore = db.createObjectStore('justInfos', { keyPath: 'id' });
          jiStore.createIndex('noRM', 'noRM');
        }
        if (!db.objectStoreNames.contains('operanShifts')) {
          const osStore = db.createObjectStore('operanShifts', { keyPath: 'id' });
          osStore.createIndex('tanggal', 'tanggal');
        }
        if (!db.objectStoreNames.contains('importLogs')) {
          db.createObjectStore('importLogs', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('activityLogs')) {
          db.createObjectStore('activityLogs', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        // v2 stores
        if (!db.objectStoreNames.contains('masterTarifs')) {
          db.createObjectStore('masterTarifs', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('masterTarifItems')) {
          const mtiStore = db.createObjectStore('masterTarifItems', { keyPath: 'id', autoIncrement: true });
          mtiStore.createIndex('masterTarifId', 'masterTarifId');
        }
        // v3 stores
        if (!db.objectStoreNames.contains('estimasiBiaya')) {
          const ebStore = db.createObjectStore('estimasiBiaya', { keyPath: 'id' });
          ebStore.createIndex('noRM', 'noRM');
        }
        // v4 stores
        if (!db.objectStoreNames.contains('syncLogs')) {
          db.createObjectStore('syncLogs', { keyPath: 'id', autoIncrement: true });
        }
        // v5 stores
        if (!db.objectStoreNames.contains('billingRules')) {
          db.createObjectStore('billingRules', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('billingChecks')) {
          const bcStore = db.createObjectStore('billingChecks', { keyPath: 'id' });
          bcStore.createIndex('noRM', 'noRM');
        }
        // v7 stores
        if (!db.objectStoreNames.contains('notifikasiBilling')) {
          const nbStore = db.createObjectStore('notifikasiBilling', { keyPath: 'id' });
          nbStore.createIndex('noRM', 'noRM');
        }
        // v8 stores
        if (!db.objectStoreNames.contains('kasirTemplates')) {
          db.createObjectStore('kasirTemplates', { keyPath: 'id', autoIncrement: true });
        }
        // v9 stores
        if (!db.objectStoreNames.contains('uraianKonfirmasi')) {
          db.createObjectStore('uraianKonfirmasi', { keyPath: 'noRM' });
        }
        // v10: recreate billingRules with new flexible rule-builder schema
        if (oldVersion < 10) {
          if (db.objectStoreNames.contains('billingRules')) {
            db.deleteObjectStore('billingRules');
          }
          db.createObjectStore('billingRules', { keyPath: 'id', autoIncrement: true });
        }
        // v6: add indexes on activityLogs for fast filtering
        // Use the upgrade transaction (tx) directly — never open a new transaction inside upgrade
        if (oldVersion < 6 && db.objectStoreNames.contains('activityLogs')) {
          const store = tx.objectStore('activityLogs');
          if (!store.indexNames.contains('timestamp')) store.createIndex('timestamp', 'timestamp');
          if (!store.indexNames.contains('username')) store.createIndex('username', 'username');
          if (!store.indexNames.contains('modul')) store.createIndex('modul', 'modul');
          if (!store.indexNames.contains('status')) store.createIndex('status', 'status');
        }
      },
    });
  }
  return dbPromise;
};

export const getDB = async () => {
  return await initDB();
};
