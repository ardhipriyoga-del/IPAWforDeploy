import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, RefreshCw, Search, Filter, Eye, Clock, CheckCircle2, WifiOff, History, X, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getApiBaseUrl, hasTrakCareProxy } from '@/lib/apiConfig';
import { parseKTMPatients } from '@/lib/ktmParser';
const getApiBase = () => getApiBaseUrl();

// Status jaringan dari perspektif browser pengguna
// 'unknown'  — belum dicek
// 'internal' — appsprn.emc.id bisa dijangkau (jaringan RS)
// 'public'   — appsprn.emc.id tidak bisa dijangkau (internet publik)
// 'cors'     — server bisa dijangkau tapi CORS block (jaringan RS, perlu config IT)
type NetworkStatus = 'unknown' | 'internal' | 'public' | 'cors';

/**
 * Cek apakah appsprn.emc.id bisa dijangkau dari browser ini.
 * Menggunakan mode: 'no-cors' agar tidak membutuhkan header CORS dari server.
 * - Jika fetch berhasil (response.type === 'opaque') → server reachable → jaringan RS
 * - Jika fetch lempar TypeError (network error) → tidak reachable → internet publik
 */
async function checkInternalNetwork(url: string): Promise<'internal' | 'public'> {
  try {
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    // no-cors fetch sukses → opaque response → server bisa dijangkau
    return 'internal';
  } catch {
    // TypeError / AbortError → server tidak bisa dijangkau dari jaringan ini
    return 'public';
  }
}

const KTM_DIRECT_URL = 'https://appsprn.emc.id/trakcare/dashboard/list/trakcareANLT/type/ktm/hospital/4';

// ── Types ─────────────────────────────────────────────────────────────────────

interface KTMPatient {
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  ruangan: string;
  kelas: string;
  dpjp: string;
  tanggalKTM: string;
  jamKTM: string;
  tanggalJamKTM: string;
  ward: string;
}

interface MonitoredKTM extends KTMPatient {
  status: 'baru' | 'sudah-dilihat';
  pertamaKaliMuncul: string;
  terakhirTerlihat: string;
  isNew: boolean;
}

interface RiwayatKTM extends KTMPatient {
  pertamaKaliMuncul: string;
  terakhirTerlihat: string;
  tanggalHapus: string;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'ktm_monitoring_cache';
const RIWAYAT_KEY = 'ktm_riwayat_cache';

function loadCache(): Record<string, MonitoredKTM> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCache(data: Record<string, MonitoredKTM>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { }
}

function loadRiwayat(): RiwayatKTM[] {
  try {
    const raw = localStorage.getItem(RIWAYAT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRiwayat(data: RiwayatKTM[]) {
  try { localStorage.setItem(RIWAYAT_KEY, JSON.stringify(data.slice(-200))); } catch { }
}

// ── Sound helper ──────────────────────────────────────────────────────────────

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const times = [0, 0.25, 0.5];
    times.forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
  } catch { }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MonitoringKtmPage() {
  const [patients, setPatients] = useState<Record<string, MonitoredKTM>>(() => loadCache());
  const [riwayat, setRiwayat] = useState<RiwayatKTM[]>(() => loadRiwayat());
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRuangan, setFilterRuangan] = useState('semua');
  const [newCount, setNewCount] = useState(0);
  const [popupPatients, setPopupPatients] = useState<MonitoredKTM[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [activeTab, setActiveTab] = useState<'aktif' | 'riwayat'>('aktif');
  // Status jaringan: unknown saat pertama kali, lalu internal/public/cors
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('unknown');

  const soundPlayingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch KTM data ──────────────────────────────────────────────────────────

  const fetchKTM = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      let incoming: KTMPatient[];

      if (hasTrakCareProxy()) {
        // Ada proxy server internal/eksternal yang bisa menjangkau jaringan RS
        const base = getApiBase();
        const res = await fetch(`${base}/api/trakcare/ktm?ward=`, {
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          setIsOffline(true);
          return;
        }
        const data: { patients: KTMPatient[]; fetchedAt: string } = await res.json();
        incoming = data.patients;
        // Proxy tersedia dan berhasil → pastikan status jaringan bersih
        setNetworkStatus('internal');
      } else {
        // ── Mode direct browser fetch (Netlify tanpa proxy) ──────────────────
        // Langkah 1: Cek apakah appsprn.emc.id bisa dijangkau dari browser ini.
        //   Jika tidak bisa → pengguna di internet publik → hentikan & tampilkan pesan.
        //   Jika bisa → pengguna di jaringan RS → lanjut fetch data.
        const reach = await checkInternalNetwork(KTM_DIRECT_URL);
        if (reach === 'public') {
          setNetworkStatus('public');
          setIsOffline(false); // bukan "offline", melainkan "tidak tersedia"
          if (isManual) setIsRefreshing(false);
          return;
        }

        // Langkah 2: Server bisa dijangkau. Coba fetch data dengan CORS normal.
        // credentials: 'omit' wajib agar header Access-Control-Allow-Origin: * bisa match.
        try {
          const res = await fetch(KTM_DIRECT_URL, {
            signal: AbortSignal.timeout(20_000),
            credentials: 'omit',
            cache: 'no-store',
          });
          if (!res.ok) {
            setIsOffline(true);
            return;
          }
          const html = await res.text();
          incoming = parseKTMPatients(html);
          setNetworkStatus('internal');
        } catch (corsErr: any) {
          // Fetch gagal meski server reachable → kemungkinan besar CORS block
          // (server bisa dijangkau tapi tidak kirim Access-Control-Allow-Origin)
          setNetworkStatus('cors');
          setIsOffline(true);
          return;
        }
      }

      setIsOffline(false);
      setLastUpdate(new Date().toLocaleString('id-ID'));

      const incomingMap: Record<string, KTMPatient> = {};
      incoming.forEach(p => { incomingMap[p.noRM] = p; });

      setPatients(prev => {
        const now = new Date().toISOString();
        const updated: Record<string, MonitoredKTM> = {};
        const newlyFound: MonitoredKTM[] = [];

        // Add / update existing
        incoming.forEach(p => {
          const existing = prev[p.noRM];
          if (!existing) {
            // Brand new patient
            const newEntry: MonitoredKTM = {
              ...p,
              status: 'baru',
              pertamaKaliMuncul: now,
              terakhirTerlihat: now,
              isNew: true,
            };
            updated[p.noRM] = newEntry;
            newlyFound.push(newEntry);
          } else {
            updated[p.noRM] = {
              ...existing,
              ...p,
              terakhirTerlihat: now,
              isNew: false,
            };
          }
        });

        // Move removed patients to riwayat (don't remove from cache on error)
        const removed: RiwayatKTM[] = [];
        Object.values(prev).forEach(p => {
          if (!incomingMap[p.noRM]) {
            removed.push({
              ...p,
              pertamaKaliMuncul: p.pertamaKaliMuncul,
              terakhirTerlihat: p.terakhirTerlihat,
              tanggalHapus: now,
            });
          }
        });

        if (removed.length > 0) {
          setRiwayat(r => {
            const updated = [...r, ...removed];
            saveRiwayat(updated);
            return updated;
          });
        }

        // Notify new patients
        if (newlyFound.length > 0) {
          playNotificationSound();
          setPopupPatients(newlyFound);
          setShowPopup(true);
          setNewCount(c => c + newlyFound.length);
          newlyFound.forEach(p => {
            toast.warning(`KTM Baru: ${p.namaPasien}`, {
              description: `No. RM: ${p.noRM} · ${p.ruangan}`,
              duration: 8000,
            });
          });
        }

        saveCache(updated);
        return updated;
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') setIsOffline(true);
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  // ── Auto-refresh ────────────────────────────────────────────────────────────
  // Jangan poll jika sudah dipastikan pengguna di internet publik (tidak akan berhasil)

  useEffect(() => {
    fetchKTM();
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        // Jika sudah terkonfirmasi publik, tidak perlu poll ulang.
        // Cukup cek ulang jaringan setiap 60 detik (misalnya user berpindah ke WiFi RS).
        fetchKTM();
      }, 45_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchKTM]);

  // Reset new-count when popup is closed
  useEffect(() => {
    if (!showPopup) {
      soundPlayingRef.current = false;
    }
  }, [showPopup]);

  // ── Mark as seen ────────────────────────────────────────────────────────────

  const markSeen = (noRM: string) => {
    setPatients(prev => {
      const updated: Record<string, MonitoredKTM> = {
        ...prev,
        [noRM]: { ...prev[noRM], status: 'sudah-dilihat' as const, isNew: false },
      };
      saveCache(updated);
      return updated;
    });
    setNewCount(c => Math.max(0, c - 1));
  };

  const markAllSeen = () => {
    setPatients(prev => {
      const updated: Record<string, MonitoredKTM> = {};
      Object.entries(prev).forEach(([k, v]) => {
        updated[k] = { ...v, status: 'sudah-dilihat', isNew: false };
      });
      saveCache(updated);
      return updated;
    });
    setNewCount(0);
    setShowPopup(false);
  };

  // ── Filter / search ─────────────────────────────────────────────────────────

  const allPatients = Object.values(patients);

  const ruanganList = ['semua', ...Array.from(new Set(allPatients.map(p => p.ruangan || p.ward).filter(Boolean)))];

  const filtered = allPatients.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || p.namaPasien.toLowerCase().includes(q) || p.noRM.includes(q);
    const ruanganVal = p.ruangan || p.ward;
    const matchRuangan = filterRuangan === 'semua' || ruanganVal === filterRuangan;
    return matchSearch && matchRuangan;
  }).sort((a, b) => {
    // New first, then by time
    if (a.status === 'baru' && b.status !== 'baru') return -1;
    if (b.status === 'baru' && a.status !== 'baru') return 1;
    return new Date(b.pertamaKaliMuncul).getTime() - new Date(a.pertamaKaliMuncul).getTime();
  });

  const newPatients = allPatients.filter(p => p.status === 'baru');

  // ── Render ──────────────────────────────────────────────────────────────────

  // ── Layar khusus: pengguna di internet publik ──────────────────────────────
  if (networkStatus === 'public') {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="max-w-sm w-full">
          <div className="flex justify-center mb-5">
            <div className="bg-muted rounded-full p-5">
              <ShieldOff className="w-10 h-10 text-muted-foreground" />
            </div>
          </div>
          <h2 className="text-lg font-semibold mb-2">Fitur Tidak Tersedia</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Monitoring KTM hanya dapat digunakan saat perangkat terhubung ke
            <span className="font-medium text-foreground"> jaringan internal RS EMC</span>.
          </p>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setNetworkStatus('unknown');
              fetchKTM(true);
            }}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-7 h-7 text-primary" />
            {newCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-0.5">
                {newCount > 99 ? '99+' : newCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold">Monitoring KTM</h1>
            <p className="text-xs text-muted-foreground">Konfirmasi Tindakan Medis · RS EMC Pekayon</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status indicator */}
          {networkStatus === 'unknown' && !lastUpdate ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Memeriksa jaringan...</span>
            </div>
          ) : isOffline ? (
            <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 px-2.5 py-1 rounded-full">
              <WifiOff className="w-3.5 h-3.5" />
              <span>TrakCare Offline</span>
            </div>
          ) : lastUpdate ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Update: {lastUpdate}</span>
            </div>
          ) : null}

          {/* Auto refresh toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-xs cursor-pointer">
              Auto Refresh {autoRefresh ? 'ON' : 'OFF'}
            </Label>
          </div>

          {/* Manual refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchKTM(true)}
            disabled={isRefreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Riwayat toggle */}
          <Button
            variant={activeTab === 'riwayat' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(activeTab === 'aktif' ? 'riwayat' : 'aktif')}
            className="gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            Riwayat {riwayat.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{riwayat.length}</Badge>}
          </Button>
        </div>
      </div>

      {/* Warning: CORS block (di jaringan RS tapi server belum konfigurasi CORS) */}
      {networkStatus === 'cors' && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 py-4">
            <ShieldOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-amber-700 dark:text-amber-400">CORS Tidak Dikonfigurasi di TrakCare</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Perangkat terdeteksi berada di jaringan RS EMC, namun browser memblokir akses karena server TrakCare
                tidak mengirim header <code className="bg-muted px-1 rounded text-[11px]">Access-Control-Allow-Origin</code>.
                Hubungi IT RS untuk menambahkan header CORS pada server <code className="bg-muted px-1 rounded text-[11px]">appsprn.emc.id</code>,
                atau deploy API Server ke server internal RS dan atur <code className="bg-muted px-1 rounded text-[11px]">VITE_API_BASE_URL</code> di Netlify.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Offline Warning: di jaringan RS tapi TrakCare tidak merespons */}
      {isOffline && networkStatus !== 'cors' && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4">
            <WifiOff className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-destructive">Server TrakCare Tidak Merespons</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tidak dapat mengambil data dari TrakCare. Pastikan server TrakCare aktif dan dapat diakses dari jaringan RS.
                Monitoring akan otomatis mencoba kembali.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Total Aktif</p>
            <p className="text-2xl font-bold text-primary">{allPatients.length}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">KTM Baru</p>
            <p className="text-2xl font-bold text-destructive">{newPatients.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Sudah Dilihat</p>
            <p className="text-2xl font-bold">{allPatients.filter(p => p.status === 'sudah-dilihat').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Riwayat</p>
            <p className="text-2xl font-bold">{riwayat.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      {activeTab === 'aktif' && (
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau No. RM..."
              className="pl-8"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filterRuangan} onValueChange={setFilterRuangan}>
            <SelectTrigger className="w-44">
              <Filter className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ruanganList.map(r => (
                <SelectItem key={r} value={r}>{r === 'semua' ? 'Semua Ruangan' : r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {newPatients.length > 0 && (
            <Button variant="outline" size="sm" onClick={markAllSeen} className="gap-1.5 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Tandai Semua Dilihat
            </Button>
          )}
        </div>
      )}

      {/* Patient Cards — Aktif */}
      {activeTab === 'aktif' && (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Bell className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-muted-foreground">
                {allPatients.length === 0 ? 'Tidak ada KTM aktif saat ini' : 'Tidak ada hasil yang cocok'}
              </p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {allPatients.length === 0 ? 'Monitoring berjalan. Data akan muncul otomatis saat ada KTM baru.' : 'Coba ubah filter pencarian.'}
              </p>
            </div>
          ) : (
            filtered.map(p => (
              <KTMCard key={p.noRM} patient={p} onMarkSeen={() => markSeen(p.noRM)} />
            ))
          )}
        </div>
      )}

      {/* Riwayat Tab */}
      {activeTab === 'riwayat' && (
        <div className="space-y-2">
          {riwayat.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <History className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-muted-foreground">Belum ada riwayat KTM</p>
            </div>
          ) : (
            [...riwayat].reverse().map((p, i) => (
              <RiwayatCard key={`${p.noRM}-${i}`} patient={p} />
            ))
          )}
        </div>
      )}

      {/* Popup Notification */}
      <Dialog open={showPopup} onOpenChange={setShowPopup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Bell className="w-5 h-5 animate-bounce" />
              KTM Baru Ditemukan!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {popupPatients.map(p => (
              <div key={p.noRM} className="border rounded-lg p-3 bg-destructive/5 border-destructive/20">
                <p className="font-semibold">{p.namaPasien || '(Nama tidak tersedia)'}</p>
                <p className="text-sm text-muted-foreground">No. RM: {p.noRM}</p>
                <p className="text-sm text-muted-foreground">{p.ruangan || p.ward} · {p.kelas}</p>
                <p className="text-sm text-muted-foreground">DPJP: {p.dpjp}</p>
                {p.tanggalJamKTM && <p className="text-xs text-muted-foreground mt-1">KTM: {p.tanggalJamKTM}</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="default" className="flex-1" onClick={markAllSeen}>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Tandai Sudah Dilihat
            </Button>
            <Button variant="outline" onClick={() => setShowPopup(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Patient Card ──────────────────────────────────────────────────────────────

function KTMCard({ patient: p, onMarkSeen }: { patient: MonitoredKTM; onMarkSeen: () => void }) {
  const isNew = p.status === 'baru';
  return (
    <Card className={`transition-all ${isNew ? 'border-destructive/50 bg-destructive/5 shadow-sm' : 'border-border'}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{p.namaPasien || '(Nama tidak tersedia)'}</span>
              <Badge variant={isNew ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                {isNew ? '🔴 Baru' : '✓ Sudah Dilihat'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
              <span>No. RM: <span className="font-mono text-foreground">{p.noRM}</span></span>
              {p.episodeNo && <span>Episode: {p.episodeNo}</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
              <span>Ruangan: <span className="text-foreground">{p.ruangan || p.ward || '-'}</span></span>
              <span>Kelas: <span className="text-foreground">{p.kelas || '-'}</span></span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
              <span>DPJP: <span className="text-foreground">{p.dpjp || '-'}</span></span>
            </div>
            {p.tanggalJamKTM && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                KTM: {p.tanggalJamKTM}
              </div>
            )}
            <div className="text-xs text-muted-foreground/60 mt-0.5">
              Pertama muncul: {new Date(p.pertamaKaliMuncul).toLocaleString('id-ID')}
            </div>
          </div>
          <div className="shrink-0">
            {isNew && (
              <Button size="sm" variant="outline" onClick={onMarkSeen} className="gap-1.5 text-xs">
                <Eye className="w-3.5 h-3.5" />
                Tandai Dilihat
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Riwayat Card ──────────────────────────────────────────────────────────────

function RiwayatCard({ patient: p }: { patient: RiwayatKTM }) {
  return (
    <Card className="border-border/60 opacity-80">
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{p.namaPasien || '(Nama tidak tersedia)'}</span>
              <Badge variant="outline" className="text-[10px]">Riwayat</Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              No. RM: <span className="font-mono text-foreground">{p.noRM}</span>
              {p.ruangan && <span className="ml-3">{p.ruangan} · {p.kelas}</span>}
            </div>
            <div className="text-sm text-muted-foreground">DPJP: {p.dpjp || '-'}</div>
            {p.tanggalJamKTM && <div className="text-xs text-muted-foreground">KTM: {p.tanggalJamKTM}</div>}
            <div className="text-xs text-muted-foreground/60">
              Muncul: {new Date(p.pertamaKaliMuncul).toLocaleString('id-ID')} ·
              Dihapus: {new Date(p.tanggalHapus).toLocaleString('id-ID')}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
