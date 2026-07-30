import React from 'react';
import { Download, FileCode2, HardDrive, Info, CheckCircle2, Terminal, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DownloadPage() {

  const htmlFileUrl = `${import.meta.env.BASE_URL}ipaw.html`;
  const htmlDownloadName = 'ipaw.html';
  const batFileUrl  = `${import.meta.env.BASE_URL}buka-ipaw-offline.bat`;

  const steps = [
    'Download kedua file di bawah (HTML + BAT) ke folder yang sama, misalnya D:\\IPAW\\.',
    'Untuk membuka aplikasi biasa (tanpa sinkronisasi TrakCare): klik dua kali file HTML langsung di Chrome.',
    'Untuk membuka dengan sinkronisasi TrakCare aktif: klik dua kali file buka-ipaw-offline.bat.',
    'Seluruh fitur tersedia di versi offline: Dashboard, Pasien Rawat Inap, Pending Operan, Riwayat Pasien, Kasir, Laporan, Master Tarif, Cloud Backup, Log Aktivitas, dan Pengaturan.',
    'Saat ada update aplikasi, download ulang file HTML dan ganti file lama — file .bat tidak perlu diganti.',
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FileCode2 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Download Aplikasi</h1>
          <Badge variant="secondary" className="ml-1">Offline</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Unduh file HTML mandiri yang dapat dijalankan secara penuh tanpa internet — mencakup semua fitur:
          Dashboard, Pasien Rawat Inap, Pending Operan, Riwayat Pasien, Kasir, Laporan, Master Tarif,
          Backup Cloud, Log Aktivitas (Audit Trail), dan Sinkronisasi TrakCare.
          Tersedia juga launcher khusus untuk mengaktifkan sinkronisasi TrakCare di versi offline.
        </p>
      </div>

      {/* Download Cards */}
      <div className="space-y-3">

        {/* HTML File */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-primary" />
                <span className="font-semibold text-base">ipaw.html</span>
                <Badge variant="outline" className="text-xs">Wajib</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Aplikasi lengkap · Semua fitur termasuk Master Tarif, Cloud Backup & Log Aktivitas · Berjalan 100% offline
              </p>
              <p className="text-xs text-muted-foreground">Ukuran: ± 2 MB</p>
            </div>
            <a href={htmlFileUrl} download={htmlDownloadName}>
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                <Download className="w-5 h-5" />
                Download HTML
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* BAT File */}
        <Card className="border-amber-300/60 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-950/20">
          <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold text-base">buka-ipaw-offline.bat</span>
                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-300">
                  Untuk TrakCare Sync
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Launcher Windows · Membuka Chrome dengan CORS bypass aktif
              </p>
              <p className="text-xs text-muted-foreground">
                Diperlukan agar Sinkronisasi TrakCare bisa berjalan di versi offline
              </p>
            </div>
            <a href={batFileUrl} download="buka-ipaw-offline.bat">
              <Button size="lg" variant="outline" className="gap-2 w-full sm:w-auto border-amber-400 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-600 dark:hover:bg-amber-950">
                <Download className="w-5 h-5" />
                Download BAT
              </Button>
            </a>
          </CardContent>
        </Card>

      </div>

      {/* Cara Pakai */}
      <Card className="shadow-none border-border">
        <CardHeader className="py-3 px-4 bg-muted/40 border-b border-border rounded-t-lg">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Info className="w-4 h-4" /> Cara Menggunakan
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm">{step}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Penjelasan BAT */}
      <Card className="shadow-none border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Apa yang dilakukan file .bat?
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            File <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">buka-ipaw-offline.bat</code> membuka Chrome dengan flag{' '}
            <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">--disable-web-security</code> dan profil browser terpisah
            (<code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">ChromeIPAW_Profile</code>) khusus untuk aplikasi ini.
            Ini memungkinkan aplikasi mengakses endpoint TrakCare langsung dari file lokal tanpa hambatan CORS.
          </p>
          <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1.5">
            {[
              'Gunakan window Chrome ini hanya untuk IP Admission Workspace — jangan untuk browsing internet.',
              'Profil Chrome khusus dibuat di folder Temp, tidak akan mempengaruhi profil Chrome utama Anda.',
              'File .bat hanya berjalan di Windows. Di Mac/Linux, gunakan file HTML langsung (tanpa TrakCare sync).',
              'Jika Chrome tidak ditemukan otomatis, edit baris CHROME= di dalam file .bat sesuai lokasi instalasi.',
            ].map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Catatan Umum */}
      <Card className="shadow-none border-border bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Info className="w-4 h-4" /> Catatan Umum
          </p>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            {[
              'Data pasien tersimpan di browser komputer tersebut (IndexedDB), tidak ikut di file HTML.',
              'Gunakan fitur Backup & Restore di menu Pengaturan untuk memindahkan data antar komputer.',
              'Gunakan Google Chrome atau Microsoft Edge — jangan Internet Explorer.',
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
  );
}
