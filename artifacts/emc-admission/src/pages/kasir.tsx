import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getDB, Patient, NotifikasiBillingStatus, KasirTemplate } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { ensureDefaultKasirTemplates } from './templatePesanKasir';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Search, Copy, MessageCircle, X, Phone, User2, CreditCard,
  Bell, Check, CheckCheck, BellRing, FileText, Settings, Pencil, Save,
} from 'lucide-react';
import { useLocation } from 'wouter';

// ── Helpers ──────────────────────────────────────────────────────────────────
const getGreeting = () => {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Pagi';
  if (h >= 12 && h < 15) return 'Siang';
  if (h >= 15 && h < 18) return 'Sore';
  return 'Malam';
};

const toRupiah = (val: string) => {
  const num = parseInt(val.replace(/\D/g, ''), 10);
  if (isNaN(num)) return '';
  return 'Rp ' + num.toLocaleString('id-ID');
};

const parseRupiah = (val: string) => val.replace(/\D/g, '');

const waLink = (hp: string, msg: string) => {
  let num = hp.replace(/\D/g, '');
  if (num.startsWith('0')) num = '62' + num.slice(1);
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
};

const fmtDate = (d: string) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
};

const calcHariRawat = (admissionDate: string): number => {
  try {
    return Math.floor((Date.now() - new Date(admissionDate).getTime()) / 86400000);
  } catch { return 0; }
};

// ── Placeholder utilities ─────────────────────────────────────────────────────
const RUPIAH_KEYS = new Set(['billing', 'deposit', 'sisa_deposit', 'kekurangan']);

const AUTO_KEYS = new Set([
  'nama_pasien', 'no_rm', 'episode', 'ruangan', 'kelas', 'dokter',
  'penjamin', 'salam', 'tanggal', 'jam', 'nama_petugas', 'no_hp_penanggung_jawab',
  // billing-tab auto fields
  'hari_rawat', 'estimasi_billing', 'tanggal_masuk',
]);

function getManualPlaceholders(isiTemplate: string): string[] {
  const matches = isiTemplate.match(/\{\{([^}]+)\}\}/g) ?? [];
  const keys = matches.map(m => m.slice(2, -2).trim());
  return [...new Set(keys.filter(k => !AUTO_KEYS.has(k)))];
}

function applyPlaceholders(
  isiTemplate: string,
  patient: Patient,
  currentUser: { namaLengkap: string; username: string },
  manualFields: Record<string, string>,
): string {
  const now = new Date();
  const tanggal = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const ruangan = [patient.ward, patient.roomName, patient.bedCode].filter(Boolean).join(' / ');

  let msg = isiTemplate;
  msg = msg.replace(/\{\{salam\}\}/g, getGreeting());
  msg = msg.replace(/\{\{nama_pasien\}\}/g, patient.namaPasien || '');
  msg = msg.replace(/\{\{no_rm\}\}/g, patient.noRM || '');
  msg = msg.replace(/\{\{episode\}\}/g, patient.episodeNo || '');
  msg = msg.replace(/\{\{ruangan\}\}/g, ruangan || '-');
  msg = msg.replace(/\{\{kelas\}\}/g, patient.roomType || '-');
  msg = msg.replace(/\{\{dokter\}\}/g, patient.dpjp || '-');
  msg = msg.replace(/\{\{penjamin\}\}/g, patient.payor || '-');
  msg = msg.replace(/\{\{no_hp_penanggung_jawab\}\}/g, patient.noHpPJ || '-');
  msg = msg.replace(/\{\{tanggal\}\}/g, tanggal);
  msg = msg.replace(/\{\{jam\}\}/g, jam);
  msg = msg.replace(/\{\{nama_petugas\}\}/g, currentUser.namaLengkap || currentUser.username);

  Object.entries(manualFields).forEach(([key, val]) => {
    const display = RUPIAH_KEYS.has(key) && val
      ? 'Rp ' + parseInt(val.replace(/\D/g, '') || '0', 10).toLocaleString('id-ID')
      : val;
    msg = msg.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), display);
  });

  return msg;
}

function labelForPlaceholder(key: string): string {
  const map: Record<string, string> = {
    billing: 'Billing (Rp)',
    deposit: 'Deposit (Rp)',
    sisa_deposit: 'Sisa Deposit (Rp)',
    kekurangan: 'Kekurangan (Rp)',
    nama_penanggung_jawab: 'Nama Penanggung Jawab',
    daftar_obat: 'Daftar Obat & Estimasi',
    daftar_periksa: 'Daftar Pemeriksaan & Estimasi',
    daftar_obat_periksa: 'Daftar Obat & Pemeriksaan',
  };
  return map[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Billing Sementara message builder ─────────────────────────────────────────
function buildBillingMessage(p: Patient, hariRawat: number, estimasi: number): string {
  return `Yth. Bapak/Ibu Keluarga Pasien,

Kami informasikan perkembangan sementara biaya perawatan pasien berikut:

Nama Pasien : ${p.namaPasien}
No. RM      : ${p.noRM}
Penjamin    : ${p.payor || '-'}
Hari Rawat  : Hari ke-${hariRawat}

Estimasi total billing sementara hingga saat ini adalah sebesar *Rp ${estimasi.toLocaleString('id-ID')}*.

Nominal tersebut masih bersifat sementara dan dapat berubah sesuai dengan tindakan, pemeriksaan, obat, maupun pelayanan yang masih berlangsung selama masa perawatan.

Apabila terdapat pertanyaan mengenai rincian biaya, silakan menghubungi bagian Kasir Rawat Inap.

Terima kasih atas perhatian dan kerja samanya.

Hormat kami,
Kasir Rawat Inap`;
}

// ── Notifikasi Billing Tab ────────────────────────────────────────────────────
function NotifikasiBillingTab() {
  const [patients, setPatients]         = useState<Patient[]>([]);
  const [statusMap, setStatusMap]       = useState<Map<string, NotifikasiBillingStatus>>(new Map());
  const [estimasiInputs, setEstimasiInputs] = useState<Map<string, string>>(new Map());
  const [filterStatus, setFilterStatus] = useState<'semua' | 'belum' | 'sudah'>('semua');
  const [filterHariRawat, setFilterHariRawat] = useState<number | 'semua'>('semua');
  const [filterPenjamin, setFilterPenjamin]   = useState<string>('semua');
  const [searchTerm, setSearchTerm]     = useState('');

  // ── Inline edit No HP PJ ──────────────────────────────────────────────────
  const [hpEditing, setHpEditing]   = useState<Set<string>>(new Set());
  const [hpInputs, setHpInputs]     = useState<Map<string, string>>(new Map());
  const [hpSaving, setHpSaving]     = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const db = await getDB();
    const all = await db.getAll('patients');
    const today = Date.now();
    const filtered = all.filter(p => {
      if (p.status !== 'aktif') return false;
      if (!p.payor || p.payor.toUpperCase().includes('BPJS')) return false;
      if (!p.admissionDate) return false;
      const hari = Math.floor((today - new Date(p.admissionDate).getTime()) / 86400000);
      return hari >= 2 && hari % 2 === 0;
    });
    setPatients(filtered);

    const statuses = await db.getAll('notifikasiBilling');
    const map = new Map<string, NotifikasiBillingStatus>();
    const inputs = new Map<string, string>();
    for (const s of statuses) {
      map.set(s.id, s);
      if (s.estimasiBilling > 0) inputs.set(s.id, String(s.estimasiBilling));
    }
    setStatusMap(map);
    setEstimasiInputs(inputs);
  }, []);

  useEffect(() => { load(); }, [load]);

  const hariRawatValues = useMemo(() => {
    const vals = new Set<number>();
    patients.forEach(p => vals.add(calcHariRawat(p.admissionDate)));
    return Array.from(vals).sort((a, b) => a - b);
  }, [patients]);

  const penjaminValues = useMemo(() => {
    const vals = new Set<string>();
    patients.forEach(p => { if (p.payor) vals.add(p.payor); });
    return Array.from(vals).sort();
  }, [patients]);

  const displayPatients = useMemo(() => {
    return patients.filter(p => {
      const st = statusMap.get(p.episodeNo);
      const hari = calcHariRawat(p.admissionDate);
      if (filterStatus === 'belum' && st?.sudahDikirim) return false;
      if (filterStatus === 'sudah' && !st?.sudahDikirim) return false;
      if (filterHariRawat !== 'semua' && hari !== filterHariRawat) return false;
      if (filterPenjamin !== 'semua' && p.payor !== filterPenjamin) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!p.namaPasien.toLowerCase().includes(q) && !p.noRM.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => calcHariRawat(a.admissionDate) - calcHariRawat(b.admissionDate));
  }, [patients, statusMap, filterStatus, filterHariRawat, filterPenjamin, searchTerm]);

  const saveEstimasi = async (p: Patient, rawDigits: string) => {
    const amount = parseInt(rawDigits.replace(/\D/g, ''), 10) || 0;
    const db = await getDB();
    const existing = statusMap.get(p.episodeNo);
    const updated: NotifikasiBillingStatus = {
      id: p.episodeNo,
      noRM: p.noRM,
      episodeNo: p.episodeNo,
      estimasiBilling: amount,
      sudahDikirim: existing?.sudahDikirim ?? false,
      sentAt: existing?.sentAt,
      updatedAt: Date.now(),
    };
    await db.put('notifikasiBilling', updated);
    setStatusMap(prev => new Map(prev).set(p.episodeNo, updated));
  };

  const tandaiDikirim = async (p: Patient, sudah: boolean) => {
    const db = await getDB();
    const existing = statusMap.get(p.episodeNo);
    const updated: NotifikasiBillingStatus = {
      id: p.episodeNo,
      noRM: p.noRM,
      episodeNo: p.episodeNo,
      estimasiBilling: existing?.estimasiBilling ?? 0,
      sudahDikirim: sudah,
      sentAt: sudah ? Date.now() : undefined,
      updatedAt: Date.now(),
    };
    await db.put('notifikasiBilling', updated);
    setStatusMap(prev => new Map(prev).set(p.episodeNo, updated));
    toast.success(sudah ? 'Ditandai sudah dikirim!' : 'Status dikembalikan ke belum dikirim.');
  };

  const copyBillingMessage = (p: Patient, hariRawat: number, estimasi: number) => {
    const msg = buildBillingMessage(p, hariRawat, estimasi);
    navigator.clipboard.writeText(msg).then(() => toast.success('Pesan disalin ke clipboard!'));
  };

  const openBillingWhatsApp = (p: Patient, hariRawat: number, estimasi: number) => {
    if (!p.noHpPJ) {
      toast.error('No HP Penanggung Jawab belum diisi di data pasien.');
      return;
    }
    const msg = buildBillingMessage(p, hariRawat, estimasi);
    window.open(waLink(p.noHpPJ, msg), '_blank');
  };

  // ── Inline HP PJ handlers ─────────────────────────────────────────────────
  const startEditHp = (episodeNo: string, current: string) => {
    setHpInputs(prev => new Map(prev).set(episodeNo, current));
    setHpEditing(prev => new Set(prev).add(episodeNo));
  };

  const cancelEditHp = (episodeNo: string) => {
    setHpEditing(prev => { const s = new Set(prev); s.delete(episodeNo); return s; });
    setHpInputs(prev => { const m = new Map(prev); m.delete(episodeNo); return m; });
  };

  const saveHpPJ = async (p: Patient) => {
    const raw = (hpInputs.get(p.episodeNo) ?? '').trim();
    if (!raw) { toast.error('Nomor HP tidak boleh kosong.'); return; }
    setHpSaving(prev => new Set(prev).add(p.episodeNo));
    try {
      const db = await getDB();
      const existing = await db.get('patients', p.noRM);
      if (!existing) { toast.error('Data pasien tidak ditemukan.'); return; }
      const updated = { ...existing, noHpPJ: raw, updatedAt: Date.now() };
      await db.put('patients', updated);
      // Update local patients state so UI reflects immediately
      setPatients(prev => prev.map(pt => pt.episodeNo === p.episodeNo ? { ...pt, noHpPJ: raw } : pt));
      cancelEditHp(p.episodeNo);
      toast.success('No HP Penanggung Jawab berhasil disimpan.');
    } catch {
      toast.error('Gagal menyimpan No HP. Coba lagi.');
    } finally {
      setHpSaving(prev => { const s = new Set(prev); s.delete(p.episodeNo); return s; });
    }
  };

  const belumCount = patients.filter(p => !statusMap.get(p.episodeNo)?.sudahDikirim).length;
  const sudahCount = patients.filter(p => statusMap.get(p.episodeNo)?.sudahDikirim === true).length;

  return (
    <div className="space-y-4">
      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{patients.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Pasien</p>
        </div>
        <div className="rounded-xl border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{belumCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Belum Dikirim</p>
        </div>
        <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{sudahCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Sudah Dikirim</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau No RM..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Status filter */}
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(['semua', 'belum', 'sudah'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    filterStatus === s
                      ? 'bg-background shadow text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s === 'semua' ? 'Semua' : s === 'belum' ? 'Belum Dikirim' : 'Sudah Dikirim'}
                </button>
              ))}
            </div>

            {/* Hari rawat filter */}
            <select
              className="text-xs border border-input bg-background rounded-lg px-3 py-1.5 h-8 focus:outline-none focus:ring-1 focus:ring-ring"
              value={filterHariRawat}
              onChange={e => setFilterHariRawat(e.target.value === 'semua' ? 'semua' : Number(e.target.value))}
            >
              <option value="semua">Semua Hari Rawat</option>
              {hariRawatValues.map(h => (
                <option key={h} value={h}>Hari ke-{h}</option>
              ))}
            </select>

            {/* Penjamin filter */}
            <select
              className="text-xs border border-input bg-background rounded-lg px-3 py-1.5 h-8 focus:outline-none focus:ring-1 focus:ring-ring"
              value={filterPenjamin}
              onChange={e => setFilterPenjamin(e.target.value)}
            >
              <option value="semua">Semua Penjamin</option>
              {penjaminValues.map(pj => (
                <option key={pj} value={pj}>{pj}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Patient cards */}
      {displayPatients.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Tidak ada pasien yang memenuhi kriteria</p>
          <p className="text-xs mt-1 opacity-70">Pasien non-BPJS aktif dengan hari rawat kelipatan 2 (2, 4, 6, 8, ...)</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayPatients.map(p => {
            const hariRawat  = calcHariRawat(p.admissionDate);
            const stored     = statusMap.get(p.episodeNo);
            const sudahDikirim = stored?.sudahDikirim ?? false;
            const rawInput   = estimasiInputs.get(p.episodeNo) ?? (stored?.estimasiBilling ? String(stored.estimasiBilling) : '');
            const estimasiNum = parseInt(rawInput.replace(/\D/g, ''), 10) || 0;

            return (
              <div
                key={p.episodeNo}
                className={`rounded-xl border p-4 space-y-3 transition-all ${
                  sudahDikirim
                    ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                    : 'bg-card border-border hover:border-primary/30'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-base leading-tight truncate">{p.namaPasien}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span>RM: <span className="font-medium text-foreground">{p.noRM}</span></span>
                      <span>Ep: <span className="font-medium text-foreground">{p.episodeNo}</span></span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    sudahDikirim
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                  }`}>
                    {sudahDikirim ? '✓ Sudah Dikirim' : 'Belum Dikirim'}
                  </span>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Penjamin</p>
                    <p className="font-semibold truncate">{p.payor || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ruangan/Kamar</p>
                    <p className="font-semibold truncate">{p.ward || p.roomName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tanggal Masuk</p>
                    <p className="font-semibold">{fmtDate(p.admissionDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hari Rawat</p>
                    <p className="font-bold text-primary text-base">Hari ke-{hariRawat}</p>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs text-muted-foreground">No. HP Penanggung Jawab</p>
                      {!hpEditing.has(p.episodeNo) && (
                        <button
                          onClick={() => startEditHp(p.episodeNo, p.noHpPJ || '')}
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                          title={p.noHpPJ ? 'Ubah No HP' : 'Tambah No HP'}
                        >
                          <Pencil className="w-3 h-3" />
                          {p.noHpPJ ? 'Ubah' : 'Tambah'}
                        </button>
                      )}
                    </div>

                    {hpEditing.has(p.episodeNo) ? (
                      /* ── Inline edit form ── */
                      <div className="flex gap-2 items-center mt-1">
                        <Input
                          autoFocus
                          inputMode="tel"
                          placeholder="Contoh: 08123456789"
                          value={hpInputs.get(p.episodeNo) ?? ''}
                          onChange={e => setHpInputs(prev => new Map(prev).set(p.episodeNo, e.target.value))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveHpPJ(p);
                            if (e.key === 'Escape') cancelEditHp(p.episodeNo);
                          }}
                          className="h-8 text-sm flex-1"
                        />
                        <Button
                          size="sm"
                          className="h-8 px-3 gap-1 text-xs"
                          onClick={() => saveHpPJ(p)}
                          disabled={hpSaving.has(p.episodeNo)}
                        >
                          <Save className="w-3.5 h-3.5" />
                          {hpSaving.has(p.episodeNo) ? '...' : 'Simpan'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => cancelEditHp(p.episodeNo)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : p.noHpPJ ? (
                      /* ── HP tersedia ── */
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" /> {p.noHpPJ}
                        </span>
                        <a
                          href={waLink(p.noHpPJ, buildBillingMessage(p, hariRawat, estimasiNum))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#25D366]/10 text-[#128C7E] border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-colors"
                        >
                          <MessageCircle className="w-3 h-3" /> WhatsApp
                        </a>
                      </div>
                    ) : (
                      /* ── HP belum diisi ── */
                      <button
                        onClick={() => startEditHp(p.episodeNo, '')}
                        className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        No HP belum diisi — klik untuk menambahkan
                      </button>
                    )}
                  </div>
                </div>

                {/* Estimasi billing input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Estimasi Billing Sementara</label>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none">Rp</span>
                      <Input
                        className="pl-9 font-semibold"
                        inputMode="numeric"
                        placeholder="0"
                        value={rawInput}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '');
                          setEstimasiInputs(prev => new Map(prev).set(p.episodeNo, digits));
                        }}
                        onBlur={() => saveEstimasi(p, rawInput)}
                      />
                    </div>
                    {estimasiNum > 0 && (
                      <p className="text-sm font-bold text-primary whitespace-nowrap shrink-0">
                        {estimasiNum.toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 text-xs h-8"
                    onClick={() => copyBillingMessage(p, hariRawat, estimasiNum)}
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Pesan
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 text-xs h-8 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0"
                    onClick={() => {
                      if (!p.noHpPJ) {
                        startEditHp(p.episodeNo, '');
                        return;
                      }
                      openBillingWhatsApp(p, hariRawat, estimasiNum);
                    }}
                    title={!p.noHpPJ ? 'Klik untuk mengisi No HP PJ terlebih dahulu' : `Kirim ke ${p.noHpPJ}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {p.noHpPJ ? 'WhatsApp' : 'Isi No HP & Kirim'}
                  </Button>
                </div>

                <Button
                  size="sm"
                  variant={sudahDikirim ? 'outline' : 'default'}
                  className={`w-full gap-2 text-xs h-8 ${
                    sudahDikirim
                      ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      : ''
                  }`}
                  onClick={() => tandaiDikirim(p, !sudahDikirim)}
                >
                  {sudahDikirim ? (
                    <><CheckCheck className="w-3.5 h-3.5" /> Sudah Dikirim — Batalkan</>
                  ) : (
                    <><Check className="w-3.5 h-3.5" /> Tandai Sudah Dikirim</>
                  )}
                </Button>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Pesan Kasir Tab — dynamic templates from DB ───────────────────────────────
function PesanKasirTab() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [patients, setPatients]           = useState<Patient[]>([]);
  const [templates, setTemplates]         = useState<KasirTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [searchTerm, setSearchTerm]       = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<KasirTemplate | null>(null);
  const [manualFields, setManualFields]   = useState<Record<string, string>>({});
  const [manualPlaceholders, setManualPlaceholders] = useState<string[]>([]);
  const [message, setMessage]             = useState('');

  // Load patients + templates (seed defaults if empty)
  const loadAll = useCallback(async () => {
    const db = await getDB();
    const [allPatients] = await Promise.all([
      db.getAll('patients'),
      ensureDefaultKasirTemplates(),
    ]);
    setPatients(allPatients.filter(p => p.status === 'aktif'));

    const allTpls = await db.getAll('kasirTemplates');
    setTemplates(allTpls.filter(t => t.aktif).sort((a, b) => a.urutan - b.urutan));
    setLoadingTemplates(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Search patients
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const q = searchTerm.toLowerCase();
    setSearchResults(
      patients.filter(p =>
        p.noRM.toLowerCase().includes(q) || p.namaPasien.toLowerCase().includes(q)
      ).slice(0, 8)
    );
  }, [searchTerm, patients]);

  // Re-generate message whenever template, patient, or manual fields change
  useEffect(() => {
    if (!selectedTemplate || !selectedPatient || !user) { setMessage(''); return; }
    const generated = applyPlaceholders(selectedTemplate.isiTemplate, selectedPatient, user, manualFields);
    setMessage(generated);
  }, [selectedTemplate, selectedPatient, user, manualFields]);

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setSearchTerm('');
    setSearchResults([]);
    setSelectedTemplate(null);
    setManualFields({});
    setManualPlaceholders([]);
    setMessage('');
  };

  const clearPatient = () => {
    setSelectedPatient(null);
    setSelectedTemplate(null);
    setManualFields({});
    setManualPlaceholders([]);
    setMessage('');
  };

  const selectTemplate = (tpl: KasirTemplate) => {
    setSelectedTemplate(tpl);
    setManualFields({});
    setManualPlaceholders(getManualPlaceholders(tpl.isiTemplate));
  };

  const setField = (key: string, val: string) =>
    setManualFields(f => ({ ...f, [key]: val }));

  const handleRupiahInput = (key: string, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setField(key, digits);
  };

  const copyMessage = () => {
    if (!message) return;
    navigator.clipboard.writeText(message).then(() => toast.success('Pesan disalin ke clipboard!'));
  };

  const openWhatsApp = () => {
    if (!message) return;
    const hp = selectedPatient?.noHpPJ || '';
    if (!hp) { toast.error('No HP Penanggung Jawab belum diisi di data pasien.'); return; }
    window.open(waLink(hp, message), '_blank');
  };

  // Group templates by category
  const grouped = useMemo(() => {
    const map = new Map<string, KasirTemplate[]>();
    for (const t of templates) {
      const cat = t.kategori || 'Lainnya';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return map;
  }, [templates]);

  const categories = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const [activeCategory, setActiveCategory] = useState<string>('');

  // Set active category when templates load or change
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  // Strip category prefix from template name for shorter display
  const shortName = (tpl: KasirTemplate) => {
    const prefix = tpl.kategori ? tpl.kategori + ' — ' : '';
    return tpl.namaTemplate.startsWith(prefix)
      ? tpl.namaTemplate.slice(prefix.length)
      : tpl.namaTemplate;
  };

  const currentTemplates = grouped.get(activeCategory) ?? [];
  const allFieldsFilled = manualPlaceholders.length === 0 || manualPlaceholders.every(k => !!manualFields[k]);

  // Current step: 1 = pilih pasien, 2 = pilih template, 3 = kirim
  const step = !selectedPatient ? 1 : !selectedTemplate ? 2 : 3;

  return (
    <div className="space-y-4">

      {/* ── Step 1: Pilih Pasien ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</span>
          <p className="text-sm font-semibold text-foreground">Pilih Pasien</p>
        </div>

        {selectedPatient ? (
          <div className="flex items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-emerald-800 dark:text-emerald-300 truncate">{selectedPatient.namaPasien}</p>
              <p className="text-xs text-muted-foreground truncate">
                {selectedPatient.noRM}
                {selectedPatient.ward ? ` · ${selectedPatient.ward}` : ''}
                {selectedPatient.payor ? ` · ${selectedPatient.payor}` : ''}
              </p>
              {!selectedPatient.noHpPJ && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> No HP PJ belum diisi
                </p>
              )}
            </div>
            <button
              onClick={clearPatient}
              className="text-muted-foreground hover:text-destructive shrink-0 p-1 rounded-md hover:bg-destructive/10 transition-colors"
              title="Ganti pasien"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Ketik nama atau No RM pasien..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
              autoComplete="off"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-50 w-full bg-popover border border-border rounded-xl shadow-lg mt-1 max-h-56 overflow-y-auto">
                {searchResults.map(p => (
                  <button
                    key={p.noRM}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border/50 last:border-0 first:rounded-t-xl last:rounded-b-xl"
                    onClick={() => selectPatient(p)}
                  >
                    <p className="font-semibold text-sm">{p.namaPasien}</p>
                    <p className="text-xs text-muted-foreground">{p.noRM} · {p.ward || p.roomName} · {p.payor}</p>
                  </button>
                ))}
              </div>
            )}
            {searchTerm.length > 1 && searchResults.length === 0 && (
              <div className="absolute z-50 w-full bg-popover border border-border rounded-xl shadow-lg mt-1 p-4 text-center text-sm text-muted-foreground">
                Pasien tidak ditemukan
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Step 2: Pilih Template ── */}
      {selectedPatient && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</span>
              <p className="text-sm font-semibold text-foreground">Pilih Jenis Pesan</p>
            </div>
            <button
              onClick={() => setLocation('/settings')}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
            >
              <Settings className="w-3 h-3" /> Kelola
            </button>
          </div>

          {loadingTemplates ? (
            <p className="text-sm text-muted-foreground px-1">Memuat...</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 space-y-2 border border-dashed rounded-xl">
              <FileText className="w-7 h-7 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Belum ada template aktif.</p>
              <button onClick={() => setLocation('/settings')} className="text-xs text-primary hover:underline">
                Tambahkan di Pengaturan
              </button>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Category tab bar */}
              {categories.length > 1 && (
                <div className="flex overflow-x-auto border-b border-border bg-muted/40 scrollbar-hide">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`flex-shrink-0 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
                        activeCategory === cat
                          ? 'border-primary text-primary bg-background'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Template list for active category */}
              <div className="divide-y divide-border">
                {currentTemplates.map(t => {
                  const isSelected = selectedTemplate?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => selectTemplate(t)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                        isSelected
                          ? 'bg-primary/8 text-primary'
                          : 'hover:bg-muted/60 text-foreground'
                      }`}
                    >
                      <span className="text-sm font-medium">{shortName(t)}</span>
                      {isSelected && (
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Isi data + kirim ── */}
      {selectedTemplate && selectedPatient && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-primary text-primary-foreground">3</span>
            <p className="text-sm font-semibold text-foreground">
              {manualPlaceholders.length > 0 ? 'Lengkapi Data & Kirim' : 'Preview & Kirim'}
            </p>
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            {/* Manual fields (only if needed) */}
            {manualPlaceholders.length > 0 && (
              <div className="p-4 space-y-3 border-b border-border bg-muted/20">
                {manualPlaceholders.map(key => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {labelForPlaceholder(key)}
                    </label>
                    {RUPIAH_KEYS.has(key) ? (
                      <div className="space-y-1">
                        <Input
                          placeholder="Contoh: 5000000"
                          value={manualFields[key] || ''}
                          onChange={e => handleRupiahInput(key, e.target.value)}
                          inputMode="numeric"
                          className="h-9 text-sm"
                        />
                        {manualFields[key] && (
                          <p className="text-xs text-primary font-medium pl-1">{toRupiah(manualFields[key])}</p>
                        )}
                      </div>
                    ) : (
                      <textarea
                        className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                        placeholder={`Isi ${labelForPlaceholder(key)}...`}
                        value={manualFields[key] || ''}
                        onChange={e => setField(key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Message preview */}
            <div className="p-4 space-y-3">
              <textarea
                className="w-full min-h-[180px] rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm font-sans leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Pesan akan muncul di sini..."
              />

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={copyMessage}
                  disabled={!message}
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                >
                  <Copy className="w-3.5 h-3.5" /> Salin
                </Button>
                <Button
                  onClick={openWhatsApp}
                  disabled={!message || !allFieldsFilled}
                  size="sm"
                  className="flex-1 gap-1.5 text-xs bg-[#25D366] hover:bg-[#1fbc59] text-white border-0 shadow-sm"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  {selectedPatient.noHpPJ ? 'Kirim WhatsApp' : 'No HP belum diisi'}
                </Button>
              </div>

              {!selectedPatient.noHpPJ && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  Isi No HP Penanggung Jawab di halaman Pasien agar bisa kirim WhatsApp langsung.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
export default function KasirPage() {
  const [activeTab, setActiveTab] = useState<'pesan' | 'notifikasi'>('pesan');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pesan Kasir</h1>
        <p className="text-muted-foreground mt-1">Generate pesan konfirmasi WhatsApp untuk penanggung jawab pasien.</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('pesan')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'pesan'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          Pesan Kasir
        </button>
        <button
          onClick={() => setActiveTab('notifikasi')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'notifikasi'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BellRing className="w-4 h-4" />
          Notifikasi Billing Sementara
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'pesan' ? <PesanKasirTab /> : <NotifikasiBillingTab />}
    </div>
  );
}
