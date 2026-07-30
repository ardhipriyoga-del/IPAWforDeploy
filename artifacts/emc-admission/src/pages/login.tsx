import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { getDB } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { writeLog } from '../lib/writeLog';
import { restoreCloud } from '../lib/cloudSync';
import { useLocation } from 'wouter';
import { Eye, EyeOff, ShieldAlert, CloudDownload, Info } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const { login, user } = useAuth();
  const { rsLogo, rsName, refreshSettings } = useAppContext();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) setLocation('/');
  }, [user, setLocation]);

  useEffect(() => {
    let active = true;
    const restoreBeforeLogin = async () => {
      try {
        await restoreCloud();
        await refreshSettings();
        if (active) toast.success('Data Cloud berhasil dipulihkan.');
      } catch (error) {
        console.warn('[Login] Cloud restore failed:', error);
        if (active) {
          setRestoreFailed(true);
          toast.warning('Cloud tidak tersedia. Data lokal tetap digunakan.');
        }
      } finally {
        if (active) setRestoring(false);
      }
    };
    void restoreBeforeLogin();
    return () => { active = false; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (restoring) return;
    setLoading(true);
    try {
      const db = await getDB();
      const users = await db.getAll('users');
      const hashed = hashPassword(password);
      const found = users.find(u => u.username === username && u.passwordHash === hashed);
      if (found) {
        if (!found.aktif) {
          toast.error('Akun anda nonaktif. Hubungi Administrator.');
          await writeLog({
            modul: 'Login', aktivitas: 'Login Gagal',
            detail: `Akun nonaktif: ${username}`, status: 'Warning',
            overrideUser: { id: found.id!, username: found.username, namaUser: found.namaLengkap, role: found.role },
          });
          setLoading(false);
          return;
        }
        const userData = { id: found.id!, username: found.username, namaLengkap: found.namaLengkap, role: found.role };
        login(userData);
        await writeLog({
          modul: 'Login', aktivitas: 'Login Berhasil',
          detail: `Login berhasil sebagai ${found.role}`, status: 'Success',
          overrideUser: { id: found.id!, username: found.username, namaUser: found.namaLengkap, role: found.role },
        });
        toast.success(`Selamat datang, ${found.namaLengkap}`);
        setLocation('/');
      } else {
        toast.error('Username atau password salah.');
        await writeLog({
          modul: 'Login', aktivitas: 'Login Gagal',
          detail: `Username tidak ditemukan atau password salah: ${username}`, status: 'Failed',
        });
      }
    } catch (e: any) {
      toast.error('Terjadi kesalahan saat login.');
      await writeLog({
        modul: 'Login', aktivitas: 'Login Gagal',
        detail: `Error saat login: ${username}`, status: 'Failed',
        errorMessage: e?.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #26c6da 0%, #00acc1 50%, #0097a7 100%)' }}
    >
      {/* ── Card ── */}
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex" style={{ minHeight: '400px' }}>

        {/* ── Left panel — teal branding ── */}
        <div
          className="w-5/12 flex flex-col items-center justify-center p-10 gap-5 text-center"
          style={{ background: 'linear-gradient(160deg, #4dd8e6 0%, #26c6da 40%, #00acc1 100%)' }}
        >
          {/* Cross circle */}
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.25)' }}
          >
            {rsLogo ? (
              <img src={rsLogo} alt="Logo" className="w-14 h-14 object-contain" />
            ) : (
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                <rect x="4" y="18" width="40" height="12" rx="3" fill="white" />
                <rect x="18" y="4" width="12" height="40" rx="3" fill="white" />
              </svg>
            )}
          </div>

          {/* Title — satu baris, rata tengah */}
          <div className="space-y-1.5">
            <p className="text-xl font-bold text-white leading-snug">
              IP Admission Workspace
            </p>
            <p className="text-sm italic font-light text-white/85">
              We Care with Passion
            </p>
            {rsName && (
              <p className="text-white/70 text-sm font-medium mt-1">
                {rsName}
              </p>
            )}
          </div>
        </div>

        {/* ── Right panel — white form ── */}
        <div className="flex-1 bg-white flex flex-col justify-center px-10 py-10 gap-6">
          {/* Heading */}
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Log In</h1>
            <p className="text-sm text-gray-500 mt-1">
              Masukkan kredensial Anda untuk melanjutkan
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Username */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Username</label>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full border-0 border-b-2 border-gray-200 focus:border-[#00acc1] outline-none bg-transparent py-2 text-sm text-gray-800 placeholder-gray-400 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full border-0 border-b-2 border-gray-200 focus:border-[#00acc1] outline-none bg-transparent py-2 text-sm text-gray-800 placeholder-gray-400 transition-colors pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || restoring}
              className="w-full py-3 rounded-full text-sm font-bold text-white transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(90deg, #26c6da, #00acc1)' }}
            >
              {restoring ? 'Memulihkan Cloud...' : loading ? 'Memverifikasi...' : 'Submit'}
            </button>
          </form>

          {/* Status bawah */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            {restoring ? (
              <><CloudDownload className="w-3.5 h-3.5 animate-pulse text-[#00acc1]" /><span>Memulihkan data dari Cloud...</span></>
            ) : restoreFailed ? (
              <><ShieldAlert className="w-3.5 h-3.5 text-amber-400" /><span>Cloud tidak tersedia — data lokal digunakan</span></>
            ) : (
              <><Info className="w-3.5 h-3.5 text-[#00acc1]" /><span>Empowering Admission Teams</span></>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-center">
        <a
          href="https://wa.me/6281902616888"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/60 hover:text-white/90 text-xs transition-colors"
        >
          Developed by Dedi Supriadi
        </a>
      </div>
    </div>
  );
}
