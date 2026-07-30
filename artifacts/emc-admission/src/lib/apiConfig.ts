/**
 * API Base URL configuration.
 *
 * URL API dipisahkan dari URL aplikasi agar frontend yang di-host secara statis
 * (Netlify, Vercel, dsb.) tetap bisa memanggil Express API server yang
 * di-deploy di tempat lain (Railway, Render, VPS, dsb.).
 *
 * Priority:
 *  1. VITE_API_BASE_URL  — set saat build untuk Netlify/production
 *     Contoh: VITE_API_BASE_URL=https://api.ipaw.example.com
 *  2. String kosong      — URL relatif, bekerja di local dev (same origin)
 *
 * JANGAN gunakan window.location.origin sebagai base URL API.
 * Gunakan variabel ini sebagai satu-satunya sumber kebenaran.
 */

// Injected at build time by vite.config.ts `define`. True only on Replit
// (dev or production), where the shared Express proxy is available at /api/.
// On Netlify static builds the value is false — app calls GAS directly.
declare const __IS_REPLIT__: boolean;

export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return envUrl.trim().replace(/\/$/, ''); // hapus trailing slash
}

/**
 * Bangun URL API absolut dari path relatif, misal:
 *   apiUrl('/api/cloud/status') → '' + '/api/cloud/status'  (local)
 *                              → 'https://api.example.com/api/cloud/status' (prod)
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Deteksi apakah API proxy tersedia (Express server atau Netlify Functions).
 *
 * Proxy tersedia jika:
 *  - VITE_API_BASE_URL dikonfigurasi (API server eksternal), ATAU
 *  - VITE_HAS_API_PROXY=true di-set saat build (misal via Netlify Functions), ATAU
 *  - Build dilakukan di dalam Replit (__IS_REPLIT__ = true)
 *
 * Mode Netlify static (tanpa VITE_API_BASE_URL) → false → panggil GAS langsung.
 * Mode file:// (offline standalone HTML) → false.
 *
 * Catatan: Dulu menggunakan window.location.protocol === 'https:' sebagai fallback,
 * tetapi ini SALAH untuk Netlify (https:// tapi tidak ada /api/ di sana).
 * Sekarang menggunakan build-time constant __IS_REPLIT__ yang di-inject vite.
 */
export function hasApiProxy(): boolean {
  // Explicit external API server (misal Railway/Render)
  if (getApiBaseUrl() !== '') return true;

  // Explicit flag dari Netlify Functions atau konfigurasi build lain
  if ((import.meta.env.VITE_HAS_API_PROXY as string | undefined) === 'true') return true;

  if (typeof window === 'undefined') return false;

  // Mode file:// (offline standalone HTML) → tidak ada proxy
  if (window.location.protocol === 'file:') return false;

  // Replit dev atau Replit production — shared Express proxy tersedia di /api/
  try {
    return Boolean(__IS_REPLIT__);
  } catch {
    return false;
  }
}

/**
 * Deteksi apakah proxy TrakCare tersedia — yaitu server yang BISA menjangkau
 * jaringan internal RS (apps.emc.id, appsprn.emc.id).
 *
 * PENTING: Berbeda dari hasApiProxy()!
 * Netlify Functions berjalan di server internet → TIDAK BISA menjangkau
 * jaringan internal RS. Maka VITE_HAS_API_PROXY=true (untuk fitur AI/Cloud)
 * TIDAK boleh mengaktifkan proxy TrakCare.
 *
 * Proxy TrakCare hanya aktif jika:
 *  - VITE_API_BASE_URL dikonfigurasi (server internal/eksternal yg bisa akses RS), ATAU
 *  - VITE_TRAKCARE_HAS_PROXY=true (set secara eksplisit untuk internal server), ATAU
 *  - Replit (__IS_REPLIT__ = true) — Express berjalan di server yg sama.
 *
 * Jika false → browser melakukan direct fetch ke TrakCare.
 * Ini bekerja jika pengguna terhubung ke jaringan internal RS EMC.
 */
export function hasTrakCareProxy(): boolean {
  // HANYA aktif jika ada server eksternal/internal yang BISA menjangkau jaringan RS.
  //
  // ⚠️  __IS_REPLIT__ TIDAK digunakan di sini — Express server Replit berjalan di
  //     cloud internet dan tidak bisa resolve domain internal RS (apps.emc.id,
  //     appsprn.emc.id). Browser pengguna yang di jaringan RS lebih andal.
  //
  // Cara mengaktifkan proxy TrakCare:
  //   Opsi 1 — Server eksternal/internal:
  //     set VITE_API_BASE_URL=https://api-internal.rs-emc.id di Netlify/build env
  //   Opsi 2 — Flag eksplisit:
  //     set VITE_TRAKCARE_HAS_PROXY=true (hanya jika ada server yg bisa akses RS)

  // Explicit external server dikonfigurasi → pakai proxy
  if (getApiBaseUrl() !== '') return true;

  // Flag eksplisit untuk server internal yang bisa menjangkau TrakCare
  if ((import.meta.env.VITE_TRAKCARE_HAS_PROXY as string | undefined) === 'true') return true;

  // Semua kondisi lain (Replit dev, Netlify, local dev) → direct browser fetch
  return false;
}
