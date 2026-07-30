import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDB } from '../lib/db';
import { fetchFromInpatientUrl, fetchIGDData, getEndpoints } from '../lib/trakcareClient';
import { Users, Clock, CheckCircle2, AlertTriangle, AlertCircle, Share2, Eye, EyeOff, X, Activity, RefreshCw, Info, Bell } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { hashPassword, generateUUID, getCurrentShift } from '../lib/auth';
import { generateHandoverPDF } from '../lib/pdfExport';

interface IGDPatient {
  nama: string;
  noRM: string;
  dokter: string;
  lokasi: string;
  timerOutpatient: string;
  timerTransfer: string;
  timerColor: string;
}

interface DischargePatient {
  noRM: string;
  namaPasien: string;
  ruang: string;
  payor: string;
  status: 'pharmacy' | 'nurse' | 'medical';
}

const DISCHARGE_STATUS_META = {
  pharmacy: { emoji: '🟢', label: 'Farmasi Selesai',      priority: 1, badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  nurse:    { emoji: '🟠', label: 'Keperawatan Selesai',  priority: 2, badgeClass: 'bg-orange-100 text-orange-700 border-orange-300' },
  medical:  { emoji: '🟡', label: 'Rencana Pulang',       priority: 3, badgeClass: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
};


const IGD_TIMER_STYLE: Record<string, string> = {
  merah:  'bg-red-600 text-white',
  hitam:  'bg-gray-900 text-white',
  kuning: 'bg-yellow-300 text-yellow-900',
  hijau:  'bg-emerald-500 text-white',
  '':     'bg-blue-100 text-blue-800',
};

export default function Dashboard() {
  const { user, login } = useAuth();
  const [stats, setStats] = useState({ activePatients: 0, totalPending: 0, pendingTodayCompleted: 0, pendingUnfinished: 0, pendingCritical: 0, operanToday: 0 });
  const [pendingByCategory, setPendingByCategory] = useState<any[]>([]);
  const [operanHistory, setOperanHistory] = useState<any[]>([]);
  const [recentPendings, setRecentPendings] = useState<any[]>([]);
  const [activeJustInfosDash, setActiveJustInfosDash] = useState<any[]>([]);

  // IGD SPRI state
  const [igdPatients, setIgdPatients] = useState<IGDPatient[]>([]);
  const [igdLoading, setIgdLoading] = useState(false);
  const [igdError, setIgdError] = useState<string | null>(null);
  const [igdLastFetch, setIgdLastFetch] = useState<string | null>(null);
  const prevIgdRMs = useRef<Set<string>>(new Set());
  const igdFirstLoad = useRef(true);

  // Notif sound loop state
  const [sirenActive, setSirenActive] = useState(false);
  const [bellActive,  setBellActive]  = useState(false);
  const sirenLoopRef  = useRef(false);
  const bellLoopRef   = useRef(false);
  const sirenCtxRef   = useRef<AudioContext | null>(null);
  const bellCtxRef    = useRef<AudioContext | null>(null);
  const [sirenLabel, setSirenLabel] = useState('');
  const [bellLabel,  setBellLabel]  = useState('');

  // KTM widget state (baca dari localStorage cache monitoring KTM)
  const [ktmDashPatients, setKtmDashPatients] = useState<any[]>([]);
  useEffect(() => {
    function readKtm() {
      try {
        const raw = localStorage.getItem('ktm_monitoring_cache');
        if (!raw) { setKtmDashPatients([]); return; }
        const map: Record<string, any> = JSON.parse(raw);
        const list = Object.values(map).sort((a: any, b: any) => {
          // baru dulu, lalu urut pertamaKaliMuncul terbaru
          if (a.status === 'baru' && b.status !== 'baru') return -1;
          if (b.status === 'baru' && a.status !== 'baru') return 1;
          return new Date(b.pertamaKaliMuncul).getTime() - new Date(a.pertamaKaliMuncul).getTime();
        });
        setKtmDashPatients(list.slice(0, 5));
      } catch { setKtmDashPatients([]); }
    }
    readKtm();
    // refresh tiap 30 detik jika user tetap di dashboard
    const t = setInterval(readKtm, 30_000);
    return () => clearInterval(t);
  }, []);

  // Rencana Pasien Pulang state
  const [dischargePlan, setDischargePlan] = useState<DischargePatient[]>([]);
  const [dischargeLoading, setDischargeLoading] = useState(false);
  const [dischargeError, setDischargeError] = useState<string | null>(null);
  const [dischargeLastFetch, setDischargeLastFetch] = useState<string | null>(null);
  const [dischargeSearch, setDischargeSearch] = useState('');

  // Operan shift modal state
  const [isOperanOpen, setIsOperanOpen] = useState(false);
  const [operanStep, setOperanStep] = useState<1 | 2 | 3>(1);
  const [activePendings, setActivePendings] = useState<any[]>([]);
  const [activeJustInfos, setActiveJustInfos] = useState<any[]>([]);
  const [penerimaNama, setPenerimaNama] = useState('');
  const [penerimaPass, setPenerimaPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [operanLoading, setOperanLoading] = useState(false);
  const [operanResult, setOperanResult] = useState<any>(null);

  const loadDashboard = useCallback(async () => {
    const db = await getDB();
    const today = new Date().toISOString().split('T')[0];
    const [patients, pendings, operans, justInfos] = await Promise.all([
      db.getAll('patients'),
      db.getAll('pendings'),
      db.getAll('operanShifts'),
      db.getAll('justInfos'),
    ]);

    const active = patients.filter(p => p.status === 'aktif');
    const activeRMs = new Set(active.map(p => p.noRM));
    const activePend = pendings.filter(p => p.status !== 'selesai');
    const critical = activePend.filter(p => p.prioritas === 'critical');
    const todayDone = pendings.filter(p => p.status === 'selesai' && new Date(p.updatedAt).toISOString().split('T')[0] === today);
    const operanToday = operans.filter(o => o.tanggal.startsWith(today));

    setStats({
      activePatients: active.length,
      totalPending: activePend.length,
      pendingTodayCompleted: todayDone.length,
      pendingUnfinished: activePend.length,
      pendingCritical: critical.length,
      operanToday: operanToday.length,
    });

    const catMap: Record<string, number> = {};
    activePend.forEach(p => { catMap[p.kategori] = (catMap[p.kategori] || 0) + 1; });
    setPendingByCategory(Object.entries(catMap).map(([name, count]) => ({ name: name.replace('Konfirmasi ', ''), count })));

    const last7 = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();
    setOperanHistory(last7.map(date => ({ date: date.substring(5), count: operans.filter(o => o.tanggal.startsWith(date)).length })));

    const sorted = [...activePend].sort((a, b) => {
      const pw = { critical: 1, urgent: 2, normal: 3 };
      return pw[a.prioritas as keyof typeof pw] - pw[b.prioritas as keyof typeof pw] || b.createdAt - a.createdAt;
    }).slice(0, 5);
    setRecentPendings(sorted);

    // Just Info aktif = just info milik pasien yang masih aktif, diurutkan terbaru
    const patientNameMap = new Map(active.map(p => [p.noRM, p.namaPasien ?? p.noRM]));
    const activeInfos = justInfos
      .filter(j => activeRMs.has(j.noRM))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(j => ({ ...j, namaPasien: patientNameMap.get(j.noRM) ?? j.noRM }));
    setActiveJustInfosDash(activeInfos);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // ── IGD SPRI ──────────────────────────────────────────────────────────────
  const stopSiren = useCallback(() => {
    sirenLoopRef.current = false;
    setSirenActive(false);
    try { sirenCtxRef.current?.close(); } catch { /* ignore */ }
    sirenCtxRef.current = null;
  }, []);

  const startSiren = useCallback((label: string) => {
    if (sirenLoopRef.current) { setSirenLabel(label); return; }
    sirenLoopRef.current = true;
    setSirenActive(true);
    setSirenLabel(label);
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      sirenCtxRef.current = ctx;
      const CYCLE = 0.55;
      const tick = () => {
        if (!sirenLoopRef.current) { try { ctx.close(); } catch { /* ignore */ } return; }
        const t0 = ctx.currentTime;
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(550, t0);
        osc.frequency.linearRampToValueAtTime(1050, t0 + CYCLE * 0.5);
        osc.frequency.linearRampToValueAtTime(550,  t0 + CYCLE);
        gain.gain.setValueAtTime(0,    t0);
        gain.gain.linearRampToValueAtTime(0.25, t0 + 0.05);
        gain.gain.setValueAtTime(0.25, t0 + CYCLE - 0.05);
        gain.gain.linearRampToValueAtTime(0,    t0 + CYCLE);
        osc.start(t0); osc.stop(t0 + CYCLE);
        setTimeout(tick, CYCLE * 1000);
      };
      tick();
    } catch { sirenLoopRef.current = false; setSirenActive(false); }
  }, []);

  // Bell: ding-dong loop for rencana pulang farmasi selesai
  const stopBell = useCallback(() => {
    bellLoopRef.current = false;
    setBellActive(false);
    try { bellCtxRef.current?.close(); } catch { /* ignore */ }
    bellCtxRef.current = null;
  }, []);

  const startBell = useCallback((label: string) => {
    if (bellLoopRef.current) { setBellLabel(label); return; }
    bellLoopRef.current = true;
    setBellActive(true);
    setBellLabel(label);
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      bellCtxRef.current = ctx;
      const DING_DONG = 2.2; // total period (ding + dong + pause)
      const tick = () => {
        if (!bellLoopRef.current) { try { ctx.close(); } catch { /* ignore */ } return; }
        const tones = [
          { freq: 1175, delay: 0,    dur: 1.2 },
          { freq:  880, delay: 0.5,  dur: 1.4 },
        ];
        tones.forEach(({ freq, delay, dur }) => {
          const t = ctx.currentTime + delay;
          [freq, freq * 2.756].forEach((f, i) => {
            const osc = ctx.createOscillator();
            const g   = ctx.createGain();
            osc.connect(g); g.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.value = f;
            const vol = i === 0 ? 0.35 : 0.12;
            const d   = i === 0 ? dur  : dur * 0.6;
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + d);
            osc.start(t); osc.stop(t + d);
          });
        });
        setTimeout(tick, DING_DONG * 1000);
      };
      tick();
    } catch { bellLoopRef.current = false; setBellActive(false); }
  }, []);

  const prevPharmacyRMs = useRef<Set<string>>(new Set());
  const dischargeFirstLoad = useRef(true);

  const fetchDischargePlan = useCallback(async () => {
    setDischargeLoading(true);
    setDischargeError(null);
    try {
      const eps = await getEndpoints();

      const fetchGroup = async (url: string): Promise<{ noRM: string; namaPasien: string; ruang: string; payor: string }[]> => {
        try {
          const patients = await fetchFromInpatientUrl(url);
          return patients.map(p => ({ noRM: p.noRM, namaPasien: p.namaPasien, ruang: p.ward || p.roomName || '', payor: p.payor || '' }));
        } catch { return []; }
      };

      const [medical, nurse, pharmacy] = await Promise.all([
        fetchGroup(eps.medicalDischarge),
        fetchGroup(eps.nurseDischarge),
        fetchGroup(eps.pharmacyDischarge),
      ]);

      // Merge by noRM with highest-priority status
      const map = new Map<string, DischargePatient>();
      const applyStatus = (list: typeof medical, status: DischargePatient['status']) => {
        for (const p of list) {
          const existing = map.get(p.noRM);
          const newPriority = DISCHARGE_STATUS_META[status].priority;
          if (!existing || newPriority < DISCHARGE_STATUS_META[existing.status].priority) {
            map.set(p.noRM, { ...p, status });
          }
        }
      };
      applyStatus(medical,  'medical');
      applyStatus(nurse,    'nurse');
      applyStatus(pharmacy, 'pharmacy');

      // Balik urutan dari API (entry terakhir = paling baru), lalu stable-sort per status
      const sorted = Array.from(map.values()).reverse().sort(
        (a, b) => DISCHARGE_STATUS_META[a.status].priority - DISCHARGE_STATUS_META[b.status].priority
      );
      // Detect newly-added pharmacy patients and play bell
      if (!dischargeFirstLoad.current) {
        const pharmacyPatients = Array.from(map.values()).filter(p => p.status === 'pharmacy');
        const added = pharmacyPatients.filter(p => !prevPharmacyRMs.current.has(p.noRM));
        if (added.length > 0) {
          startBell(added.map(p => p.namaPasien).join(', '));
        }
      }
      dischargeFirstLoad.current = false;
      prevPharmacyRMs.current = new Set(
        Array.from(map.values()).filter(p => p.status === 'pharmacy').map(p => p.noRM)
      );

      setDischargePlan(sorted);
      setDischargeLastFetch(new Date().toLocaleTimeString('id-ID'));
    } catch (e: any) {
      setDischargeError(e.message ?? 'Gagal mengambil data rencana pulang');
    } finally {
      setDischargeLoading(false);
    }
  }, [startBell]);

  const fetchIGD = useCallback(async () => {
    setIgdLoading(true);
    setIgdError(null);
    try {
      const eps = await getEndpoints();
      const patients: IGDPatient[] = await fetchIGDData(eps.igd);

      // Detect newly-added patients and play notification
      if (!igdFirstLoad.current) {
        const added = patients.filter(p => !prevIgdRMs.current.has(p.noRM));
        if (added.length > 0) {
          startSiren(added.map(p => p.nama).join(', '));
        }
      }
      igdFirstLoad.current = false;
      prevIgdRMs.current = new Set(patients.map(p => p.noRM));

      // Urutkan: timer terkecil = pasien paling baru masuk IGD
      const parseTimer = (t: string) => {
        const parts = (t ?? '').split(':').map(Number);
        return (parts[0] || 0) * 60 + (parts[1] || 0);
      };
      const sortedIGD = [...patients].sort(
        (a, b) => parseTimer(a.timerTransfer) - parseTimer(b.timerTransfer)
      );
      setIgdPatients(sortedIGD);
      setIgdLastFetch(new Date().toLocaleTimeString('id-ID'));
    } catch (e: any) {
      setIgdError(e.message ?? 'Gagal mengambil data IGD');
    } finally {
      setIgdLoading(false);
    }
  }, [startSiren]);

  useEffect(() => {
    fetchIGD();
    const id = setInterval(fetchIGD, 60_000);
    return () => clearInterval(id);
  }, [fetchIGD]);

  useEffect(() => {
    fetchDischargePlan();
    const id = setInterval(fetchDischargePlan, 60_000);
    return () => clearInterval(id);
  }, [fetchDischargePlan]);

  // Open operan shift modal — load pending data
  const openOperan = async () => {
    const db = await getDB();
    const pendings = await db.getAll('pendings');
    const justInfos = await db.getAll('justInfos');
    const ap = pendings.filter(p => p.status !== 'selesai').sort((a, b) => {
      const pw = { critical: 1, urgent: 2, normal: 3 };
      return pw[a.prioritas as keyof typeof pw] - pw[b.prioritas as keyof typeof pw];
    });
    setActivePendings(ap);
    setActiveJustInfos(justInfos);
    setPenerimaNama('');
    setPenerimaPass('');
    setShowPass(false);
    setOperanStep(1);
    setOperanResult(null);
    setIsOperanOpen(true);
  };

  const handleOperanLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setOperanLoading(true);
    try {
      const db = await getDB();
      const users = await db.getAll('users');
      const hashed = hashPassword(penerimaPass);
      const penerima = users.find(u => u.username === penerimaNama && u.passwordHash === hashed);

      if (!penerima) { toast.error('Username atau password penerima salah'); setOperanLoading(false); return; }
      if (!penerima.aktif) { toast.error('Akun penerima tidak aktif'); setOperanLoading(false); return; }
      if (penerima.id === user.id) { toast.error('Penerima tidak boleh sama dengan penyerah'); setOperanLoading(false); return; }

      // Build operan record
      const now = Date.now();
      const tanggal = new Date().toISOString();
      const shiftSerah = getCurrentShift();
      const shiftTerima = shiftSerah === 'pagi' ? 'sore' : shiftSerah === 'sore' ? 'malam' : 'pagi';

      const patients = await db.getAll('patients');
      const totalPasien = patients.filter(p => p.status === 'aktif').length;
      const allPendings = await db.getAll('pendings');
      const totalPending = allPendings.filter(p => p.status !== 'selesai').length;
      const totalSelesai = allPendings.filter(p => p.status === 'selesai').length;

      // Generate PDF
      const operanId = generateUUID();
      let pdfBase64 = '';
      try {
        pdfBase64 = await generateHandoverPDF(operanId, user.namaLengkap, penerima.namaLengkap, activePendings, activeJustInfos);
      } catch { /* pdf generation non-critical */ }

      const operan = {
        id: operanId,
        tanggal,
        shiftSerah,
        shiftTerima,
        userSerahId: user.id,
        userSerahNama: user.namaLengkap,
        userTerimaId: penerima.id!,
        userTerimaNama: penerima.namaLengkap,
        jamOperan: new Date().toLocaleTimeString('id-ID'),
        totalPasien,
        totalPending,
        totalPendingSelesai: totalSelesai,
        totalPendingBerlanjut: totalPending,
        ringkasanPending: activePendings.map(p => ({ noRM: p.noRM, namaPasien: p.namaPasien, episodeNo: p.episodeNo, payor: p.payor, isiPending: p.isiPending, prioritas: p.prioritas, status: p.status })),
        pdfBase64,
        createdAt: now,
      };
      await db.put('operanShifts', operan);

      // Activity log
      await db.add('activityLogs', {
        userId: user.id, username: user.namaLengkap, namaUser: user.namaLengkap,
        aktivitas: 'OPERAN_SHIFT', modul: 'operanShifts',
        detail: `Operan dari ${user.namaLengkap} ke ${penerima.namaLengkap}`,
        timestamp: now,
        tanggal: new Date(now).toLocaleDateString('id-ID'),
        jam: new Date(now).toLocaleTimeString('id-ID'),
        role: (user.role ?? 'officer') as 'superuser' | 'officer' | 'system',
        noRM: '', episodeNo: '', namaPasien: '',
        oldValue: '', newValue: '',
        browser: '', device: '', os: '',
        status: 'Success' as const,
        keterangan: '', durasi: 0, errorCode: '', errorMessage: '',
      });

      // Auto-download PDF
      if (pdfBase64) {
        const link = document.createElement('a');
        link.href = pdfBase64;
        link.download = `Operan_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
        link.click();
      }

      setOperanResult({ operan, penerima });
      setOperanStep(3);

      // Switch session to penerima
      login({ id: penerima.id!, username: penerima.username, namaLengkap: penerima.namaLengkap, role: penerima.role });
      toast.success(`Operan berhasil! Sesi beralih ke ${penerima.namaLengkap}`);
      loadDashboard();
    } catch (err) {
      toast.error('Terjadi kesalahan saat proses operan');
    } finally {
      setOperanLoading(false);
    }
  };

  const prioritasBadge = (p: string) =>
    p === 'critical' ? 'bg-red-100 text-red-700 border-red-300' :
    p === 'urgent'   ? 'bg-orange-100 text-orange-700 border-orange-300' :
                       'bg-emerald-100 text-emerald-700 border-emerald-300';

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* ── Notif banner: IGD SPRI siren ── */}
      {sirenActive && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700 px-5 py-3 shadow-md animate-pulse">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">🚨</span>
            <div className="min-w-0">
              <p className="font-bold text-red-700 dark:text-red-400 text-sm">Pasien IGD Sudah SPRI</p>
              <p className="text-xs text-red-600 dark:text-red-300 truncate">{sirenLabel}</p>
            </div>
          </div>
          <button
            onClick={stopSiren}
            className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Stop
          </button>
        </div>
      )}

      {/* ── Notif banner: Farmasi Selesai bell ── */}
      {bellActive && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 px-5 py-3 shadow-md animate-pulse">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">🔔</span>
            <div className="min-w-0">
              <p className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">Rencana Pulang — Farmasi Selesai</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-300 truncate">{bellLabel}</p>
            </div>
          </div>
          <button
            onClick={stopBell}
            className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Stop
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Ringkasan aktivitas operan dan status pasien saat ini.</p>
        </div>
        <Button size="lg" className="gap-2 font-bold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openOperan} data-testid="button-mulai-operan">
          <Share2 className="w-5 h-5" /> Mulai Operan Shift
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Pasien Aktif" value={stats.activePatients} icon={Users} color="text-blue-500" bg="bg-blue-50 dark:bg-blue-950/30" />
        <StatCard title="Total Pending" value={stats.totalPending} icon={Clock} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/30" />
        <StatCard title="Selesai Hari Ini" value={stats.pendingTodayCompleted} icon={CheckCircle2} color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-950/30" />
        <StatCard title="Belum Selesai" value={stats.pendingUnfinished} icon={AlertTriangle} color="text-orange-500" bg="bg-orange-50 dark:bg-orange-950/30" />
        <StatCard title="Pending Critical" value={stats.pendingCritical} icon={AlertCircle} color="text-red-500" bg="bg-red-50 dark:bg-red-950/30" />
        <StatCard title="Operan Hari Ini" value={stats.operanToday} icon={Share2} color="text-primary" bg="bg-primary/10" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* KTM Widget */}
        <Card className="col-span-1 lg:col-span-2 shadow-sm flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              Pasien Rawat Inap KTM
              {ktmDashPatients.length > 0 && (
                <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {ktmDashPatients.filter((p: any) => p.status === 'baru').length > 0
                    ? `${ktmDashPatients.filter((p: any) => p.status === 'baru').length} baru`
                    : ktmDashPatients.length}
                </span>
              )}
              <a
                href="#/monitoring-ktm"
                className="ml-auto text-xs text-primary hover:underline font-normal"
              >
                Lihat semua →
              </a>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {ktmDashPatients.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Bell className="w-8 h-8 opacity-20" />
                <p className="text-sm">Tidak ada data KTM</p>
                <p className="text-xs opacity-70">Buka Monitoring KTM untuk memulai pemantauan</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ktmDashPatients.map((p: any) => (
                  <div
                    key={p.noRM}
                    className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-colors ${
                      p.status === 'baru'
                        ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                        : 'bg-muted/40 border-border'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{p.namaPasien}</span>
                        {p.status === 'baru' && (
                          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white">BARU</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">No. RM: {p.noRM}</span>
                        {(p.ruangan || p.ward) && (
                          <span className="text-xs text-muted-foreground">· {p.ruangan || p.ward}</span>
                        )}
                        {p.kelas && (
                          <span className="text-xs text-muted-foreground">· {p.kelas}</span>
                        )}
                      </div>
                      {p.dpjp && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">DPJP: {p.dpjp}</p>
                      )}
                    </div>
                    {p.tanggalJamKTM && (
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-muted-foreground whitespace-nowrap">{p.tanggalJamKTM}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* IGD SPRI Panel */}
        <Card className="shadow-sm flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-500" />
              Pasien IGD Sudah SPRI
              <span className={`ml-1 text-sm font-bold px-2 py-0.5 rounded-full ${igdPatients.length > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                {igdPatients.length}
              </span>
              <button
                onClick={fetchIGD}
                disabled={igdLoading}
                className="ml-auto p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${igdLoading ? 'animate-spin' : ''}`} />
              </button>
            </CardTitle>
            {igdLastFetch && (
              <p className="text-[10px] text-muted-foreground">Update: {igdLastFetch} · auto-refresh 60 dtk</p>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden pt-0">
            {igdError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3 mb-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {igdError}
              </div>
            )}
            {igdLoading && igdPatients.length === 0 && (
              <div className="flex items-center justify-center h-[180px]">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!igdLoading && igdPatients.length === 0 && !igdError && (
              <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <p className="text-sm font-medium">Tidak ada pasien IGD ber-SPRI</p>
              </div>
            )}
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {igdPatients.map(p => {
                const timerStyle = IGD_TIMER_STYLE[p.timerColor] ?? IGD_TIMER_STYLE[''];
                return (
                  <div key={p.noRM} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                    <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md tabular-nums ${timerStyle}`}>
                      {p.timerTransfer}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate leading-tight">{p.nama}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{p.noRM}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{p.lokasi}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rencana Pasien Pulang + Pending Mendesak */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rencana Pasien Pulang */}
        <Card className="col-span-1 lg:col-span-2 shadow-sm flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Rencana Pasien Pulang
              <span className={`ml-1 text-sm font-bold px-2 py-0.5 rounded-full ${dischargePlan.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                {dischargePlan.length}
              </span>
              <button
                onClick={fetchDischargePlan}
                disabled={dischargeLoading}
                className="ml-auto p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${dischargeLoading ? 'animate-spin' : ''}`} />
              </button>
            </CardTitle>
            {dischargeLastFetch && (
              <p className="text-[10px] text-muted-foreground">Update: {dischargeLastFetch} · auto-refresh 60 dtk</p>
            )}
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-3 pt-0">
            {/* Search */}
            <Input
              placeholder="Cari No. RM, Nama, atau Ruang..."
              value={dischargeSearch}
              onChange={e => setDischargeSearch(e.target.value)}
              className="h-8 text-sm"
            />

            {/* Error */}
            {dischargeError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {dischargeError}
              </div>
            )}

            {/* Loading */}
            {dischargeLoading && dischargePlan.length === 0 && (
              <div className="flex items-center justify-center h-[200px]">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* List */}
            {(() => {
              const q = dischargeSearch.toLowerCase();
              const filtered = dischargePlan.filter(p =>
                !q ||
                p.noRM.toLowerCase().includes(q) ||
                p.namaPasien.toLowerCase().includes(q) ||
                p.ruang.toLowerCase().includes(q) ||
                p.payor.toLowerCase().includes(q)
              );

              if (!dischargeLoading && filtered.length === 0 && !dischargeError) {
                return (
                  <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground gap-2">
                    <CheckCircle2 className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-sm">
                      {dischargeSearch ? 'Tidak ada hasil pencarian.' : 'Belum ada rencana pasien pulang.'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {filtered.map((p, i) => {
                    const meta = DISCHARGE_STATUS_META[p.status];
                    return (
                      <React.Fragment key={p.noRM}>
                        <div className="flex items-start gap-3 py-2">
                          <span className="text-xl leading-none mt-0.5 shrink-0">{meta.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{p.namaPasien}</p>
                            <p className="text-xs text-muted-foreground">No. RM : {p.noRM}</p>
                            <p className="text-xs text-muted-foreground">Ruang : {p.ruang}</p>
                            {p.payor && (
                              <p className="text-xs text-muted-foreground">Penjamin : <span className="font-medium text-foreground">{p.payor}</span></p>
                            )}
                            <span className={`inline-flex items-center mt-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.badgeClass}`}>
                              {meta.label}
                            </span>
                          </div>
                        </div>
                        {i < filtered.length - 1 && <hr className="border-border" />}
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Just Info Aktif */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                Just Info Aktif
              </span>
              {activeJustInfosDash.length > 0 && (
                <span className="text-xs font-normal text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full">
                  {activeJustInfosDash.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeJustInfosDash.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground text-sm">Tidak ada Just Info aktif</p>
            ) : (
              <div className="space-y-3">
                {activeJustInfosDash.map(j => (
                  <div key={j.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                    <div className="mt-0.5 p-1 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
                      <Info className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{j.namaPasien}</p>
                      <p className="text-xs text-muted-foreground">
                        No. RM: {j.noRM}
                        {j.shift ? ` · Shift ${j.shift}` : ''}
                        {j.userName ? ` · ${j.userName}` : ''}
                      </p>
                      <p className="text-xs mt-0.5 line-clamp-3 leading-snug">{j.isi}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap pt-0.5 shrink-0">
                      {new Date(j.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== DIALOG OPERAN SHIFT ===== */}
      <Dialog open={isOperanOpen} onOpenChange={v => { if (!v && operanStep !== 3) setIsOperanOpen(false); if (operanStep === 3) setIsOperanOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">

          {/* STEP 1: Ringkasan + Konfirmasi Mulai */}
          {operanStep === 1 && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-600" /> Mulai Operan Shift
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Penyerah Operan</p>
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">{user?.namaLengkap} ({user?.username})</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500">Shift: {getCurrentShift().toUpperCase()} | {new Date().toLocaleString('id-ID')}</p>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-amber-600">{activePendings.filter(p => p.status === 'pending').length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Menunggu</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-blue-600">{activePendings.filter(p => p.status === 'diproses').length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Diproses</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-red-600">{activePendings.filter(p => p.prioritas === 'critical').length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Critical</p>
                  </div>
                </div>

                {activePendings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Pending yang akan dioperkan ({activePendings.length}):</p>
                    <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                      {activePendings.map(p => (
                        <div key={p.id} className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border ${prioritasBadge(p.prioritas)}`}>
                            {p.prioritas.toUpperCase().slice(0,3)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{p.namaPasien} <span className="font-normal text-muted-foreground text-xs">({p.noRM})</span></p>
                            <p className="text-xs text-muted-foreground">{p.ruangan} | {p.kategori}</p>
                            <p className="text-xs mt-0.5 line-clamp-2">{p.isiPending}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activePendings.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground bg-muted/30 rounded-lg">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    <p className="text-sm font-medium">Tidak ada pending aktif</p>
                    <p className="text-xs">Semua tugas sudah diselesaikan</p>
                  </div>
                )}

                {activeJustInfos.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">Just Info ({activeJustInfos.length})</p>
                    {activeJustInfos.slice(0, 3).map(j => (
                      <p key={j.id} className="text-xs text-blue-600 dark:text-blue-500">• {j.isi}</p>
                    ))}
                    {activeJustInfos.length > 3 && <p className="text-xs text-blue-500 mt-1">...dan {activeJustInfos.length - 3} lainnya</p>}
                  </div>
                )}
              </div>
              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setIsOperanOpen(false)}>Batal</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" onClick={() => setOperanStep(2)} data-testid="button-lanjut-operan">
                  Lanjutkan Operan
                </Button>
              </DialogFooter>
            </>
          )}

          {/* STEP 2: Login penerima */}
          {operanStep === 2 && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Login Petugas Penerima</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleOperanLogin} className="space-y-5 pt-2">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">Petugas penerima wajib login untuk mengkonfirmasi operan</p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs mt-1">Penerima operan dari shift berikutnya harus memasukkan kredensialnya</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Username Penerima <span className="text-red-500">*</span></label>
                  <Input
                    value={penerimaNama}
                    onChange={e => setPenerimaNama(e.target.value)}
                    placeholder="Masukkan username penerima"
                    required
                    autoFocus
                    data-testid="input-penerima-username"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Password Penerima <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Input
                      type={showPass ? 'text' : 'password'}
                      value={penerimaPass}
                      onChange={e => setPenerimaPass(e.target.value)}
                      placeholder="Masukkan password"
                      required
                      className="pr-10"
                      data-testid="input-penerima-password"
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOperanStep(1)}>Kembali</Button>
                  <Button type="submit" disabled={operanLoading || !penerimaNama || !penerimaPass} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]" data-testid="button-konfirmasi-operan">
                    {operanLoading ? 'Memverifikasi...' : 'Konfirmasi Operan'}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}

          {/* STEP 3: Sukses */}
          {operanStep === 3 && operanResult && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" /> Operan Berhasil!
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Penyerah</p>
                      <p className="font-semibold">{operanResult.operan.userSerahNama}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Penerima</p>
                      <p className="font-semibold">{operanResult.operan.userTerimaNama}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Shift Serah</p>
                      <p className="font-semibold capitalize">{operanResult.operan.shiftSerah}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Jam Operan</p>
                      <p className="font-semibold">{operanResult.operan.jamOperan}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Total Pasien</p>
                      <p className="font-semibold">{operanResult.operan.totalPasien}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Pending Berlanjut</p>
                      <p className="font-semibold">{operanResult.operan.totalPendingBerlanjut}</p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {operanResult.operan.pdfBase64 ? 'PDF laporan operan telah diunduh otomatis.' : 'Laporan operan tersimpan dalam riwayat.'}
                </p>
              </div>
              <DialogFooter>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setIsOperanOpen(false)} data-testid="button-tutup-operan">
                  Tutup & Mulai Shift Baru
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex flex-col justify-between h-full min-h-[110px]">
        <div className="flex justify-between items-start mb-3">
          <p className="text-xs font-medium text-muted-foreground leading-tight">{title}</p>
          <div className={`p-1.5 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
        </div>
        <h3 className="text-3xl font-bold tracking-tight">{value}</h3>
      </CardContent>
    </Card>
  );
}
