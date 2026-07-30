import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Search, X, Clock, MapPin, Activity, Stethoscope, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { apiUrl, hasApiProxy } from '@/lib/apiConfig';

// ── Types ─────────────────────────────────────────────────────────────────────

interface IGDPatient {
  nama: string;
  noRM: string;
  dokter: string;
  lokasi: string;
  timerOutpatient: string;
  timerTransfer: string;
  timerColor: string;
}

type WardKey =
  | 'nurse-station'
  | 'procedure-room'
  | 'ward-1' | 'ward-2' | 'ward-3' | 'ward-4' | 'ward-5'
  | 'ward-6' | 'ward-7' | 'ward-8' | 'ward-9' | 'ward-10'
  | 'rawat-jalan'
  | 'rawat-inap';

// ── Ward placement logic ───────────────────────────────────────────────────────

function getPatientWard(p: IGDPatient): WardKey {
  const lokasi = (p.lokasi ?? '').trim();
  const dokter = (p.dokter ?? '').trim();

  if (/discharge\s+lounge\s+ip/i.test(lokasi)) return 'rawat-inap';
  if (/discharge\s+lounge\s+op/i.test(lokasi)) return 'rawat-jalan';

  if (
    /ruang\s*tindakan/i.test(lokasi) ||
    /procedure\s*room/i.test(lokasi) ||
    /tindakan/i.test(lokasi)
  ) return 'procedure-room';

  const pkMatch = lokasi.match(/Emergency\s+PK\/(\d+)/i);
  if (pkMatch) {
    const n = parseInt(pkMatch[1], 10);
    if (n >= 1 && n <= 10) return `ward-${n}` as WardKey;
  }

  if (!dokter || dokter === '' || dokter === '-') return 'nurse-station';

  return 'nurse-station';
}

// ── ED Transit placement logic (dynamic) ──────────────────────────────────────
// Returns a transit column key, or null if the patient is not in transit.
// Key format: "transit" (main) | "transit-N" (numbered bays)
//
// Recognised lokasi patterns:
//   "ED Transit"        → "transit"
//   "ED Transit PK N"   → "transit-N"   (N can be any number, fully dynamic)

function getEdTransitKey(lokasi: string): string | null {
  const s = (lokasi ?? '').trim();
  const pkMatch = s.match(/^ED\s+Transit\s+PK\s+(\d+)$/i);
  if (pkMatch) return `transit-${pkMatch[1]}`;
  if (/^ED\s+Transit$/i.test(s)) return 'transit';
  return null;
}

/** Sort order for transit keys: "transit" first, then numerically */
function transitKeySortOrder(key: string): number {
  if (key === 'transit') return 0;
  const m = key.match(/^transit-(\d+)$/);
  return m ? parseInt(m[1], 10) : 999;
}

// ── Timer utilities ────────────────────────────────────────────────────────────

/** Parse a timer string like "01:23" or "1:23:45" into total minutes. */
function parseTimerMinutes(t: string): number {
  if (!t || t === '--') return 0;
  const parts = t.split(':').map(Number).filter((n) => !isNaN(n));
  if (parts.length >= 2) return parts[0] * 60 + parts[1];
  return 0;
}

/**
 * Sort patients by longest wait time first.
 * Uses timerOutpatient (time since admission to IGD) as primary sort key.
 */
function sortByLongestWait(patients: IGDPatient[]): IGDPatient[] {
  return [...patients].sort(
    (a, b) =>
      parseTimerMinutes(b.timerOutpatient) - parseTimerMinutes(a.timerOutpatient),
  );
}

// ── Density indicator ─────────────────────────────────────────────────────────

function getDensityStyle(count: number): {
  dotClass: string;
  label: string;
  title: string;
} {
  if (count === 0)
    return { dotClass: 'bg-green-400', label: 'Kosong', title: 'Tidak ada pasien' };
  if (count <= 2)
    return { dotClass: 'bg-yellow-400', label: 'Sedang', title: '1–2 pasien' };
  return { dotClass: 'bg-red-400', label: 'Penuh', title: 'Lebih dari 2 pasien' };
}

// ── Data fetching ─────────────────────────────────────────────────────────────

const IGD_URL =
  'https://apps.emc.id/trakcare/dashboard/dailyemergencywaitingtime/trakcareANLT/hospital/4';

async function fetchIGDWardData(): Promise<IGDPatient[]> {
  if (hasApiProxy()) {
    const url = apiUrl(`/api/trakcare/igd-ward?url=${encodeURIComponent(IGD_URL)}`);
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.patients ?? [];
  }

  const res = await fetch(IGD_URL, {
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`TrakCare merespons HTTP ${res.status}`);
  const html = await res.text();
  return parseIGDPatientsClient(html);
}

function stripTagsClient(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function parseIGDPatientsClient(html: string): IGDPatient[] {
  const patients: IGDPatient[] = [];
  const cardBlocks = html.split('<div class="col-md-3 mb-4">').slice(1);

  for (const block of cardBlocks) {
    if (!block.includes('background-color:lavender')) continue;

    const timerRegex = /<div class="col-6 text-center h1\s*([^"]*)">([\s\S]*?)<\/div>/gi;
    const timers: { colorClass: string; value: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = timerRegex.exec(block)) !== null && timers.length < 2) {
      timers.push({ colorClass: m[1].trim(), value: stripTagsClient(m[2]).trim() });
    }

    const timerOutpatient = timers[0]?.value ?? '--';
    const timerTransfer = timers[1]?.value ?? '--';

    const infoRegex = /<div class="col-12 font-weight-bold[^"]*">([\s\S]*?)<\/div>/gi;
    const infos: string[] = [];
    let im: RegExpExecArray | null;
    while ((im = infoRegex.exec(block)) !== null) {
      const t = stripTagsClient(im[1]).trim();
      if (t) infos.push(t);
    }
    if (infos.length < 2) continue;

    patients.push({
      nama: infos[0] ?? '',
      noRM: infos[1] ?? '',
      dokter: infos[2] ?? '',
      lokasi: infos[3] ?? '',
      timerOutpatient,
      timerTransfer,
      timerColor: timers[1]?.colorClass ?? '',
    });
  }

  return patients;
}

// ── Timer badge colour ─────────────────────────────────────────────────────────

function getTimerBadgeColor(timerColor: string): string {
  if (!timerColor) return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  const c = timerColor.toLowerCase();
  if (c.includes('merah') || c.includes('red'))
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (c.includes('kuning') || c.includes('yellow'))
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  if (c.includes('hijau') || c.includes('green'))
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (c.includes('hitam') || c.includes('black')) return 'bg-gray-900 text-white';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

// ── Patient Card ──────────────────────────────────────────────────────────────

interface PatientCardProps {
  patient: IGDPatient;
  onClick: () => void;
  wardKey: string;
  showTransitBadge?: boolean;
}

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

const PatientCard: React.FC<PatientCardProps> = ({ patient, onClick, showTransitBadge }) => {
  const hasDokter = patient.dokter && patient.dokter !== '' && patient.dokter !== '-';
  const hasTransfer = patient.timerTransfer && patient.timerTransfer !== '--';

  // Build a short display label for the transit badge, e.g. "ED Transit 2"
  const transitLabel = (() => {
    const s = (patient.lokasi ?? '').trim();
    const pk = s.match(/^ED\s+Transit\s+PK\s+(\d+)$/i);
    if (pk) return `Transit ${pk[1]}`;
    if (/^ED\s+Transit$/i.test(s)) return 'Transit';
    return null;
  })();

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClick}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-3 cursor-pointer group"
      whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
    >
      {/* Transit location badge */}
      {showTransitBadge && transitLabel && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-800">
            <ArrowRightLeft className="h-2.5 w-2.5" />
            {transitLabel}
          </span>
        </div>
      )}

      {/* Nama Pasien */}
      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate leading-tight mb-1">
        {patient.nama || '—'}
      </div>

      {/* No RM */}
      <div className="flex items-center gap-1 mb-2">
        <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
          {patient.noRM || '—'}
        </span>
      </div>

      {/* Dokter */}
      <div className="flex items-start gap-1.5 mb-1.5">
        <Stethoscope className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
        <span
          className={`text-[11px] leading-tight ${
            hasDokter
              ? 'text-gray-700 dark:text-gray-300'
              : 'text-amber-600 dark:text-amber-400 italic'
          }`}
        >
          {hasDokter ? patient.dokter : 'Menunggu Dokter'}
        </span>
      </div>

      {/* Lokasi (only for non-transit cards, or when transit badge is hidden) */}
      {patient.lokasi && !showTransitBadge && (
        <div className="flex items-start gap-1.5 mb-2">
          <MapPin className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
          <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight truncate">
            {patient.lokasi}
          </span>
        </div>
      )}

      {/* Timer badges */}
      <div className="flex gap-1 flex-wrap">
        {patient.timerOutpatient && patient.timerOutpatient !== '--' && (
          <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono">
            OP: {patient.timerOutpatient}
          </span>
        )}
        {hasTransfer && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${getTimerBadgeColor(
              patient.timerColor,
            )}`}
          >
            IP: {patient.timerTransfer}
          </span>
        )}
      </div>
    </motion.div>
  );
};

// ── Ward Box ──────────────────────────────────────────────────────────────────

interface WardBoxProps {
  title: string;
  wardKey: string;
  patients: IGDPatient[];
  colorClass: string;
  headerBg: string;
  onCardClick: (p: IGDPatient) => void;
  minHeight?: string;
  showDensity?: boolean;
  showTransitBadge?: boolean;
}

const WardBox: React.FC<WardBoxProps> = ({
  title,
  wardKey,
  patients,
  colorClass,
  headerBg,
  onCardClick,
  minHeight = 'min-h-[160px]',
  showDensity = false,
  showTransitBadge = false,
}) => {
  const density = getDensityStyle(patients.length);

  return (
    <div className={`flex flex-col rounded-xl border-2 ${colorClass} overflow-hidden`}>
      {/* Header */}
      <div className={`${headerBg} px-3 py-2 flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2 min-w-0">
          {showDensity && (
            <span
              title={density.title}
              className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white/30 ${density.dotClass}`}
            />
          )}
          <span className="font-semibold text-sm text-white truncate">{title}</span>
        </div>
        <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ml-2">
          {patients.length}
        </span>
      </div>

      {/* Patient cards */}
      <div className={`flex-1 ${minHeight} p-2 space-y-2 overflow-y-auto`}>
        <AnimatePresence mode="popLayout">
          {patients.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center h-20 text-xs text-gray-400 dark:text-gray-600 italic"
            >
              Tidak ada pasien
            </motion.div>
          ) : (
            patients.map((p) => (
              <PatientCard
                key={`${p.noRM}-${p.nama}`}
                patient={p}
                wardKey={wardKey}
                onClick={() => onCardClick(p)}
                showTransitBadge={showTransitBadge}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ── Detail Dialog ─────────────────────────────────────────────────────────────

interface DetailDialogProps {
  patient: IGDPatient | null;
  onClose: () => void;
}

const DetailDialog: React.FC<DetailDialogProps> = ({ patient, onClose }) => {
  if (!patient) return null;
  const hasDokter = patient.dokter && patient.dokter !== '' && patient.dokter !== '-';

  return (
    <Dialog open={!!patient} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base leading-tight">
            {patient.nama || 'Detail Pasien'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">No. RM</p>
              <p className="text-sm font-mono font-semibold">{patient.noRM || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Status / Lokasi</p>
              <p className="text-sm">{patient.lokasi || '—'}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Dokter (DPJP)</p>
            <p className={`text-sm font-medium ${hasDokter ? '' : 'text-amber-600 italic'}`}>
              {hasDokter ? patient.dokter : 'Menunggu Dokter'}
            </p>
          </div>

          {patient.timerOutpatient && patient.timerOutpatient !== '--' && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Timer Outpatient</p>
              <p className="text-sm font-mono text-blue-600 dark:text-blue-400">
                {patient.timerOutpatient}
              </p>
            </div>
          )}

          {patient.timerTransfer && patient.timerTransfer !== '--' && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Timer Transfer</p>
              <p
                className={`text-sm font-mono font-semibold ${getTimerBadgeColor(
                  patient.timerColor,
                )} inline-block px-2 py-0.5 rounded`}
              >
                {patient.timerTransfer}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AUTO_REFRESH_INTERVAL = 30_000;

export default function IGDWardPage() {
  const [patients, setPatients] = useState<IGDPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<IGDPatient | null>(null);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_INTERVAL / 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchIGDWardData();
      setPatients(data);
      setLastFetch(new Date());
    } catch (err: any) {
      const msg = err?.message ?? 'Gagal mengambil data IGD';
      setError(msg);
      if (!silent) toast.error(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
    const startInterval = () => {
      intervalRef.current = setInterval(() => {
        loadData(true);
        setCountdown(AUTO_REFRESH_INTERVAL / 1000);
      }, AUTO_REFRESH_INTERVAL);
    };
    startInterval();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadData]);

  useEffect(() => {
    setCountdown(AUTO_REFRESH_INTERVAL / 1000);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? AUTO_REFRESH_INTERVAL / 1000 : c - 1));
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [lastFetch]);

  // Filter by search
  const filtered = search.trim()
    ? patients.filter((p) => {
        const q = search.toLowerCase();
        return p.nama.toLowerCase().includes(q) || p.noRM.toLowerCase().includes(q);
      })
    : patients;

  // ── Group into regular wards ───────────────────────────────────────────────
  const wardMap = new Map<WardKey, IGDPatient[]>();
  const allKeys: WardKey[] = [
    'nurse-station',
    'procedure-room',
    'ward-1', 'ward-2', 'ward-3', 'ward-4', 'ward-5',
    'ward-6', 'ward-7', 'ward-8', 'ward-9', 'ward-10',
    'rawat-jalan', 'rawat-inap',
  ];
  allKeys.forEach((k) => wardMap.set(k, []));

  // ── Group into ED Transit columns (fully dynamic) ──────────────────────────
  const transitMap = new Map<string, IGDPatient[]>();

  filtered.forEach((p) => {
    const transitKey = getEdTransitKey(p.lokasi);
    if (transitKey !== null) {
      if (!transitMap.has(transitKey)) transitMap.set(transitKey, []);
      transitMap.get(transitKey)!.push(p);
    } else {
      const key = getPatientWard(p);
      wardMap.get(key)?.push(p);
    }
  });

  // Sort transit patients: longest wait first; sort columns by key order
  const transitColumns = Array.from(transitMap.entries())
    .sort(([a], [b]) => transitKeySortOrder(a) - transitKeySortOrder(b))
    .map(([key, pts]) => ({ key, patients: sortByLongestWait(pts) }));

  const handleManualRefresh = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    loadData(false).then(() => {
      setCountdown(AUTO_REFRESH_INTERVAL / 1000);
      intervalRef.current = setInterval(() => {
        loadData(true);
        setCountdown(AUTO_REFRESH_INTERVAL / 1000);
      }, AUTO_REFRESH_INTERVAL);
    });
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 p-4">

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">IGD Ward</h1>
            {patients.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {patients.length} Pasien
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Visualisasi posisi pasien IGD berdasarkan data TrakCare
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari nama / No. RM..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-7 h-8 text-sm w-52"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{countdown}d</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={loading}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Loading skeleton ───────────────────────────────────────────────────── */}
      {loading && patients.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Mengambil data IGD...</p>
          </div>
        </div>
      )}

      {/* ── Kanban Board ──────────────────────────────────────────────────────── */}
      {(!loading || patients.length > 0) && (
        <div className="space-y-4">

          {/* Row 1: Nurse Station */}
          <WardBox
            title="Nurse Station"
            wardKey="nurse-station"
            patients={wardMap.get('nurse-station') ?? []}
            colorClass="border-slate-300 dark:border-slate-600"
            headerBg="bg-slate-500"
            onCardClick={setSelected}
            minHeight="min-h-[100px]"
          />

          {/* Row 2: Procedure Room */}
          <WardBox
            title="Procedure Room (Ruang Tindakan)"
            wardKey="procedure-room"
            patients={wardMap.get('procedure-room') ?? []}
            colorClass="border-orange-200 dark:border-orange-800"
            headerBg="bg-orange-500"
            onCardClick={setSelected}
            minHeight="min-h-[100px]"
          />

          {/* Row 3: Ward 1–5 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <WardBox
                key={`ward-${n}`}
                title={`Ward ${n}`}
                wardKey={`ward-${n}`}
                patients={wardMap.get(`ward-${n}` as WardKey) ?? []}
                colorClass="border-blue-200 dark:border-blue-800"
                headerBg="bg-blue-500"
                onCardClick={setSelected}
              />
            ))}
          </div>

          {/* Row 4: Ward 6–10 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {([6, 7, 8, 9, 10] as const).map((n) => (
              <WardBox
                key={`ward-${n}`}
                title={`Ward ${n}`}
                wardKey={`ward-${n}`}
                patients={wardMap.get(`ward-${n}` as WardKey) ?? []}
                colorClass="border-blue-200 dark:border-blue-800"
                headerBg="bg-blue-600"
                onCardClick={setSelected}
              />
            ))}
          </div>

          {/* Row 5: Rawat Jalan + Rawat Inap */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <WardBox
              title="Rawat Jalan (Discharge Lounge OP)"
              wardKey="rawat-jalan"
              patients={wardMap.get('rawat-jalan') ?? []}
              colorClass="border-green-200 dark:border-green-800"
              headerBg="bg-green-500"
              onCardClick={setSelected}
              minHeight="min-h-[120px]"
            />
            <WardBox
              title="Rawat Inap (Discharge Lounge IP)"
              wardKey="rawat-inap"
              patients={wardMap.get('rawat-inap') ?? []}
              colorClass="border-purple-200 dark:border-purple-800"
              headerBg="bg-purple-500"
              onCardClick={setSelected}
              minHeight="min-h-[120px]"
            />
          </div>

          {/* ── ED Transit (satu kotak, semua pasien transit di sini) ──────── */}
          <WardBox
            title="ED Transit"
            wardKey="transit"
            patients={sortByLongestWait(
              transitColumns.flatMap((c) => c.patients),
            )}
            colorClass="border-teal-300 dark:border-teal-700"
            headerBg="bg-teal-600"
            onCardClick={setSelected}
            minHeight="min-h-[100px]"
            showDensity
            showTransitBadge
          />

        </div>
      )}

      {/* Last fetch info */}
      {lastFetch && (
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Data terakhir diperbarui: {lastFetch.toLocaleTimeString('id-ID')}
          {' · '}Auto refresh setiap {AUTO_REFRESH_INTERVAL / 1000} detik
        </div>
      )}

      {/* ── Detail Dialog ─────────────────────────────────────────────────────── */}
      <DetailDialog patient={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
