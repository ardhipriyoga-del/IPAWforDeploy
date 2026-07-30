import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { getDB } from '../lib/db';
import { backupData, restoreData, backupDataJSON, restoreDataJSON } from '../lib/backup';
import { backupCloud, restoreCloud, syncStatus as getCloudSyncStatus, DEFAULT_CLOUD_API, getCloudApiUrl } from '../lib/cloudSync';

// Backup users ke cloud di background — silent, tidak blokir UI
const autoBackupUsers = () => backupCloud().catch(() => {});
import { hashPassword } from '../lib/auth';
import { importExcel } from '../lib/importExcel';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, Download, Upload, Shield, Users, Building, Database, KeyRound, Eye, EyeOff, FileSpreadsheet, RefreshCw, Cloud, CloudOff, HardDrive, Terminal, Info, CheckCircle2, AlertCircle, Loader2, ShieldAlert, FileCode2, AlertTriangle, Timer, ShieldCheck, PackageOpen, WifiOff, MessageSquare, SlidersHorizontal } from 'lucide-react';
import MasterTarifContent from './masterTarif';
import BillingRuleSettings from './billingRuleSettings';
import TemplatePesanKasirContent from './templatePesanKasir';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function SettingsPage() {
  const { user } = useAuth();
  const { rsName, refreshSettings } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<'profil' | 'session' | 'users' | 'app' | 'backup' | 'masterTarif' | 'sinkronisasi' | 'import' | 'download' | 'templatePesan'>('profil');

  // Import Data state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<any>(null);
  
  // Auto Logout setting
  const [autoLogoutEnabled, setAutoLogoutEnabled] = useState(true);
  const [autoLogoutMins, setAutoLogoutMins] = useState(30);
  const [savingSession, setSavingSession] = useState(false);

  // Auto Sync setting
  const [autoSyncInterval, setAutoSyncInterval] = useState<string>('manual');
  const [savingSync, setSavingSync] = useState(false);

  // Endpoint URL settings (superuser only)
  const DEFAULT_EP = {
    inpatient: 'https://apps.emc.id/trakcare/dashboard/dailyinpatient/trakcareANLT/hospital/4',
    igd: 'https://apps.emc.id/trakcare/dashboard/dailyemergencywaitingtime/trakcareANLT/hospital/4',
    medicalDischarge: 'https://apps.emc.id/trakcare/dashboard/dailyinpatient/trakcareANLT/hospital/4?medical=Y',
    nurseDischarge: 'https://apps.emc.id/trakcare/dashboard/dailyinpatient/trakcareANLT/hospital/4?nurse=Y',
    pharmacyDischarge: 'https://apps.emc.id/trakcare/dashboard/dailyinpatient/trakcareANLT/hospital/4?pharmacy=Y',
  };
  const [epInpatient, setEpInpatient] = useState(DEFAULT_EP.inpatient);
  const [epIGD, setEpIGD] = useState(DEFAULT_EP.igd);
  const [epMedical, setEpMedical] = useState(DEFAULT_EP.medicalDischarge);
  const [epNurse, setEpNurse] = useState(DEFAULT_EP.nurseDischarge);
  const [epPharmacy, setEpPharmacy] = useState(DEFAULT_EP.pharmacyDischarge);
  const [savingEndpoints, setSavingEndpoints] = useState(false);
  
  // App Config
  const [appNameInput, setAppNameInput] = useState(rsName);
  
  // Users
  const [usersList, setUsersList] = useState<any[]>([]);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', namaLengkap: '', password: '', confirmPassword: '', role: 'officer' });

  // Edit Nama
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [editNameTarget, setEditNameTarget] = useState<any>(null);
  const [editNameValue, setEditNameValue] = useState('');

  // Change Password
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Backup lokal (Excel legacy)
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Post-restore dialog
  const [postRestoreOpen, setPostRestoreOpen] = useState(false);
  const [postRestoreMissingTarif, setPostRestoreMissingTarif] = useState(false);
  const [postRestoreMissingItem, setPostRestoreMissingItem] = useState(false);

  // Cloud sync state
  const [cloudStatus, setCloudStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [lastCloudBackup, setLastCloudBackup] = useState<number | null>(null);
  const [autoCloudBackup, setAutoCloudBackup] = useState(false);
  const [cloudBackingUp, setCloudBackingUp] = useState(false);
  const [cloudRestoring, setCloudRestoring] = useState(false);
  const [savingAutoBackup, setSavingAutoBackup] = useState(false);
  // Backup/Restore JSON lokal
  const [restoreJsonFile, setRestoreJsonFile] = useState<File | null>(null);
  const [restoringJson, setRestoringJson] = useState(false);

  // Cloud API URL (configurable)
  const [cloudApiUrl, setCloudApiUrl] = useState('');
  const [savingCloudUrl, setSavingCloudUrl] = useState(false);

  useEffect(() => {
    if (user?.role === 'superuser' && activeTab === 'users') {
      loadUsers();
    }
    if (activeTab === 'sinkronisasi') {
      loadSyncSettings();
    }
    if (activeTab === 'session') {
      loadSessionSettings();
    }
    if (activeTab === 'backup') {
      loadCloudStatus();
    }
  }, [activeTab, user]);

  // Load on mount too (for the sync indicator in header)
  useEffect(() => {
    loadSyncSettings();
    loadSessionSettings();
    // Cek apakah ada redirect post-restore ke tab tertentu
    const postRestoreTab = sessionStorage.getItem('ipaw_post_restore_tab');
    if (postRestoreTab) {
      sessionStorage.removeItem('ipaw_post_restore_tab');
      setActiveTab(postRestoreTab as any);
    }
  }, []);

  const loadSessionSettings = async () => {
    const db = await getDB();
    const s = await db.get('settings', 'timeoutMins');
    // s?.value === 0 means disabled; undefined/null falls back to 30
    if (s === undefined || s === null) {
      setAutoLogoutEnabled(true);
      setAutoLogoutMins(30);
    } else {
      const val: number = s.value ?? 30;
      setAutoLogoutEnabled(val !== 0);
      setAutoLogoutMins(val === 0 ? 30 : val);
    }
  };

  const handleSaveSessionSettings = async () => {
    setSavingSession(true);
    try {
      const db = await getDB();
      const valueToStore = autoLogoutEnabled ? autoLogoutMins : 0;
      await db.put('settings', { key: 'timeoutMins', value: valueToStore });
      toast.success(
        autoLogoutEnabled
          ? `Auto logout diaktifkan — sesi akan berakhir setelah ${autoLogoutMins} menit tidak aktif.`
          : 'Auto logout dinonaktifkan — sesi tidak akan berakhir otomatis.'
      );
    } catch (err: any) {
      toast.error('Gagal menyimpan: ' + err.message);
    } finally {
      setSavingSession(false);
    }
  };

  const loadSyncSettings = async () => {
    const db = await getDB();
    const s = await db.get('settings', 'autoSyncInterval');
    setAutoSyncInterval(s?.value || 'manual');
    // Load endpoint URLs
    const ep = async (key: string, def: string) => (await db.get('settings', key))?.value || def;
    setEpInpatient(await ep('endpointInpatient', DEFAULT_EP.inpatient));
    setEpIGD(await ep('endpointIGD', DEFAULT_EP.igd));
    setEpMedical(await ep('endpointMedicalDischarge', DEFAULT_EP.medicalDischarge));
    setEpNurse(await ep('endpointNurseDischarge', DEFAULT_EP.nurseDischarge));
    setEpPharmacy(await ep('endpointPharmacyDischarge', DEFAULT_EP.pharmacyDischarge));
  };

  const handleSaveEndpoints = async () => {
    setSavingEndpoints(true);
    try {
      const db = await getDB();
      await db.put('settings', { key: 'endpointInpatient',        value: epInpatient });
      await db.put('settings', { key: 'endpointIGD',              value: epIGD });
      await db.put('settings', { key: 'endpointMedicalDischarge',  value: epMedical });
      await db.put('settings', { key: 'endpointNurseDischarge',    value: epNurse });
      await db.put('settings', { key: 'endpointPharmacyDischarge', value: epPharmacy });
      toast.success('URL endpoint berhasil disimpan.');
    } catch (err: any) {
      toast.error('Gagal menyimpan: ' + err.message);
    } finally {
      setSavingEndpoints(false);
    }
  };

  const handleSaveSyncSettings = async () => {
    setSavingSync(true);
    try {
      const db = await getDB();
      await db.put('settings', { key: 'autoSyncInterval', value: autoSyncInterval });
      toast.success('Pengaturan sinkronisasi berhasil disimpan.');
    } catch (err: any) {
      toast.error('Gagal menyimpan: ' + err.message);
    } finally {
      setSavingSync(false);
    }
  };

  const loadUsers = async () => {
    const db = await getDB();
    const u = await db.getAll('users');
    setUsersList(u);
  };

  const handleSaveAppConfig = async () => {
    const db = await getDB();
    await db.put('settings', { key: 'rsName', value: appNameInput });
    refreshSettings();
    toast.success('Konfigurasi aplikasi berhasil disimpan.');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newUser.password !== newUser.confirmPassword) {
      toast.error('Password dan konfirmasi password tidak cocok!');
      return;
    }
    const db = await getDB();
    const existing = await db.getAll('users');
    if (existing.find(u => u.username === newUser.username)) {
      toast.error('Username sudah digunakan!');
      return;
    }
    
    await db.put('users', {
      username: newUser.username,
      namaLengkap: newUser.namaLengkap,
      role: newUser.role as 'superuser' | 'officer',
      passwordHash: hashPassword(newUser.password),
      aktif: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    
    toast.success('Pengguna berhasil ditambahkan.');
    setIsAddUserOpen(false);
    setNewUser({ username: '', namaLengkap: '', password: '', confirmPassword: '', role: 'officer' });
    loadUsers();
    autoBackupUsers(); // sync ke cloud agar perangkat lain langsung bisa login
  };

  const handleEditName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNameTarget || !editNameValue.trim()) return;
    const db = await getDB();
    const updated = { ...editNameTarget, namaLengkap: editNameValue.trim(), updatedAt: Date.now() };
    await db.put('users', updated);
    toast.success('Nama berhasil diperbarui.');
    setIsEditNameOpen(false);
    setEditNameTarget(null);
    setEditNameValue('');
    loadUsers();
    autoBackupUsers();
  };

  const handleToggleUserStatus = async (u: any) => {
    if (u.username === user?.username) {
      toast.error('Tidak bisa menonaktifkan diri sendiri!');
      return;
    }
    const db = await getDB();
    u.aktif = !u.aktif;
    u.updatedAt = Date.now();
    await db.put('users', u);
    loadUsers();
    toast.success(`User ${u.username} ${u.aktif ? 'diaktifkan' : 'dinonaktifkan'}.`);
    autoBackupUsers();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (pwForm.next !== pwForm.confirm) {
      toast.error('Password baru dan konfirmasi tidak cocok!');
      return;
    }
    if (pwForm.next.length < 6) {
      toast.error('Password baru minimal 6 karakter!');
      return;
    }
    setPwLoading(true);
    try {
      const db = await getDB();
      const allUsers = await db.getAll('users');
      const dbUser = allUsers.find(u => u.username === user.username);
      if (!dbUser) throw new Error('User tidak ditemukan');
      if (dbUser.passwordHash !== hashPassword(pwForm.current)) {
        toast.error('Password lama tidak sesuai!');
        return;
      }
      dbUser.passwordHash = hashPassword(pwForm.next);
      dbUser.updatedAt = Date.now();
      await db.put('users', dbUser);
      toast.success('Password berhasil diubah. Silakan login ulang berikutnya.');
      setPwForm({ current: '', next: '', confirm: '' });
      autoBackupUsers();
    } catch (err: any) {
      toast.error('Gagal mengubah password: ' + err.message);
    } finally {
      setPwLoading(false);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!importFile || !user) return;
    setImporting(true);
    setImportProgress(0);
    setImportResult(null);
    try {
      const stats = await importExcel(importFile, user.id, user.namaLengkap, (p: number) => setImportProgress(p));
      setImportResult(stats);
      toast.success('Import data pasien berhasil diselesaikan.');
    } catch (err: any) {
      toast.error('Gagal melakukan import: ' + err.message);
    } finally {
      setImporting(false);
      setImportFile(null);
      const el = document.getElementById('settings-file-upload') as HTMLInputElement;
      if (el) el.value = '';
    }
  };

  const handleBackup = async () => {
    try {
      await backupData();
      toast.success('Backup berhasil didownload.');
    } catch(e: any) {
      toast.error('Gagal backup: ' + e.message);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) return;
    if (!confirm('Peringatan: Proses restore akan menimpa SEMUA data saat ini (kecuali Master Tarif & Master Item). Lanjutkan?')) return;

    setRestoring(true);
    const toastId = toast.loading('Melakukan restore data...');
    try {
      const result = await restoreData(restoreFile);
      toast.dismiss(toastId);
      setRestoreFile(null);

      const missingAny = result.masterTarifMissing || result.masterItemMissing;
      if (missingAny) {
        setPostRestoreMissingTarif(result.masterTarifMissing);
        setPostRestoreMissingItem(result.masterItemMissing);
        setPostRestoreOpen(true);
      } else {
        toast.success('Restore berhasil! Memuat ulang aplikasi...');
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch(e: any) {
      toast.dismiss(toastId);
      toast.error('Gagal restore: ' + (e as any).message);
    } finally {
      setRestoring(false);
    }
  };

  // ── Cloud Sync handlers ──────────────────────────────────────────────────────

  const loadCloudStatus = async () => {
    setCloudStatus('checking');
    try {
      // Load configurable GAS URL
      const url = await getCloudApiUrl();
      setCloudApiUrl(url);

      const s = await getCloudSyncStatus();
      setCloudStatus(s.status);
      setLastCloudBackup(s.lastBackup);
      setAutoCloudBackup(s.autoBackupEnabled);
    } catch {
      setCloudStatus('offline');
    }
  };

  const handleSaveCloudUrl = async () => {
    setSavingCloudUrl(true);
    try {
      const db = await getDB();
      const trimmed = cloudApiUrl.trim();
      if (trimmed && !trimmed.startsWith('https://script.google.com/')) {
        toast.error('URL tidak valid. Harus dimulai dengan https://script.google.com/');
        return;
      }
      // Jika kosong, hapus setting (pakai default)
      if (!trimmed) {
        await db.delete('settings' as any, 'cloudApiUrl');
        setCloudApiUrl(DEFAULT_CLOUD_API);
        toast.success('URL dikembalikan ke default.');
      } else {
        await db.put('settings', { key: 'cloudApiUrl', value: trimmed });
        toast.success('URL Google Apps Script berhasil disimpan.');
      }
      // Cek ulang status dengan URL baru
      setCloudStatus('checking');
      setTimeout(() => loadCloudStatus(), 300);
    } catch (e: any) {
      toast.error('Gagal menyimpan URL: ' + e.message);
    } finally {
      setSavingCloudUrl(false);
    }
  };

  const handleBackupJSON = async () => {
    try {
      await backupDataJSON();
      toast.success('Backup JSON berhasil didownload ke perangkat Anda.');
    } catch(e: any) {
      toast.error('Gagal backup JSON: ' + e.message);
    }
  };

  const handleRestoreJSON = async () => {
    if (!restoreJsonFile) return;
    if (!confirm('Peringatan: Restore JSON akan menimpa SEMUA data saat ini. Lanjutkan?')) return;
    setRestoringJson(true);
    const toastId = toast.loading('Memproses restore JSON...');
    try {
      await restoreDataJSON(restoreJsonFile);
      toast.dismiss(toastId);
      setRestoreJsonFile(null);
      toast.success('Restore JSON berhasil! Memuat ulang aplikasi...');
      setTimeout(() => window.location.reload(), 1500);
    } catch(e: any) {
      toast.dismiss(toastId);
      toast.error('Gagal restore JSON: ' + e.message);
    } finally {
      setRestoringJson(false);
    }
  };

  const handleBackupCloud = async () => {
    setCloudBackingUp(true);
    const toastId = toast.loading('Mengirim data ke Cloud...');
    try {
      await backupCloud();
      setLastCloudBackup(Date.now());
      toast.dismiss(toastId);
      toast.success('Backup Cloud berhasil! Data tersimpan di Cloud.');
    } catch(e: any) {
      toast.dismiss(toastId);
      toast.error('Backup Cloud gagal: ' + e.message);
    } finally {
      setCloudBackingUp(false);
    }
  };

  const handleRestoreCloud = async () => {
    if (!confirm('Peringatan: Restore Cloud akan menimpa SEMUA data lokal saat ini dengan data dari Cloud. Lanjutkan?')) return;
    setCloudRestoring(true);
    const toastId = toast.loading('Mengambil data dari Cloud...');
    try {
      await restoreCloud();
      toast.dismiss(toastId);
      toast.success('Restore Cloud berhasil! Memuat ulang aplikasi...');
      setTimeout(() => window.location.reload(), 1500);
    } catch(e: any) {
      toast.dismiss(toastId);
      // Data lokal TIDAK terhapus karena restore gagal sebelum menimpa
      toast.error('Restore Cloud gagal: ' + e.message);
    } finally {
      setCloudRestoring(false);
    }
  };

  const handleSaveAutoBackup = async () => {
    setSavingAutoBackup(true);
    try {
      const db = await getDB();
      await db.put('settings', { key: 'autoCloudBackup', value: autoCloudBackup });
      toast.success(autoCloudBackup
        ? 'Backup otomatis diaktifkan — data akan disinkronkan ke Cloud saat ada perubahan.'
        : 'Backup otomatis dinonaktifkan.');
    } catch(e: any) {
      toast.error('Gagal menyimpan: ' + e.message);
    } finally {
      setSavingAutoBackup(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pengaturan Sistem</h1>
        <p className="text-muted-foreground mt-1">Konfigurasi aplikasi dan manajemen pengguna.</p>
      </div>

      <div className="flex border-b border-border mb-6 flex-wrap">
        <TabButton active={activeTab === 'profil'} onClick={() => setActiveTab('profil')} icon={Shield} label="Profil Saya" />
        <TabButton active={activeTab === 'session'} onClick={() => setActiveTab('session')} icon={Timer} label="Sesi & Keamanan" />
        <TabButton active={activeTab === 'backup'} onClick={() => setActiveTab('backup')} icon={Database} label="Backup & Restore" />
        <TabButton active={activeTab === 'sinkronisasi'} onClick={() => setActiveTab('sinkronisasi')} icon={RefreshCw} label="Sinkronisasi" />
        <TabButton active={activeTab === 'import'} onClick={() => setActiveTab('import')} icon={Upload} label="Import Data" />
        <TabButton active={activeTab === 'masterTarif'} onClick={() => setActiveTab('masterTarif')} icon={FileSpreadsheet} label="Master Tarif" />
        <TabButton active={activeTab === 'templatePesan'} onClick={() => setActiveTab('templatePesan')} icon={MessageSquare} label="Template Pesan Kasir" />
        <TabButton active={activeTab === 'billingRule'} onClick={() => setActiveTab('billingRule')} icon={SlidersHorizontal} label="Billing Rule" />
        {user?.role === 'superuser' && (
          <>
            <TabButton active={activeTab === 'app'} onClick={() => setActiveTab('app')} icon={Building} label="Aplikasi" />
            <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={Users} label="Master User" />
            <TabButton active={activeTab === 'download'} onClick={() => setActiveTab('download')} icon={Download} label="Download Aplikasi" />
          </>
        )}
      </div>

      {activeTab === 'profil' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profil Pengguna</CardTitle>
              <CardDescription>Informasi akun Anda saat ini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div>
                <label className="text-sm font-semibold text-muted-foreground">Nama Lengkap</label>
                <div className="text-lg font-medium">{user?.namaLengkap}</div>
              </div>
              <div>
                <label className="text-sm font-semibold text-muted-foreground">Username</label>
                <div className="text-lg">{user?.username}</div>
              </div>
              <div>
                <label className="text-sm font-semibold text-muted-foreground">Role Akses</label>
                <div className="inline-block mt-1 uppercase tracking-wider text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-md">
                  {user?.role}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5" /> Ubah Password
              </CardTitle>
              <CardDescription>Masukkan password lama untuk verifikasi, lalu tetapkan password baru.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Password Lama</label>
                  <div className="relative">
                    <Input
                      type={showCurrent ? 'text' : 'password'}
                      value={pwForm.current}
                      onChange={e => setPwForm({ ...pwForm, current: e.target.value })}
                      placeholder="Masukkan password saat ini"
                      required
                      className="pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrent(v => !v)}>
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Password Baru</label>
                  <div className="relative">
                    <Input
                      type={showNext ? 'text' : 'password'}
                      value={pwForm.next}
                      onChange={e => setPwForm({ ...pwForm, next: e.target.value })}
                      placeholder="Minimal 6 karakter"
                      required
                      className="pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNext(v => !v)}>
                      {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Konfirmasi Password Baru</label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? 'text' : 'password'}
                      value={pwForm.confirm}
                      onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                      placeholder="Ulangi password baru"
                      required
                      className="pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirm(v => !v)}>
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                    <p className="text-xs text-destructive">Password tidak cocok.</p>
                  )}
                </div>
                <Button type="submit" disabled={pwLoading} className="gap-2">
                  <KeyRound className="w-4 h-4" />
                  {pwLoading ? 'Menyimpan...' : 'Simpan Password Baru'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'session' && (
        <div className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Auto Logout
              </CardTitle>
              <CardDescription>
                Atur berapa lama sesi login otomatis berakhir saat tidak ada aktivitas. Berlaku untuk semua pengguna di perangkat ini.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Toggle on/off */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div>
                  <div className="font-semibold text-sm">Aktifkan Auto Logout</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {autoLogoutEnabled
                      ? `Sesi berakhir setelah ${autoLogoutMins} menit tidak aktif`
                      : 'Sesi tidak akan berakhir otomatis'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoLogoutEnabled(v => !v)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
                    ${autoLogoutEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  aria-checked={autoLogoutEnabled}
                  role="switch"
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md ring-0 transition-transform duration-200
                      ${autoLogoutEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>

              {/* Duration picker */}
              {autoLogoutEnabled && (
                <div className="space-y-3">
                  <label className="text-sm font-semibold">Durasi Tidak Aktif Sebelum Logout</label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { value: 5,   label: '5 menit' },
                      { value: 10,  label: '10 menit' },
                      { value: 15,  label: '15 menit' },
                      { value: 30,  label: '30 menit' },
                      { value: 60,  label: '1 jam' },
                      { value: 120, label: '2 jam' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAutoLogoutMins(opt.value)}
                        className={`py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all text-center ${
                          autoLogoutMins === opt.value
                            ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                            : 'bg-background border-border text-foreground hover:border-primary/50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Info banners */}
              {autoLogoutEnabled ? (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-primary">
                  <b>Auto Logout Aktif</b> — Sistem akan otomatis logout setelah{' '}
                  <b>{autoLogoutMins} menit</b> tidak ada aktivitas (klik / ketik / scroll).
                  Timer akan direset setiap kali Anda berinteraksi dengan aplikasi.
                </div>
              ) : (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300">
                  <b>Auto Logout Dinonaktifkan</b> — Sesi tidak akan berakhir otomatis.
                  Pastikan Anda logout manual saat meninggalkan perangkat.
                </div>
              )}

              <Button onClick={handleSaveSessionSettings} disabled={savingSession} className="gap-2">
                <Save className="w-4 h-4" />
                {savingSession ? 'Menyimpan...' : 'Simpan Pengaturan Sesi'}
              </Button>
            </CardContent>
          </Card>

          {/* Info card */}
          <Card className="shadow-none bg-muted/20 border-border">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Info className="w-4 h-4" /> Informasi
              </p>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                {[
                  'Pengaturan ini berlaku untuk semua pengguna yang login di perangkat ini.',
                  'Timer inaktivitas direset setiap kali ada klik, ketikan, atau scroll pada aplikasi.',
                  'Saat sesi berakhir, Anda akan diarahkan ke halaman login dan perlu login ulang.',
                  'Data yang belum tersimpan saat sesi berakhir tidak akan hilang — tersimpan di IndexedDB browser.',
                ].map((note, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'app' && user?.role === 'superuser' && (
        <Card>
          <CardHeader>
            <CardTitle>Konfigurasi Rumah Sakit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Nama Rumah Sakit</label>
              <Input value={appNameInput} onChange={e => setAppNameInput(e.target.value)} />
            </div>
            <Button onClick={handleSaveAppConfig} className="gap-2"><Save className="w-4 h-4"/> Simpan Konfigurasi</Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'users' && user?.role === 'superuser' && (
        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <div>
              <CardTitle>Manajemen Pengguna</CardTitle>
              <CardDescription>Kelola akses officer admission.</CardDescription>
            </div>
            <Button onClick={() => setIsAddUserOpen(true)}>Tambah User</Button>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="p-3">Username</th>
                  <th className="p-3">Nama Lengkap</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map(u => (
                  <tr key={u.id} className="border-b border-border">
                    <td className="p-3 font-medium">{u.username}</td>
                    <td className="p-3">{u.namaLengkap}</td>
                    <td className="p-3 uppercase text-xs">{u.role}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${u.aktif ? 'bg-emerald-100 text-emerald-700' : 'bg-destructive/10 text-destructive'}`}>
                        {u.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="p-3 text-right flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => { setEditNameTarget(u); setEditNameValue(u.namaLengkap); setIsEditNameOpen(true); }}>
                        Ubah Nama
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleToggleUserStatus(u)}>
                        {u.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'backup' && (
        <div className="space-y-6 max-w-4xl">

          {/* ── Cloud Status Banner ─────────────────────────────────────── */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {cloudStatus === 'checking' ? (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : cloudStatus === 'online' ? (
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <Cloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                      <CloudOff className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-2">
                      ☁️ Cloud Status:{' '}
                      <span className={
                        cloudStatus === 'online'   ? 'text-emerald-600 dark:text-emerald-400' :
                        cloudStatus === 'offline'  ? 'text-red-600 dark:text-red-400' :
                        'text-muted-foreground'
                      }>
                        {cloudStatus === 'online' ? 'ONLINE' : cloudStatus === 'offline' ? 'OFFLINE' : 'Mengecek...'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      LAST BACKUP:{' '}
                      {lastCloudBackup
                        ? new Date(lastCloudBackup).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                        : 'Belum pernah backup ke Cloud'}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={loadCloudStatus} disabled={cloudStatus === 'checking'} className="gap-1.5 shrink-0">
                  <RefreshCw className={`w-3.5 h-3.5 ${cloudStatus === 'checking' ? 'animate-spin' : ''}`} />
                  Cek Ulang
                </Button>
              </div>

              {/* Offline notice */}
              {cloudStatus === 'offline' && (
                <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Tidak ada koneksi internet atau layanan Cloud tidak dapat diakses.
                    Perubahan data tetap tersimpan di IndexedDB lokal.
                    Tombol Cloud Backup/Restore dinonaktifkan sementara.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 4 Action Cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Backup Lokal JSON */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-emerald-600" />
                  Backup Lokal (.json)
                </CardTitle>
                <CardDescription>
                  Download seluruh database IndexedDB ke file JSON di perangkat Anda. Tidak membutuhkan internet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleBackupJSON} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Download className="w-4 h-4" /> Download Backup JSON
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Simpan file ini di tempat aman. Dapat digunakan untuk restore kapan saja.
                </p>
              </CardContent>
            </Card>

            {/* Restore Lokal JSON */}
            <Card className="border-amber-200/80 dark:border-amber-800/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-amber-600" />
                  Restore Lokal (.json)
                </CardTitle>
                <CardDescription>
                  Pulihkan data dari file JSON backup lokal.{' '}
                  <strong className="text-amber-700 dark:text-amber-400">Menimpa data saat ini.</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  type="file"
                  accept=".json"
                  onChange={e => setRestoreJsonFile(e.target.files?.[0] || null)}
                  disabled={restoringJson}
                />
                {restoreJsonFile && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    {restoreJsonFile.name} ({(restoreJsonFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <Button
                  onClick={handleRestoreJSON}
                  disabled={!restoreJsonFile || restoringJson}
                  className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
                  variant="outline"
                >
                  {restoringJson
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
                    : <><Upload className="w-4 h-4" /> Jalankan Restore JSON</>
                  }
                </Button>
              </CardContent>
            </Card>

            {/* Backup Cloud */}
            <Card className={cloudStatus === 'offline' ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-blue-600" />
                  Backup Cloud
                </CardTitle>
                <CardDescription>
                  Kirim seluruh database ke Cloud. Membutuhkan internet.
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
                {cloudStatus === 'offline' && (
                  <p className="text-xs text-muted-foreground text-center mt-2">Tidak tersedia saat offline</p>
                )}
                {cloudStatus === 'online' && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Data akan tersimpan sebagai <code className="bg-muted px-1 rounded">database.json</code> di Cloud.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Restore Cloud */}
            <Card className={`border-destructive/30 ${cloudStatus === 'offline' ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-destructive">
                  <Cloud className="w-4 h-4" />
                  Restore Cloud
                </CardTitle>
                <CardDescription>
                  Ambil data dari Cloud lalu timpa database lokal.{' '}
                  <strong className="text-destructive">Hanya jalan jika download berhasil.</strong>
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
                {cloudStatus === 'offline' && (
                  <p className="text-xs text-muted-foreground text-center mt-2">Tidak tersedia saat offline</p>
                )}
                {cloudStatus === 'online' && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Data lokal TIDAK akan diubah jika koneksi ke Cloud gagal.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Auto Backup ────────────────────────────────────────────── */}
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
                      : 'Nonaktif — backup hanya berjalan saat Anda menekan tombol secara manual'}
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
                    Internet tidak tersedia sekarang. Perubahan hanya disimpan di IndexedDB lokal.
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

          {/* ── Konfigurasi URL Google Apps Script ─────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="w-4 h-4" /> URL Google Apps Script
              </CardTitle>
              <CardDescription>
                URL endpoint Google Apps Script untuk backup & restore cloud.
                Kosongkan untuk menggunakan URL default. Ubah jika script diganti atau di-deploy ulang.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  URL Web App GAS
                </label>
                <Input
                  value={cloudApiUrl}
                  onChange={e => setCloudApiUrl(e.target.value)}
                  placeholder={DEFAULT_CLOUD_API}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Harus diawali dengan <code className="bg-muted px-1 rounded">https://script.google.com/macros/s/</code>.
                  Pastikan GAS di-deploy dengan akses <strong>"Anyone"</strong> atau <strong>"Anyone, even anonymous"</strong>.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleSaveCloudUrl} disabled={savingCloudUrl} className="gap-2">
                  <Save className="w-4 h-4" />
                  {savingCloudUrl ? 'Menyimpan...' : 'Simpan URL'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setCloudApiUrl(DEFAULT_CLOUD_API); }}
                  className="gap-2 text-muted-foreground"
                  disabled={cloudApiUrl === DEFAULT_CLOUD_API}
                >
                  Reset ke Default
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Legacy Excel (backward compat) ─────────────────────────── */}
          <Card className="shadow-none bg-muted/10 border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Backup Legacy (.xlsx)
              </CardTitle>
              <CardDescription className="text-xs">
                Format lama. Gunakan format JSON atau Cloud untuk backup terbaru. Disediakan untuk kompatibilitas mundur.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 items-center">
              <Button size="sm" variant="outline" onClick={handleBackup} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> Download Backup Excel
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".xlsx"
                  className="max-w-[200px] text-xs h-8"
                  onChange={e => setRestoreFile(e.target.files?.[0] || null)}
                  disabled={restoring}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRestore}
                  disabled={!restoreFile || restoring}
                  className="gap-1.5 shrink-0"
                >
                  {restoring
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Restore...</>
                    : <><Upload className="w-3.5 h-3.5" /> Restore Excel</>
                  }
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      )}

      {activeTab === 'masterTarif' && (
        <MasterTarifContent />
      )}

      {activeTab === 'templatePesan' && (
        <TemplatePesanKasirContent />
      )}

      {activeTab === 'billingRule' && (
        <BillingRuleSettings />
      )}

      {activeTab === 'import' && (
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Import Data Pasien</CardTitle>
              <CardDescription>Perbarui data pasien rawat inap dari file Excel Sistem HIS.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20 text-center transition-colors hover:bg-muted/40">
                <FileSpreadsheet className="w-16 h-16 text-primary mb-4" />
                <h3 className="text-lg font-semibold mb-2">Upload File Excel (.xlsx)</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-6">
                  Pastikan format file sesuai dengan hasil export laporan pasien aktif dari sistem HIS.
                  Proses ini akan otomatis memutakhirkan status pasien, ruangan, dan kelas.
                </p>
                <input
                  type="file"
                  id="settings-file-upload"
                  className="hidden"
                  accept=".xlsx, .xls"
                  onChange={handleImportFile}
                  disabled={importing}
                />
                <label
                  htmlFor="settings-file-upload"
                  className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-8"
                >
                  Pilih File Excel
                </label>
                {importFile && (
                  <div className="mt-4 p-3 bg-card border border-border rounded-lg text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>

              {importing && (
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-primary flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Memproses Data...
                    </span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <Button size="lg" onClick={handleImport} disabled={!importFile || importing} className="w-full sm:w-auto">
                  {importing ? 'Sedang Import...' : 'Mulai Import Data'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {importResult && (
            <Card className="border-emerald-500/30 shadow-sm bg-emerald-50/30 dark:bg-emerald-950/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" /> Hasil Import
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Total Baris</div>
                    <div className="text-2xl font-bold">{importResult.total}</div>
                  </div>
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider text-emerald-600">Pasien Baru</div>
                    <div className="text-2xl font-bold text-emerald-600">{importResult.new}</div>
                  </div>
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider text-blue-600">Diupdate</div>
                    <div className="text-2xl font-bold text-blue-600">{importResult.updated}</div>
                  </div>
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider text-orange-600">Pulang/Arsip</div>
                    <div className="text-2xl font-bold text-orange-600">{importResult.archived}</div>
                  </div>
                </div>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <h4 className="font-semibold text-destructive flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4" /> Ada {importResult.errors.length} Error:
                    </h4>
                    <ul className="text-sm space-y-1 text-destructive/80 max-h-32 overflow-y-auto list-disc pl-5">
                      {importResult.errors.map((e: string, i: number) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'download' && user?.role === 'superuser' && (() => {
        const htmlFileUrl = `${import.meta.env.BASE_URL}ipaw.html`;
        const batFileUrl  = `${import.meta.env.BASE_URL}buka-ipaw-offline.bat`;
        const steps = [
          'Download kedua file di bawah (HTML + BAT) ke folder yang sama, misalnya D:\\IPAW\\.',
          'Untuk membuka aplikasi biasa (tanpa sinkronisasi TrakCare): klik dua kali file HTML langsung di Chrome.',
          'Untuk membuka dengan sinkronisasi TrakCare aktif: klik dua kali file buka-ipaw-offline.bat.',
          'Saat ada update aplikasi, download ulang file HTML dan ganti file lama — file .bat tidak perlu diganti.',
        ];
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <FileCode2 className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-bold">Download Aplikasi</h2>
              <Badge variant="secondary">Superuser Only</Badge>
            </div>
            <p className="text-muted-foreground text-sm -mt-4">
              Unduh file HTML mandiri yang dapat dijalankan secara penuh tanpa internet,
              beserta launcher khusus untuk mengaktifkan sinkronisasi TrakCare.
            </p>

            <div className="space-y-3">
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-5 h-5 text-primary" />
                      <span className="font-semibold text-base">ipaw.html</span>
                      <Badge variant="outline" className="text-xs">Wajib</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Aplikasi lengkap · Semua fitur · Berjalan 100% offline</p>
                    <p className="text-xs text-muted-foreground">Ukuran: ± 2 MB</p>
                  </div>
                  <a href={htmlFileUrl} download="ipaw.html">
                    <Button size="lg" className="gap-2 w-full sm:w-auto">
                      <Download className="w-5 h-5" /> Download HTML
                    </Button>
                  </a>
                </CardContent>
              </Card>

              <Card className="border-amber-300/60 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-950/20">
                <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      <span className="font-semibold text-base">buka-ipaw-offline.bat</span>
                      <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-300">Untuk TrakCare Sync</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Launcher Windows · Membuka Chrome dengan CORS bypass aktif</p>
                    <p className="text-xs text-muted-foreground">Diperlukan agar Sinkronisasi TrakCare bisa berjalan di versi offline</p>
                  </div>
                  <a href={batFileUrl} download="buka-ipaw-offline.bat">
                    <Button size="lg" variant="outline" className="gap-2 w-full sm:w-auto border-amber-400 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-600 dark:hover:bg-amber-950">
                      <Download className="w-5 h-5" /> Download BAT
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-none border-border">
              <CardHeader className="py-3 px-4 bg-muted/40 border-b border-border rounded-t-lg">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Info className="w-4 h-4" /> Cara Menggunakan
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                    <p className="text-sm">{step}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-none border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Apa yang dilakukan file .bat?
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  File <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">buka-ipaw-offline.bat</code> membuka Chrome dengan flag{' '}
                  <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">--disable-web-security</code> dan profil browser terpisah khusus untuk aplikasi ini.
                </p>
                <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1.5">
                  {[
                    'Gunakan window Chrome ini hanya untuk IP Admission Workspace — jangan untuk browsing internet.',
                    'Profil Chrome khusus dibuat di folder Temp, tidak akan mempengaruhi profil Chrome utama Anda.',
                    'File .bat hanya berjalan di Windows. Di Mac/Linux, gunakan file HTML langsung (tanpa TrakCare sync).',
                    'Jika Chrome tidak ditemukan otomatis, edit baris CHROME= di dalam file .bat sesuai lokasi instalasi.',
                  ].map((note, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><span>{note}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="shadow-none border-border bg-muted/30">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Info className="w-4 h-4" /> Catatan Umum</p>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  {[
                    'Data pasien tersimpan di browser komputer tersebut (IndexedDB), tidak ikut di file HTML.',
                    'Gunakan fitur Backup & Restore di tab Backup & Restore untuk memindahkan data antar komputer.',
                    'Gunakan Google Chrome atau Microsoft Edge — jangan Internet Explorer.',
                  ].map((note, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" /><span>{note}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {activeTab === 'sinkronisasi' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-500" /> Pengaturan Auto Sinkronisasi TrakCare
              </CardTitle>
              <CardDescription>
                Atur interval sinkronisasi otomatis data pasien dari TrakCare. Sinkronisasi manual tetap tersedia dari halaman Pasien Rawat Inap.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 max-w-md">
              <div className="space-y-3">
                <label className="text-sm font-semibold">Interval Sinkronisasi Otomatis</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'manual', label: 'Manual saja' },
                    { value: '5', label: 'Setiap 5 menit' },
                    { value: '10', label: 'Setiap 10 menit' },
                    { value: '15', label: 'Setiap 15 menit' },
                    { value: '30', label: 'Setiap 30 menit' },
                    { value: '60', label: 'Setiap 1 jam' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAutoSyncInterval(opt.value)}
                      className={`py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                        autoSyncInterval === opt.value
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'bg-background border-border text-foreground hover:border-blue-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {autoSyncInterval !== 'manual' && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
                  <b>Auto Sync Aktif</b> — Aplikasi akan otomatis mengambil data dari TrakCare setiap <b>{autoSyncInterval} menit</b> selama halaman Pasien Rawat Inap terbuka.
                </div>
              )}

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
                <b>Catatan:</b> Auto sync hanya aktif saat halaman Pasien Rawat Inap sedang dibuka. Data manual tidak akan terpengaruh oleh sinkronisasi otomatis.
              </div>

              <Button onClick={handleSaveSyncSettings} disabled={savingSync} className="gap-2">
                <Save className="w-4 h-4" />
                {savingSync ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Endpoint TrakCare</CardTitle>
              <CardDescription>URL sumber data yang sedang digunakan untuk sinkronisasi dan monitoring.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'Rawat Inap (Sinkronisasi)', value: epInpatient },
                { label: 'IGD (Monitoring SPRI)', value: epIGD },
                { label: 'Medical Discharge', value: epMedical },
                { label: 'Nurse Discharge', value: epNurse },
                { label: 'Pharmacy Discharge', value: epPharmacy },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <div className="bg-muted rounded-lg px-4 py-2 font-mono text-xs break-all text-muted-foreground">{value}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {user?.role === 'superuser' && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-primary" /> Konfigurasi URL Endpoint
                  <Badge variant="secondary" className="ml-1">Superuser</Badge>
                </CardTitle>
                <CardDescription>
                  Sesuaikan URL sumber data TrakCare. Kosongkan untuk menggunakan nilai default.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-2xl">
                {[
                  { label: 'URL Rawat Inap (Sinkronisasi Pasien)', val: epInpatient, set: setEpInpatient, def: DEFAULT_EP.inpatient },
                  { label: 'URL IGD (Monitoring Pasien SPRI)', val: epIGD, set: setEpIGD, def: DEFAULT_EP.igd },
                  { label: 'URL Medical Discharge', val: epMedical, set: setEpMedical, def: DEFAULT_EP.medicalDischarge },
                  { label: 'URL Nurse Discharge', val: epNurse, set: setEpNurse, def: DEFAULT_EP.nurseDischarge },
                  { label: 'URL Pharmacy Discharge', val: epPharmacy, set: setEpPharmacy, def: DEFAULT_EP.pharmacyDischarge },
                ].map(({ label, val, set, def }) => (
                  <div key={label} className="space-y-1.5">
                    <label className="text-sm font-semibold">{label}</label>
                    <div className="flex gap-2">
                      <Input
                        value={val}
                        onChange={e => set(e.target.value)}
                        placeholder={def}
                        className="font-mono text-xs"
                      />
                      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => set(def)}>
                        Reset
                      </Button>
                    </div>
                  </div>
                ))}
                <Button onClick={handleSaveEndpoints} disabled={savingEndpoints} className="gap-2 mt-2">
                  <Save className="w-4 h-4" />
                  {savingEndpoints ? 'Menyimpan...' : 'Simpan URL Endpoint'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Post-Restore Dialog */}
      <Dialog open={postRestoreOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" /> Restore Berhasil
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <PackageOpen className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <strong>Master Tarif dan Master Item tidak disertakan</strong> dalam file backup untuk menjaga ukuran file tetap kecil.
                  Silakan upload kembali data berikut:
                </p>
              </div>
              <ul className="pl-7 text-sm text-amber-700 dark:text-amber-400 space-y-1">
                {postRestoreMissingTarif && (
                  <li className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Master Tarif belum tersedia
                  </li>
                )}
                {postRestoreMissingItem && (
                  <li className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Master Item belum tersedia
                  </li>
                )}
              </ul>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
              <p>• Dashboard, Operan, Pengaturan, dan menu lainnya tetap dapat digunakan.</p>
              <p>• Menu Billing Checker dan Buat CP akan menampilkan peringatan apabila Master Tarif atau Master Item belum diupload.</p>
              <p>• Setelah upload selesai, seluruh fitur akan kembali aktif tanpa restore ulang.</p>
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            {(postRestoreMissingTarif || postRestoreMissingItem) && (
              <Button
                onClick={() => {
                  sessionStorage.setItem('ipaw_post_restore_tab', 'masterTarif');
                  setPostRestoreOpen(false);
                  setTimeout(() => window.location.reload(), 100);
                }}
                className="gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {postRestoreMissingTarif && postRestoreMissingItem
                  ? 'Upload Master Tarif & Item'
                  : postRestoreMissingTarif
                  ? 'Upload Master Tarif'
                  : 'Upload Master Item'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setPostRestoreOpen(false);
                setTimeout(() => window.location.reload(), 100);
              }}
            >
              Lewati
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Nama Modal */}
      <Dialog open={isEditNameOpen} onOpenChange={setIsEditNameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Nama Pengguna</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditName} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Username</label>
              <Input value={editNameTarget?.username ?? ''} disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Nama Lengkap Baru</label>
              <Input value={editNameValue} onChange={e => setEditNameValue(e.target.value)} required placeholder="Masukkan nama lengkap baru" />
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsEditNameOpen(false)}>Batal</Button>
              <Button type="submit">Simpan Nama</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add User Modal */}
      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Pengguna Baru</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Username</label>
              <Input value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Nama Lengkap</label>
              <Input value={newUser.namaLengkap} onChange={e => setNewUser({...newUser, namaLengkap: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Password</label>
              <Input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Konfirmasi Password</label>
              <Input type="password" value={newUser.confirmPassword} onChange={e => setNewUser({...newUser, confirmPassword: e.target.value})} required placeholder="Ulangi password" />
              {newUser.confirmPassword && newUser.password !== newUser.confirmPassword && (
                <p className="text-xs text-destructive">Password tidak cocok</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Role</label>
              <select className="w-full h-10 px-3 rounded-md border border-input bg-background" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                <option value="officer">Officer</option>
                <option value="superuser">Superuser / Admin</option>
              </select>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsAddUserOpen(false)}>Batal</Button>
              <Button type="submit">Simpan User</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}
