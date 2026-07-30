import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { getDB } from '../lib/db';
import { initDefaultSettingsAndAdmin } from '../lib/auth';
import { writeLog } from '../lib/writeLog';
import { backupCloud, syncUsersFromCloud } from '../lib/cloudSync';

interface AuthUser {
  id: number;
  username: string;
  namaLengkap: string;
  role: 'superuser' | 'officer';
}

interface AuthContextType {
  user: AuthUser | null;
  isInitialized: boolean;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
  updateSession: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutInProgress = useRef(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const init = async () => {
      await syncUsersFromCloud();   // tarik user terbaru dari cloud sebelum cek lokal
      await initDefaultSettingsAndAdmin();
      const storedSession = localStorage.getItem('emc_session');
      if (storedSession) {
        try {
          const session = JSON.parse(storedSession);
          const now = Date.now();
          // Read timeout setting from DB; 0 = disabled (never auto-expire)
          const db = await getDB();
          const timeoutSetting = await db.get('settings', 'timeoutMins');
          const timeoutMins: number = timeoutSetting?.value ?? 30;
          const expired = timeoutMins > 0
            ? now - session.lastActivity > timeoutMins * 60 * 1000
            : false;
          if (!expired) {
            setUser(session.user);
            session.lastActivity = now;
            localStorage.setItem('emc_session', JSON.stringify(session));
          } else {
            localStorage.removeItem('emc_session');
          }
        } catch {
          localStorage.removeItem('emc_session');
        }
      }
      setIsInitialized(true);
    };
    init();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const session = localStorage.getItem('emc_session');
      if (session) {
        const db = await getDB();
        const timeoutSetting = await db.get('settings', 'timeoutMins');
        const timeoutMins: number = timeoutSetting?.value ?? 30;
        // timeoutMins = 0 means disabled — skip check
        if (timeoutMins === 0) return;
        const parsed = JSON.parse(session);
        if (Date.now() - parsed.lastActivity > timeoutMins * 60 * 1000) {
          logout();
          window.alert("Sesi telah berakhir karena tidak ada aktivitas.");
        }
      }
    }, 60000); // check every minute
    return () => clearInterval(interval);
  }, []);

  const login = (userData: AuthUser) => {
    setUser(userData);
    localStorage.setItem('emc_session', JSON.stringify({
      user: userData,
      loginAt: Date.now(),
      lastActivity: Date.now()
    }));
  };

  const logout = async () => {
    if (logoutInProgress.current) return;

    logoutInProgress.current = true;
    setIsLoggingOut(true);

    try {
      // Log before clearing session so the logout event is included in the backup.
      await writeLog({
        modul: 'Login',
        aktivitas: 'Logout',
        detail: 'User logout dari sistem',
        status: 'Info',
      });

      // Logout backup is intentional and unconditional. It must not depend on
      // the optional periodic auto-backup setting.
      try {
        await backupCloud();
      } catch (error) {
        // A cloud outage must not leave the user trapped in the application.
        console.warn('[Auth] Logout cloud backup failed:', error);
      }
    } finally {
      setUser(null);
      localStorage.removeItem('emc_session');
      logoutInProgress.current = false;
      setIsLoggingOut(false);
      setLocation('/login');
    }
  };

  const updateSession = () => {
    const session = localStorage.getItem('emc_session');
    if (session) {
      const parsed = JSON.parse(session);
      parsed.lastActivity = Date.now();
      localStorage.setItem('emc_session', JSON.stringify(parsed));
    }
  };

  return (
      <AuthContext.Provider value={{ user, isInitialized, login, logout, isLoggingOut, updateSession }}>
      <div onClick={updateSession} onKeyDown={updateSession}>
        {children}
      </div>
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
