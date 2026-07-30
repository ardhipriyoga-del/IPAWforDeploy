import React, { useState, useEffect } from 'react';
import { backupCloud, restoreCloud, syncStatus as getCloudSyncStatus, getCloudApiUrl } from '../lib/cloudSync';
import { getDB } from '../lib/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Cloud, CloudOff, Upload, RefreshCw, Save,
  Loader2, WifiOff
} from 'lucide-react';

export default function CloudBackupPage() {
  const [cloudStatus, setCloudStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [lastCloudBackup, setLastCloudBackup] = useState<number | null>(null);
  const [cloudBackingUp, setCloudBackingUp] = useState(false);
  const [cloudRestoring, setCloudRestoring] = useState(false);
  const [autoCloudBackup, setAutoCloudBackup] = useState(false);
  const [savingAutoBackup, setSavingAutoBackup] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setCloudStatus('checking');
    try {
      await getCloudApiUrl();
      const db = await getDB();
      const autoEntry = await db.get('settings', 'autoCloudBackup');
      setAutoCloudBackup(autoEntry?.value ?? false);
      const s = await getCloudSyncStatus();
      setCloudStatus(s.status);
      setLastCloudBackup(s.lastBackup);
    } catch {
      setCloudStatus('offline');
    }
  };

  // ── Backup Cloud ─────────────────────────────────────────────────────────────
  const handleBackupCloud = async () => {
    setCloudBackingUp(true);
    const toastId = toast.loading('Mengirim data ke Cloud...');
    try {
      await backupCloud();
      setLastCloudBackup(Date.now());
      toast.dismiss(toastId);
      toast.success('Backup Cloud berhasil! Data tersimpan di Cloud.');
    } catch (e: any) {
      toast.dismiss(toastId);
      toast.error('Backup Cloud gagal: ' + e.message);
    } finally {
      setCloudBackingUp(false);
    }
  };

  // ── Restore Cloud ────────────────────────────────────────────────────────────
  const handleRestoreCloud = async () => {
    if (!confirm('Peringatan: Restore Cloud akan menimpa SEMUA data lokal saat ini dengan data dari Cloud. Lanjutkan?')) return;
    setCloudRestoring(true);
    const toastId = toast.loading('Mengambil data dari Cloud...');
    try {
      await restoreCloud();
      toast.dismiss(toastId);
      toast.success('Restore Cloud berhasil! Memuat ulang aplikasi...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      toast.dismiss(toastId);
      toast.error('Restore Cloud gagal: ' + e.message);
    } finally {
      setCloudRestoring(false);
    }
  };

  // ── Auto Backup ──────────────────────────────────────────────────────────────
  const handleSaveAutoBackup = async () => {
    setSavingAutoBackup(true);
    try {
      const db = await getDB();
      await db.put('settings', { key: 'autoCloudBackup', value: autoCloudBackup });
      toast.success(
        autoCloudBackup
          ? 'Backup otomatis diaktifkan — data akan disinkronkan ke Cloud saat ada perubahan.'
          : 'Backup otomatis dinonaktifkan.'
      );
    } catch (e: any) {
      toast.error('Gagal menyimpan: ' + e.message);
    } finally {
      setSavingAutoBackup(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Cloud className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Cloud Backup</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Backup dan restore data ke Cloud secara aman. Membutuhkan koneksi internet.
        </p>
      </div>

      {/* ── Status Banner ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {cloudStatus === 'checking' ? (
                <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : cloudStatus === 'online' ? (
                <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <Cloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                  <CloudOff className="w-5 h-5 text-red-500 dark:text-red-400" />
                </div>
              )}
              <div>
                <div className="font-semibold text-sm flex items-center gap-2">
                  Status Cloud:{' '}
                  <span className={
                    cloudStatus === 'online'  ? 'text-emerald-600 dark:text-emerald-400' :
                    cloudStatus === 'offline' ? 'text-red-600 dark:text-red-400' :
                    'text-muted-foreground'
                  }>
                    {cloudStatus === 'online' ? 'ONLINE ✓' : cloudStatus === 'offline' ? 'OFFLINE' : 'Mengecek...'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Backup terakhir:{' '}
                  {lastCloudBackup
                    ? new Date(lastCloudBackup).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                    : 'Belum pernah backup ke Cloud'}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={loadAll}
              disabled={cloudStatus === 'checking'}
              className="gap-1.5 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cloudStatus === 'checking' ? 'animate-spin' : ''}`} />
              Cek Ulang
            </Button>
          </div>

          {cloudStatus === 'offline' && (
            <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Tidak ada koneksi internet atau layanan Cloud tidak dapat diakses.
                Data tetap aman di IndexedDB lokal. Tombol Cloud dinonaktifkan sementara.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Backup Cloud ─────────────────────────────────────────────────────── */}
      <Card className={cloudStatus === 'offline' ? 'opacity-60' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-4 h-4 text-blue-600" />
            Backup Cloud
          </CardTitle>
          <CardDescription>
            Kirim seluruh database, termasuk Master User, ke Cloud. Membutuhkan internet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleBackupCloud}
            disabled={cloudBackingUp || cloudStatus !== 'online'}
            className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {cloudBackingUp
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim ke Cloud...</>
              : <><Cloud className="w-4 h-4" /> Backup Cloud</>
            }
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {cloudStatus === 'offline'
              ? 'Tidak tersedia saat offline'
              : <>Data disimpan sebagai <code className="bg-muted px-1 rounded">database.json</code> di Cloud.</>
            }
          </p>

        </CardContent>
      </Card>

      {/* ── Restore Cloud ────────────────────────────────────────────────────── */}
      <Card className={`border-destructive/30 ${cloudStatus === 'offline' ? 'opacity-60' : ''}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <Cloud className="w-4 h-4" />
            Restore Cloud
          </CardTitle>
          <CardDescription>
            Ambil data dari Cloud, termasuk Master User, lalu timpa database lokal.{' '}
            <strong className="text-destructive">Hanya berjalan jika download berhasil.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleRestoreCloud}
            disabled={cloudRestoring || cloudStatus !== 'online'}
            variant="destructive"
            className="w-full gap-2 disabled:opacity-50"
          >
            {cloudRestoring
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengambil dari Cloud...</>
              : <><Upload className="w-4 h-4" /> Restore Cloud</>
            }
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {cloudStatus === 'offline'
              ? 'Tidak tersedia saat offline'
              : 'Data lokal TIDAK akan diubah jika koneksi ke Cloud gagal.'
            }
          </p>
        </CardContent>
      </Card>

      {/* ── Backup Otomatis ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Backup Otomatis Cloud
          </CardTitle>
          <CardDescription>
            Jalankan backup ke Cloud secara otomatis setiap kali ada perubahan data penting
            (pasien, operan, billing, master tarif, pengaturan).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
            <div>
              <div className="font-semibold text-sm">Backup Otomatis ke Cloud</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {autoCloudBackup
                  ? 'Aktif — backup berjalan di latar belakang saat data berubah'
                  : 'Nonaktif — backup hanya berjalan saat Anda tekan tombol manual'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoCloudBackup(v => !v)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
                ${autoCloudBackup ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              role="switch"
              aria-checked={autoCloudBackup}
            >
              <span className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md ring-0 transition-transform duration-200
                ${autoCloudBackup ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {autoCloudBackup && cloudStatus === 'offline' && (
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Internet tidak tersedia. Perubahan hanya disimpan lokal.
                Backup otomatis akan aktif kembali saat koneksi tersedia.
              </span>
            </div>
          )}

          <Button onClick={handleSaveAutoBackup} disabled={savingAutoBackup} className="gap-2">
            <Save className="w-4 h-4" />
            {savingAutoBackup ? 'Menyimpan...' : 'Simpan Pengaturan Backup'}
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}
