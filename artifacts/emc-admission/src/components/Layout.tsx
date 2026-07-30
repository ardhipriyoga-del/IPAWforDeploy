import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import {
  LayoutDashboard, Users, Clock, History,
  FileBarChart, Settings, LogOut, Moon, Sun, Menu, Info, MessageSquare,
  RefreshCw, BookOpen, CloudCog, ClipboardList, Loader2, Sparkles, Bell,
  UserCircle2, HelpCircle, ChevronDown, ShieldCheck, Activity,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── Avatar initials helper ────────────────────────────────────────────────────
function getInitials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Role badge colour (subtle)
const ROLE_COLOR: Record<string, string> = {
  admin:   'bg-violet-500',
  dokter:  'bg-blue-500',
  perawat: 'bg-teal-500',
  kasir:   'bg-amber-500',
};
function avatarBg(role: string | undefined): string {
  return ROLE_COLOR[role?.toLowerCase() ?? ''] ?? 'bg-primary';
}

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout, isLoggingOut } = useAuth();
  const { rsName, rsLogo } = useAppContext();
  const { theme, setTheme } = useTheme();
  const [location, navigate] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  const menuGroups = [
    {
      label: 'Operasional',
      items: [
        { path: '/',               label: 'Dashboard',            icon: LayoutDashboard },
        { path: '/patients',       label: 'Pasien Rawat Inap',    icon: Users },
        { path: '/monitoring-ktm', label: 'Monitoring KTM',       icon: Bell },
        { path: '/pending',        label: 'Pending Operan',       icon: Clock },
        { path: '/kasir',          label: 'Pesan Kasir',          icon: MessageSquare },
        { path: '/billing-checker', label: 'Billing Checker',      icon: ShieldCheck },
        { path: '/igd-ward',        label: 'IGD Ward',             icon: Activity },
      ],
    },
    {
      label: 'Bantuan',
      items: [
        { path: '/ai-assistant',   label: 'AI Assistant',         icon: Sparkles },
      ],
    },
    {
      label: 'Data',
      items: [
        { path: '/history',         label: 'Riwayat Pasien',       icon: History },
        { path: '/sync-history',    label: 'Riwayat Sinkronisasi', icon: RefreshCw },
        { path: '/reports',         label: 'Laporan',              icon: FileBarChart },
      ],
    },
    {
      label: 'Sistem',
      items: [
        { path: '/cloud-backup',   label: 'Cloud Backup',         icon: CloudCog },
        { path: '/activity-log',   label: 'Log Aktivitas',        icon: ClipboardList },
        { path: '/panduan',        label: 'Panduan',              icon: BookOpen },
        { path: '/settings',       label: 'Pengaturan',           icon: Settings },
        { path: '/about',          label: 'Tentang Aplikasi',     icon: Info },
      ],
    },
  ];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className={`
        ${isSidebarOpen ? 'w-64' : 'w-16'}
        transition-all duration-300 ease-in-out
        bg-sidebar text-sidebar-foreground border-r border-sidebar-border
        flex flex-col shrink-0
      `}>
        {/* Sidebar header — logo + collapse toggle */}
        <div className="h-16 flex items-center justify-between px-3 border-b border-sidebar-border gap-2 shrink-0">
          {isSidebarOpen && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 shrink-0">
                <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                  <rect x="3" y="10" width="22" height="8" rx="2" fill="hsl(186,100%,60%)" />
                  <rect x="10" y="3" width="8" height="22" rx="2" fill="hsl(186,100%,60%)" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-white truncate leading-tight">
                  IP Admission Workspace
                </div>
                {rsName && (
                  <div className="text-[11px] text-sidebar-foreground/60 truncate leading-tight">
                    {rsName}
                  </div>
                )}
              </div>
            </div>
          )}
          {!isSidebarOpen && (
            <div className="mx-auto">
              <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
                <rect x="3" y="10" width="22" height="8" rx="2" fill="hsl(186,100%,60%)" />
                <rect x="10" y="3" width="8" height="22" rx="2" fill="hsl(186,100%,60%)" />
              </svg>
            </div>
          )}
          <Button
            variant="ghost" size="icon"
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {menuGroups.map((group, gi) => (
            <div key={group.label}>
              {isSidebarOpen && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 select-none">
                  {group.label}
                </p>
              )}
              {!isSidebarOpen && gi > 0 && (
                <div className="mx-2 mb-2 border-t border-sidebar-border/50" />
              )}
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive =
                    location === item.path ||
                    (item.path !== '/' && location.startsWith(item.path));
                  return (
                    <Link key={item.path} href={item.path}>
                      <div
                        className={`
                          flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors
                          ${isActive
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm'
                            : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}
                        `}
                        title={!isSidebarOpen ? item.label : undefined}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {isSidebarOpen && (
                          <span className="truncate text-sm">{item.label}</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar bottom — theme toggle only */}
        <div className={`p-3 border-t border-sidebar-border flex ${isSidebarOpen ? 'justify-start' : 'justify-center'}`}>
          <Button
            variant="ghost" size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* ── Main area (header + content + footer) ────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* ── Top header bar ─────────────────────────────────────────────────── */}
        <header className="h-16 shrink-0 border-b bg-card/80 backdrop-blur-sm flex items-center justify-end px-4 gap-2 z-10">

          {/* Notification bell → Monitoring KTM */}
          <Button
            variant="ghost" size="icon"
            className="text-muted-foreground hover:text-foreground relative"
            title="Monitoring KTM"
            onClick={() => navigate('/monitoring-ktm')}
          >
            <Bell className="h-5 w-5" />
          </Button>

          {/* User avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {/* Avatar circle */}
                <span className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0
                  ${avatarBg(user?.role)}
                `}>
                  {getInitials(user?.namaLengkap)}
                </span>
                {/* Name — hidden on small screens */}
                <span className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
                    {user?.namaLengkap ?? user?.username}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {user?.role}
                  </span>
                </span>
                <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-52 animate-in fade-in-0 zoom-in-95 duration-150"
            >
              {/* Identity label */}
              <DropdownMenuLabel className="pb-1.5">
                <p className="font-semibold text-sm truncate">{user?.namaLengkap ?? user?.username}</p>
                <p className="text-xs text-muted-foreground font-normal capitalize">{user?.role}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => navigate('/about')} className="gap-2 cursor-pointer">
                <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2 cursor-pointer">
                <Settings className="h-4 w-4 text-muted-foreground" />
                Pengaturan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/panduan')} className="gap-2 cursor-pointer">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                Bantuan
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => void logout()}
                disabled={isLoggingOut}
                className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                {isLoggingOut
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <LogOut className="h-4 w-4" />
                }
                {isLoggingOut ? 'Menyimpan...' : 'Keluar'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* ── Page content ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <footer className="h-10 shrink-0 border-t bg-card text-card-foreground flex items-center justify-between px-6 text-xs text-muted-foreground font-medium">
          <div className="flex items-center gap-1.5">
            {rsLogo ? (
              <img src={rsLogo} alt="Logo" className="w-3.5 h-3.5 object-contain" />
            ) : (
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-primary">
                <rect x="6" y="24" width="52" height="16" rx="4" fill="currentColor" />
                <rect x="24" y="6" width="16" height="52" rx="4" fill="currentColor" />
              </svg>
            )}
            <span>© 2026 IP Admission Workspace</span>
          </div>
          <div>Version 1.0.0</div>
          <div className="hidden sm:block">Developed by Dedi Supriadi · All Rights Reserved.</div>
        </footer>
      </main>
    </div>
  );
};
