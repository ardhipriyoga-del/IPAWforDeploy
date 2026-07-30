import React, { useEffect, useState } from 'react';
import { getDB } from '../lib/db';
import { useAppContext } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Code2, Database, Users, BedDouble, Clock, History, Wifi, WifiOff,
  CheckCircle2, Zap, Layout, MousePointer, FileSpreadsheet, FileText,
  Smartphone, ShieldCheck, HeartPulse, LayoutGrid, Sparkles
} from 'lucide-react';

const VERSION = '1.0.0';
const DB_VERSION = '1';
const APP_NAME = 'IP Admission Workspace';
const TAGLINE = 'Integrated Inpatient Admission & Operational Workspace';

const MODULES = [
  'Dashboard',
  'Admission Workspace',
  'Operan Pasien',
  'Estimasi Biaya Rawat Inap',
  'Master Tarif',
  'Import Data Excel',
  'Export PDF',
  'Pengaturan',
  'Riwayat Aktivitas',
];

const FEATURES: { icon: React.ReactNode; label: string }[] = [
  { icon: <WifiOff className="w-4 h-4" />,         label: 'Offline First' },
  { icon: <Zap className="w-4 h-4" />,              label: 'Cepat dan Ringan' },
  { icon: <Layout className="w-4 h-4" />,           label: 'Interface Modern' },
  { icon: <MousePointer className="w-4 h-4" />,     label: 'Mudah Digunakan' },
  { icon: <FileSpreadsheet className="w-4 h-4" />,  label: 'Import Excel' },
  { icon: <FileText className="w-4 h-4" />,         label: 'Export PDF' },
  { icon: <Smartphone className="w-4 h-4" />,       label: 'Responsive' },
  { icon: <ShieldCheck className="w-4 h-4" />,      label: 'Aman untuk penggunaan internal rumah sakit' },
];

export default function AboutPage() {
  const { rsLogo } = useAppContext();
  const [stats, setStats] = useState({
    users: 0,
    activePasien: 0,
    activePending: 0,
    totalOperan: 0,
    lastBackup: '-',
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDB();
        const [users, patients, pendings, operans, settings] = await Promise.all([
          db.getAll('users'),
          db.getAll('patients'),
          db.getAll('pendings'),
          db.getAll('operanShifts'),
          db.getAll('settings'),
        ]);
        const lastBackupVal = settings.find(s => s.key === 'lastBackup')?.value;
        setStats({
          users: users.length,
          activePasien: patients.filter(p => p.status === 'aktif').length,
          activePending: pendings.filter(p => p.status === 'pending' || p.status === 'diproses').length,
          totalOperan: operans.length,
          lastBackup: lastBackupVal
            ? new Date(lastBackupVal).toLocaleString('id-ID')
            : 'Belum pernah',
        });
      } catch (_) { /* db not ready yet */ }
    })();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* ── Hero ── */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="pt-10 pb-10 flex flex-col items-center text-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-b from-[hsl(186,73%,50%)] to-[hsl(186,73%,37%)] flex items-center justify-center shadow-sm">
            {rsLogo ? (
              <img src={rsLogo} alt="Logo" className="w-12 h-12 object-contain" />
            ) : (
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-11 h-11">
                <rect x="6" y="24" width="52" height="16" rx="4" fill="white" fillOpacity="0.9"/>
                <rect x="24" y="6" width="16" height="52" rx="4" fill="white" fillOpacity="0.9"/>
              </svg>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{APP_NAME}</h1>
            <p className="text-sm font-medium text-muted-foreground mt-1">Version {VERSION}</p>
            <p className="text-xs text-primary/70 font-semibold mt-1 tracking-wide uppercase">{TAGLINE}</p>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {APP_NAME} adalah aplikasi operasional rumah sakit yang dirancang untuk membantu petugas
            Admission Rawat Inap dalam mengelola seluruh proses kerja secara cepat, akurat, dan terintegrasi.
          </p>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed -mt-2">
            Aplikasi ini menggabungkan berbagai modul operasional dalam satu workspace, sehingga pengguna
            tidak perlu berpindah aplikasi untuk melakukan pekerjaan sehari-hari. Dirancang dengan konsep
            <strong className="text-foreground"> Offline First</strong> menggunakan penyimpanan lokal sehingga
            tetap dapat digunakan dengan baik pada jaringan internal rumah sakit.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── Modul Aplikasi ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutGrid className="w-4 h-4 text-primary" />
              Modul Aplikasi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {MODULES.map((m, i) => (
                <li key={m} className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {m}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* ── Keunggulan ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Keunggulan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {FEATURES.map(f => (
                  <li key={f.label} className="flex items-center gap-2">
                    <span className="text-primary shrink-0">{f.icon}</span>
                    {f.label}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* ── Developer ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Code2 className="w-5 h-5 text-violet-500" /> Developer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-semibold text-foreground">Dedi Supriadi</p>
              <div className="text-muted-foreground space-y-1">
                <p>📱 <a href="https://wa.me/6208190261688" className="hover:text-primary transition-colors">08190261688</a></p>
                <p>✉️ <a href="mailto:nuxarcodex@gmail.com" className="hover:text-primary transition-colors">nuxarcodex@gmail.com</a></p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Info Aplikasi ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-5 h-5 text-emerald-500" /> Informasi Aplikasi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatItem icon={<HeartPulse className="w-4 h-4 text-primary" />} label="Versi Aplikasi"  value={`v${VERSION}`} />
            <StatItem icon={<Database className="w-4 h-4" />}                           label="Versi Database"  value={`v${DB_VERSION}`} />
            <StatItem icon={<Users className="w-4 h-4" />}                              label="Jumlah User"     value={String(stats.users)} />
            <StatItem icon={<BedDouble className="w-4 h-4" />}                          label="Pasien Aktif"    value={String(stats.activePasien)} />
            <StatItem icon={<Clock className="w-4 h-4" />}                              label="Pending Aktif"   value={String(stats.activePending)} />
            <StatItem icon={<History className="w-4 h-4" />}                            label="Riwayat Operan"  value={String(stats.totalOperan)} />
            <StatItem
              icon={isOnline
                ? <Wifi className="w-4 h-4 text-emerald-500" />
                : <WifiOff className="w-4 h-4 text-amber-500" />}
              label="Status Jaringan"
              value={isOnline ? 'Online' : 'Offline'}
              valueClass={isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}
            />
          </div>
          <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
            Backup terakhir: <span className="font-medium text-foreground">{stats.lastBackup}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── License notice ── */}
      <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10">
        <CardContent className="pt-5 pb-5 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">{APP_NAME}</strong> dibuat khusus sebagai sistem operasional
            internal rumah sakit.
          </p>
          <p className="mt-2 font-semibold text-amber-700 dark:text-amber-400">
            Tidak diperkenankan untuk diperjualbelikan atau didistribusikan tanpa izin dari pengembang.
          </p>
          <p className="mt-3 text-xs">© 2026 {APP_NAME} · All Rights Reserved. · Developed by Dedi Supriadi</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatItem({
  icon, label, value, valueClass = ''
}: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-semibold ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}
