import CryptoJS from 'crypto-js';
import { getDB } from './db';

export const hashPassword = (password: string) => {
  return CryptoJS.SHA256(password).toString();
};

export const initDefaultSettingsAndAdmin = async () => {
  const db = await getDB();
  
  // Settings
  const rsName = await db.get('settings', 'rsName');
  if (!rsName) {
    await db.put('settings', { key: 'rsName', value: 'RS EMC Pekayon' });
    await db.put('settings', { key: 'timeoutMins', value: 30 });
  }

  // Admin User
  const users = await db.getAll('users');
  if (users.length === 0) {
    await db.put('users', {
      username: 'admin',
      namaLengkap: 'Administrator',
      role: 'superuser',
      passwordHash: hashPassword('admin123@'),
      aktif: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
};

export const logActivity = async (
  userId: number,
  userName: string,
  action: string,
  entityType: string,
  entityId: string | number,
  detail: string
) => {
  const db = await getDB();
  const now = Date.now();
  const d = new Date(now);
  await db.put('activityLogs', {
    userId,
    username: userName,
    namaUser: userName,
    aktivitas: action,
    modul: entityType,
    detail: entityId ? `[${entityType}:${entityId}] ${detail}` : detail,
    timestamp: now,
    tanggal: d.toLocaleDateString('id-ID'),
    jam: d.toLocaleTimeString('id-ID'),
    role: 'officer' as const,
    noRM: '', episodeNo: '', namaPasien: '',
    oldValue: '', newValue: '',
    browser: '', device: '', os: '',
    status: 'Success' as const,
    keterangan: '', durasi: 0, errorCode: '', errorMessage: '',
  });
};

export const getCurrentShift = (): 'pagi' | 'sore' | 'malam' => {
  const hour = new Date().getHours();
  if (hour >= 7 && hour < 14) return 'pagi';
  if (hour >= 14 && hour < 21) return 'sore';
  return 'malam';
};

export const generateUUID = () => {
  return crypto.randomUUID();
};
