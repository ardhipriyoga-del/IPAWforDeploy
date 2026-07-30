import React from 'react';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { useHashLocation } from './lib/hashLocation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from 'next-themes';

import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';

import Login from './pages/login';
import Dashboard from './pages/dashboard';
import Patients from './pages/patients';
import PendingPage from './pages/pending';
import History from './pages/history';
import ImportPage from './pages/import';
import Reports from './pages/reports';
import Settings from './pages/settings';
import About from './pages/about';
import KasirPage from './pages/kasir';
import DownloadPage from './pages/download';
import MasterTarifPage from './pages/masterTarif';
import SyncHistoryPage from './pages/syncHistory';
import PanduanPage from './pages/panduan';
import CloudBackupPage from './pages/cloudBackup';
import ActivityLogPage from './pages/activityLog';
import AIAssistantPage from './pages/aiAssistant';
import MonitoringKtmPage from './pages/monitoringKtm';
import BillingCheckerPage from './pages/billingChecker';
import IGDWardPage from './pages/igdWard';
import NotFound from './pages/not-found';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isInitialized } = useAuth();
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Memuat aplikasi...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Redirect to="/login" />;
  return <Layout>{children}</Layout>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/patients">
        <ProtectedRoute><Patients /></ProtectedRoute>
      </Route>
      <Route path="/pending">
        <ProtectedRoute><PendingPage /></ProtectedRoute>
      </Route>
      <Route path="/history">
        <ProtectedRoute><History /></ProtectedRoute>
      </Route>
      <Route path="/import">
        <ProtectedRoute><ImportPage /></ProtectedRoute>
      </Route>
      <Route path="/reports">
        <ProtectedRoute><Reports /></ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>
      <Route path="/about">
        <ProtectedRoute><About /></ProtectedRoute>
      </Route>
      <Route path="/kasir">
        <ProtectedRoute><KasirPage /></ProtectedRoute>
      </Route>
      <Route path="/download">
        <ProtectedRoute><DownloadPage /></ProtectedRoute>
      </Route>
      <Route path="/master-tarif">
        <ProtectedRoute><MasterTarifPage /></ProtectedRoute>
      </Route>
      <Route path="/sync-history">
        <ProtectedRoute><SyncHistoryPage /></ProtectedRoute>
      </Route>
      <Route path="/panduan">
        <ProtectedRoute><PanduanPage /></ProtectedRoute>
      </Route>
      <Route path="/cloud-backup">
        <ProtectedRoute><CloudBackupPage /></ProtectedRoute>
      </Route>
      <Route path="/activity-log">
        <ProtectedRoute><ActivityLogPage /></ProtectedRoute>
      </Route>
      <Route path="/ai-assistant">
        <ProtectedRoute><AIAssistantPage /></ProtectedRoute>
      </Route>
      <Route path="/monitoring-ktm">
        <ProtectedRoute><MonitoringKtmPage /></ProtectedRoute>
      </Route>
      <Route path="/billing-checker">
        <ProtectedRoute><BillingCheckerPage /></ProtectedRoute>
      </Route>
      <Route path="/igd-ward">
        <ProtectedRoute><IGDWardPage /></ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppProvider>
            <WouterRouter hook={useHashLocation}>
              <AuthProvider>
                <AppRouter />
              </AuthProvider>
            </WouterRouter>
          </AppProvider>
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
