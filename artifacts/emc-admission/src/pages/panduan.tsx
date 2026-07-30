import React, { useState } from 'react';
import {
  LayoutDashboard, Users, Clock, History, RefreshCw, FileBarChart,
  Receipt, Settings, FileSpreadsheet, Download, Upload, BookOpen,
  ChevronRight, Info, AlertTriangle, Lightbulb, CheckCircle2,
  Search, Plus, Pencil, Trash2, FileDown, Send, Eye, RotateCcw,
  Shield, Database, UserCog, Wifi, WifiOff, FileText, Bell,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Step {
  text: string;
  sub?: string[];
}
interface TipBlock {
  kind: 'tip' | 'warning' | 'info';
  text: string;
}
interface Section {
  title: string;
  steps?: Step[];
  tips?: TipBlock[];
  text?: string;
}
interface Module {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  description: string;
  sections: Section[];
}

/* ─────────────────────────────────────────────
   Panduan content
───────────────────────────────────────────── */
const MODULES: Module[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="w-4 h-4" />,
    description: 'Halaman utama yang menampilkan ringkasan operasional admission secara real-time.',
    sections: [
      {
        title: 'Membaca Kartu Statistik',
        steps: [
          { text: 'Kartu Pasien Aktif — jumlah pasien rawat inap yang masih berstatus aktif.' },
          { text: 'Kartu Pending Operan — jumlah tugas yang belum diselesaikan dari shift sebelumnya.' },
          { text: 'Kartu Pasien IGD — pasien dari IGD yang terpantau oleh TrakCare Sync.' },
          { text: 'Kartu Rencana Pulang — pasien yang dijadwalkan pulang hari ini.' },
        ],
      },
      {
        title: 'Panel Sinkronisasi TrakCare',
        steps: [
          { text: 'Status koneksi (Online/Offline) ditampilkan di pojok kanan atas.' },
          { text: 'Klik tombol Sync untuk memperbarui data pasien dari TrakCare secara manual.' },
          { text: 'Waktu sinkronisasi terakhir ditampilkan di bawah tombol.' },
        ],
        tips: [
          { kind: 'tip', text: 'Dashboard diperbarui otomatis setiap beberapa menit selama aplikasi terbuka dan ada koneksi.' },
        ],
      },
    ],
  },
  {
    id: 'patients',
    label: 'Pasien Rawat Inap',
    icon: <Users className="w-4 h-4" />,
    description: 'Modul inti untuk mengelola seluruh data pasien rawat inap — dari pendaftaran hingga pemulangan.',
    sections: [
      {
        title: 'Menambah Pasien Baru',
        steps: [
          { text: 'Klik tombol + Tambah Pasien di sudut kanan atas.' },
          { text: 'Isi formulir: No. RM, Nama Pasien, Tanggal Masuk, Ruangan, Kelas, Diagnosa, Dokter, dan Jaminan.' },
          { text: 'Klik Simpan untuk menyimpan data — pasien akan muncul di daftar dengan status Aktif.' },
        ],
        tips: [
          { kind: 'tip', text: 'Data pasien dari TrakCare dapat disinkronkan otomatis — klik tombol Sync TrakCare untuk mengimpor tanpa mengetik manual.' },
        ],
      },
      {
        title: 'Mencari dan Memfilter Pasien',
        steps: [
          { text: 'Gunakan kotak pencarian untuk mencari berdasarkan nama atau nomor RM.' },
          { text: 'Filter berdasarkan ruangan, kelas, atau jaminan menggunakan dropdown filter.' },
          { text: 'Klik header kolom untuk mengurutkan data.' },
        ],
      },
      {
        title: 'Mengedit Data Pasien',
        steps: [
          { text: 'Klik ikon Pensil (Edit) pada baris pasien yang ingin diubah.' },
          { text: 'Perbarui field yang diperlukan, lalu klik Simpan.' },
        ],
      },
      {
        title: 'Memulangkan Pasien',
        steps: [
          { text: 'Klik ikon aksi pada baris pasien, lalu pilih Pulangkan.' },
          { text: 'Isi tanggal dan jam pulang, serta catatan jika diperlukan.' },
          { text: 'Status pasien akan berubah menjadi Pulang dan dipindah ke Riwayat.' },
        ],
        tips: [
          { kind: 'warning', text: 'Pasien yang sudah dipulangkan tidak dapat diedit. Pastikan data sudah benar sebelum mengkonfirmasi.' },
        ],
      },
      {
        title: 'Sinkronisasi TrakCare',
        steps: [
          { text: 'Pastikan perangkat terhubung ke jaringan RS.' },
          { text: 'Klik Sync TrakCare — aplikasi akan menarik data pasien aktif dari sistem TrakCare.' },
          { text: 'Data baru akan ditandai dengan badge "Baru dari TrakCare" agar mudah dikenali.' },
          { text: 'Konfirmasi data sebelum disimpan ke database lokal.' },
        ],
        tips: [
          { kind: 'info', text: 'Sync hanya membaca data dari TrakCare — tidak menulis atau mengubah data di sistem TrakCare.' },
        ],
      },
    ],
  },
  {
    id: 'pending',
    label: 'Pending Operan',
    icon: <Clock className="w-4 h-4" />,
    description: 'Manajemen tugas yang belum terselesaikan dan perlu dilanjutkan shift berikutnya.',
    sections: [
      {
        title: 'Menambah Pending Baru',
        steps: [
          { text: 'Klik tombol + Tambah Pending.' },
          { text: 'Isi nama pasien atau nomor RM, jenis tugas, prioritas (Normal / Mendesak), dan keterangan.' },
          { text: 'Klik Simpan — pending muncul di daftar dengan status Menunggu.' },
        ],
      },
      {
        title: 'Mengelola Status Pending',
        steps: [
          { text: 'Status Menunggu → Diproses: klik tombol Proses saat tugas sedang dikerjakan.' },
          { text: 'Status Diproses → Selesai: klik Selesai setelah tugas tuntas.' },
          { text: 'Pending yang sudah Selesai secara otomatis tersimpan ke riwayat.' },
        ],
        tips: [
          { kind: 'warning', text: 'Pending dengan prioritas Mendesak ditampilkan di urutan paling atas — tangani terlebih dahulu.' },
        ],
      },
      {
        title: 'Filter dan Pencarian',
        steps: [
          { text: 'Gunakan filter Status untuk melihat hanya yang Menunggu, Diproses, atau Selesai.' },
          { text: 'Cari berdasarkan nama pasien atau keterangan tugas via kotak pencarian.' },
        ],
      },
    ],
  },
  {
    id: 'history',
    label: 'Riwayat Pasien',
    icon: <History className="w-4 h-4" />,
    description: 'Arsip seluruh pasien yang sudah pulang dan riwayat operan shift yang sudah selesai.',
    sections: [
      {
        title: 'Mencari Riwayat',
        steps: [
          { text: 'Ketik nama pasien atau nomor RM di kotak pencarian.' },
          { text: 'Filter berdasarkan rentang tanggal masuk atau tanggal pulang.' },
          { text: 'Filter berdasarkan ruangan, dokter, atau jaminan.' },
        ],
      },
      {
        title: 'Melihat Detail Riwayat',
        steps: [
          { text: 'Klik baris pasien untuk membuka detail lengkap — diagnosa, dokter, kelas, tindakan, dan catatan.' },
          { text: 'Tab Riwayat Operan menampilkan semua handover shift yang pernah dicatat untuk pasien tersebut.' },
        ],
        tips: [
          { kind: 'info', text: 'Data riwayat tersimpan lokal di perangkat — tidak akan hilang meski offline selama tidak ada reset database.' },
        ],
      },
    ],
  },
  {
    id: 'sync-history',
    label: 'Riwayat Sinkronisasi',
    icon: <RefreshCw className="w-4 h-4" />,
    description: 'Log lengkap setiap sesi sinkronisasi dengan TrakCare — berapa data ditarik, berhasil atau gagal.',
    sections: [
      {
        title: 'Membaca Log Sinkronisasi',
        steps: [
          { text: 'Setiap baris mewakili satu sesi sync — menampilkan waktu, jumlah data ditarik, dan status.' },
          { text: 'Status Berhasil (hijau): data berhasil diambil dari TrakCare.' },
          { text: 'Status Gagal (merah): koneksi bermasalah atau TrakCare tidak merespons.' },
          { text: 'Klik baris untuk melihat detail data apa saja yang disinkronkan.' },
        ],
        tips: [
          { kind: 'tip', text: 'Jika sering muncul status Gagal, periksa koneksi jaringan RS atau konfirmasi ke IT apakah endpoint TrakCare aktif.' },
        ],
      },
    ],
  },
  {
    id: 'reports',
    label: 'Laporan',
    icon: <FileBarChart className="w-4 h-4" />,
    description: 'Generate laporan PDF operan dan pending berdasarkan rentang tanggal yang dipilih.',
    sections: [
      {
        title: 'Membuat Laporan PDF',
        steps: [
          { text: 'Pilih jenis laporan: Operan Harian, Rekap Pending, atau Laporan Gabungan.' },
          { text: 'Tentukan rentang tanggal (Dari — Sampai).' },
          { text: 'Pilih filter tambahan jika diperlukan (ruangan, shift, status).' },
          { text: 'Klik Buat Laporan — pratinjau PDF akan muncul di layar.' },
          { text: 'Klik Unduh PDF untuk menyimpan file ke perangkat.' },
        ],
        tips: [
          { kind: 'tip', text: 'Laporan dapat dicetak langsung dari browser dengan Ctrl+P setelah pratinjau muncul.' },
          { kind: 'info', text: 'Laporan dihasilkan sepenuhnya dari data lokal — tidak membutuhkan koneksi internet.' },
        ],
      },
    ],
  },
  {
    id: 'kasir',
    label: 'Pesan Kasir',
    icon: <Receipt className="w-4 h-4" />,
    description: 'Generate pesan terformat untuk koordinasi dengan kasir via WhatsApp atau media lain.',
    sections: [
      {
        title: 'Membuat Pesan Kasir',
        steps: [
          { text: 'Pilih pasien dari daftar atau cari berdasarkan nama / nomor RM.' },
          { text: 'Sistem otomatis mengisi data pasien: nama, ruangan, kelas, jaminan, dokter.' },
          { text: 'Tambahkan catatan khusus jika diperlukan (misal: permintaan rincian biaya, cicilan, dll.).' },
          { text: 'Klik Salin Pesan — teks terformat langsung tersalin ke clipboard.' },
          { text: 'Tempelkan (paste) ke WhatsApp atau aplikasi pesan lainnya.' },
        ],
        tips: [
          { kind: 'tip', text: 'Format pesan sudah disesuaikan agar mudah dibaca kasir — pastikan data pasien sudah lengkap sebelum disalin.' },
        ],
      },
    ],
  },
  {
    id: 'master-tarif',
    label: 'Master Tarif',
    icon: <FileSpreadsheet className="w-4 h-4" />,
    description: 'Import dan kelola daftar tarif layanan RS dari file Excel untuk digunakan di fitur estimasi biaya.',
    sections: [
      {
        title: 'Mengakses Master Tarif',
        steps: [
          { text: 'Buka menu Pengaturan di sidebar.' },
          { text: 'Pilih tab Master Tarif.' },
        ],
      },
      {
        title: 'Import Tarif dari Excel',
        steps: [
          { text: 'Siapkan file Excel (.xlsx) dengan format: kolom Kode, Nama Layanan, Tarif, Kelas, Kategori.' },
          { text: 'Klik tombol Import Excel dan pilih file dari perangkat.' },
          { text: 'Pratinjau data akan muncul — periksa apakah kolom sudah terpetakan dengan benar.' },
          { text: 'Klik Simpan untuk menyimpan semua tarif ke database lokal.' },
        ],
        tips: [
          { kind: 'warning', text: 'Import baru akan menimpa data tarif yang sudah ada. Pastikan file Excel sudah final sebelum diimport.' },
          { kind: 'tip', text: 'Gunakan file Excel dari sistem billing RS sebagai sumber utama agar data tarif selalu akurat.' },
        ],
      },
      {
        title: 'Mengaktifkan / Menonaktifkan Tarif',
        steps: [
          { text: 'Cari tarif menggunakan kotak pencarian.' },
          { text: 'Klik toggle Aktif/Nonaktif pada kolom status untuk mengubah ketersediaan tarif.' },
          { text: 'Tarif nonaktif tidak akan muncul di pilihan estimasi biaya.' },
        ],
      },
      {
        title: 'Menghapus Semua Tarif',
        steps: [
          { text: 'Klik tombol Hapus Semua di bagian bawah halaman.' },
          { text: 'Konfirmasi penghapusan — seluruh data tarif akan dihapus dari database lokal.' },
        ],
        tips: [
          { kind: 'warning', text: 'Hapus Semua tidak dapat diurungkan. Lakukan backup terlebih dahulu jika ragu.' },
        ],
      },
    ],
  },
  {
    id: 'import',
    label: 'Import Data',
    icon: <Upload className="w-4 h-4" />,
    description: 'Import data pasien dan catatan operasional dari file Excel ke dalam database lokal aplikasi.',
    sections: [
      {
        title: 'Import Data dari Excel',
        steps: [
          { text: 'Buka menu Pengaturan → tab Import Data.' },
          { text: 'Pilih jenis data yang akan diimport: Pasien, Pending, atau Operan.' },
          { text: 'Klik Pilih File Excel dan pilih file dari perangkat (.xlsx).' },
          { text: 'Pratinjau data akan muncul — verifikasi jumlah baris dan kolom.' },
          { text: 'Klik Import untuk memasukkan data ke database lokal.' },
        ],
        tips: [
          { kind: 'info', text: 'Gunakan template Excel yang sesuai agar kolom terpetakan dengan benar. Template dapat diunduh dari halaman Import.' },
          { kind: 'warning', text: 'Data duplikat (berdasarkan No. RM dan tanggal masuk) akan dilewati secara otomatis.' },
        ],
      },
    ],
  },
  {
    id: 'settings',
    label: 'Pengaturan',
    icon: <Settings className="w-4 h-4" />,
    description: 'Konfigurasi aplikasi, manajemen pengguna, backup & restore, dan pengaturan sinkronisasi.',
    sections: [
      {
        title: 'Profil & Informasi RS',
        steps: [
          { text: 'Buka tab Profil untuk mengubah nama RS, logo, dan informasi institusi.' },
          { text: 'Upload logo RS dalam format PNG/JPG — akan ditampilkan di halaman login, about, dan footer.' },
          { text: 'Klik Simpan setelah selesai mengubah.' },
        ],
      },
      {
        title: 'Sesi & Keamanan',
        steps: [
          { text: 'Atur durasi sesi login otomatis (berapa menit aplikasi akan logout otomatis saat tidak aktif).' },
          { text: 'Aktifkan atau nonaktifkan konfirmasi logout.' },
          { text: 'Klik Simpan Pengaturan Sesi.' },
        ],
      },
      {
        title: 'Sinkronisasi TrakCare',
        steps: [
          { text: 'Masukkan URL endpoint TrakCare yang diberikan oleh tim IT RS.' },
          { text: 'Atur interval sinkronisasi otomatis (dalam menit).' },
          { text: 'Klik Simpan — sinkronisasi akan berjalan sesuai jadwal.' },
        ],
        tips: [
          { kind: 'info', text: 'Pengaturan sinkronisasi tersimpan lokal di perangkat. Setiap komputer perlu dikonfigurasi sendiri.' },
        ],
      },
      {
        title: 'Backup Data',
        steps: [
          { text: 'Buka tab Backup & Restore.' },
          { text: 'Klik Export Database — file Excel (.xlsx) akan diunduh berisi seluruh data operasional.' },
          { text: 'Simpan file backup di lokasi aman (drive eksternal, cloud storage, dll.).' },
        ],
        tips: [
          { kind: 'tip', text: 'Lakukan backup minimal seminggu sekali, atau sebelum melakukan import / restore data besar.' },
          { kind: 'info', text: 'File backup tidak menyertakan Master Tarif agar ukuran file tetap kecil.' },
        ],
      },
      {
        title: 'Restore Data',
        steps: [
          { text: 'Buka tab Backup & Restore → klik Import / Restore.' },
          { text: 'Pilih file backup (.xlsx) yang sebelumnya diekspor dari aplikasi ini.' },
          { text: 'Konfirmasi — data saat ini akan ditimpa oleh data dari file backup.' },
        ],
        tips: [
          { kind: 'warning', text: 'Restore akan menimpa SEMUA data saat ini (kecuali Master Tarif). Pastikan Anda yakin sebelum melanjutkan.' },
        ],
      },
      {
        title: 'Manajemen User (Superuser)',
        steps: [
          { text: 'Buka tab Master User — hanya tersedia untuk akun Superuser.' },
          { text: 'Klik + Tambah User, isi username, nama lengkap, password, dan pilih role (Officer / Superuser).' },
          { text: 'Untuk mengubah password user, klik ikon edit pada baris user.' },
          { text: 'Untuk menghapus user, klik ikon hapus — konfirmasi akan ditampilkan.' },
        ],
        tips: [
          { kind: 'warning', text: 'Minimal harus ada satu akun Superuser yang aktif. Tidak bisa menghapus akun Superuser terakhir.' },
        ],
      },
      {
        title: 'Download Aplikasi (Superuser)',
        steps: [
          { text: 'Buka tab Download Aplikasi — hanya tersedia untuk akun Superuser.' },
          { text: 'Unduh file HTML mandiri untuk digunakan secara offline di komputer lain.' },
          { text: 'Unduh juga file .bat untuk menjalankan dengan sinkronisasi TrakCare aktif (Windows only).' },
        ],
      },
    ],
  },
  {
    id: 'offline',
    label: 'Penggunaan Offline',
    icon: <WifiOff className="w-4 h-4" />,
    description: 'Cara menggunakan aplikasi secara penuh tanpa koneksi internet menggunakan file HTML mandiri.',
    sections: [
      {
        title: 'Menjalankan Aplikasi Offline',
        steps: [
          { text: 'Unduh file ipaw.html dari menu Pengaturan → Download Aplikasi (Superuser).' },
          { text: 'Simpan file di folder yang mudah diakses, misalnya D:\\IPAW\\.' },
          { text: 'Untuk penggunaan biasa: klik dua kali file HTML → akan terbuka di Chrome.' },
          { text: 'Untuk sinkronisasi TrakCare: klik dua kali file buka-ipaw-offline.bat (Windows only).' },
        ],
        tips: [
          { kind: 'info', text: 'Semua data tersimpan di IndexedDB browser — data tetap ada meski browser ditutup dan dibuka kembali selama menggunakan browser yang sama.' },
          { kind: 'warning', text: 'Jangan hapus cache/data browser atau data aplikasi akan hilang. Selalu lakukan backup rutin.' },
        ],
      },
      {
        title: 'Update Versi Offline',
        steps: [
          { text: 'Saat ada versi baru, Superuser mengunduh file HTML terbaru dari server.' },
          { text: 'Ganti file HTML lama dengan yang baru di folder yang sama.' },
          { text: 'File .bat tidak perlu diganti — tetap dapat digunakan.' },
          { text: 'Data lokal di browser tidak terpengaruh oleh update file HTML.' },
        ],
        tips: [
          { kind: 'tip', text: 'Versi aplikasi dapat dilihat di menu Tentang Aplikasi (About). Bandingkan dengan versi di server untuk mengetahui apakah ada update.' },
        ],
      },
      {
        title: 'Perbedaan Mode Online vs Offline',
        text: 'Mode Online (akses via browser ke server): mendapatkan sinkronisasi TrakCare otomatis, pembaruan real-time antar perangkat, dan tidak perlu update file manual. Mode Offline (file HTML lokal): berjalan tanpa internet, data tersimpan di perangkat masing-masing, sinkronisasi TrakCare memerlukan file .bat dan koneksi jaringan RS.',
      },
    ],
  },
];

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */
function TipBox({ kind, text }: TipBlock) {
  const styles = {
    tip: {
      wrapper: 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300',
      icon: <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />,
      label: 'Tips',
    },
    warning: {
      wrapper: 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300',
      icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />,
      label: 'Perhatian',
    },
    info: {
      wrapper: 'bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300',
      icon: <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />,
      label: 'Info',
    },
  }[kind];

  return (
    <div className={`flex gap-2 rounded-md px-3 py-2 text-xs ${styles.wrapper}`}>
      {styles.icon}
      <div>
        <span className="font-semibold">{styles.label}: </span>
        {text}
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <ChevronRight className="w-3.5 h-3.5 text-primary" />
        {section.title}
      </h3>
      {section.text && (
        <p className="text-sm text-muted-foreground leading-relaxed pl-5">{section.text}</p>
      )}
      {section.steps && (
        <ol className="pl-5 space-y-1.5">
          {section.steps.map((step, i) => (
            <li key={i} className="text-sm text-muted-foreground">
              <span className="inline-flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">
                  {step.text}
                  {step.sub && (
                    <ul className="mt-1 ml-2 space-y-0.5 list-disc list-inside text-xs text-muted-foreground/80">
                      {step.sub.map((s, j) => <li key={j}>{s}</li>)}
                    </ul>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {section.tips && (
        <div className="pl-5 space-y-1.5">
          {section.tips.map((tip, i) => <TipBox key={i} {...tip} />)}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Page
───────────────────────────────────────────── */
export default function PanduanPage() {
  const [activeId, setActiveId] = useState(MODULES[0].id);
  const active = MODULES.find(m => m.id === activeId)!;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar nav ── */}
      <nav className="w-56 shrink-0 border-r bg-muted/30 overflow-y-auto p-2 space-y-0.5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-2">
          Modul
        </p>
        {MODULES.map(mod => (
          <button
            key={mod.id}
            onClick={() => setActiveId(mod.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors
              ${activeId === mod.id
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            <span className="shrink-0">{mod.icon}</span>
            <span className="truncate">{mod.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-5">

          {/* Header */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-primary">{active.icon}</span>
              <h1 className="text-xl font-bold">{active.label}</h1>
              {active.badge && (
                <Badge variant={active.badgeVariant ?? 'secondary'}>{active.badge}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{active.description}</p>
          </div>

          <hr className="border-border" />

          {/* Sections */}
          <div className="space-y-6">
            {active.sections.map((sec, i) => (
              <SectionBlock key={i} section={sec} />
            ))}
          </div>

          {/* Footer note */}
          <div className="pt-4 flex items-center gap-2 text-xs text-muted-foreground/60">
            <BookOpen className="w-3.5 h-3.5" />
            <span>IP Admission Workspace — Panduan Penggunaan</span>
          </div>
        </div>
      </main>
    </div>
  );
}
