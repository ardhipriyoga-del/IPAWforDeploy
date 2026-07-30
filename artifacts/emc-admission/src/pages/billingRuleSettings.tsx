/**
 * Billing Rule Settings
 * Full CRUD + Rule Builder for billing validation rules.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getDB, BillingRule, RuleCondition, RuleField, RuleOperator, RuleAction, RuleLogic } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { writeLog } from '../lib/writeLog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Copy, Download, Upload, Search,
  ChevronUp, ChevronDown, ToggleLeft, ToggleRight, X, CheckCircle2,
  AlertTriangle, XCircle, EyeOff, Database, MessageSquare, ArrowUpDown,
  SlidersHorizontal,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<RuleField, string> = {
  penjamin:     'Penjamin',
  kelas:        'Kelas Perawatan',
  kode_tarif:   'Kode Tarif',
  nama_item:    'Nama Item',
  kelompok:     'Kelompok Tarif',
  lokasi:       'Ruangan / Lokasi',
  qty:          'Qty',
  harga_billing:'Harga Billing',
  harga_master: 'Harga Master',
  selisih:      'Selisih',
};

const NUMERIC_FIELDS: RuleField[] = ['qty', 'harga_billing', 'harga_master', 'selisih'];

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  eq:          '= Sama dengan',
  neq:         '≠ Tidak sama dengan',
  gt:          '> Lebih besar dari',
  lt:          '< Lebih kecil dari',
  contains:    'Mengandung',
  not_contains:'Tidak mengandung',
  empty:       'Kosong',
  not_empty:   'Tidak kosong',
};

const TEXT_OPERATORS: RuleOperator[]    = ['eq', 'neq', 'contains', 'not_contains', 'empty', 'not_empty'];
const NUMERIC_OPERATORS: RuleOperator[] = ['eq', 'neq', 'gt', 'lt', 'empty', 'not_empty'];

const ACTION_CONFIG: Record<RuleAction, { label: string; color: string; icon: React.ReactNode }> = {
  lolos:        { label: 'Lolos Validasi',        color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  warning:      { label: 'Warning',               color: 'bg-amber-100 text-amber-700',     icon: <AlertTriangle className="w-3 h-3" /> },
  error:        { label: 'Error',                  color: 'bg-red-100 text-red-700',         icon: <XCircle className="w-3 h-3" /> },
  abaikan:      { label: 'Abaikan Item',           color: 'bg-gray-100 text-gray-600',       icon: <EyeOff className="w-3 h-3" /> },
  gunakan_master:{ label: 'Gunakan Harga Master',  color: 'bg-blue-100 text-blue-700',       icon: <Database className="w-3 h-3" /> },
  pesan_khusus: { label: 'Tampilkan Pesan Khusus', color: 'bg-purple-100 text-purple-700',   icon: <MessageSquare className="w-3 h-3" /> },
};

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#0f766e',
];

const PRESET_ICONS = ['📋', '⚠️', '❌', '✅', '🔍', '💰', '🏥', '📊', '🔒', '⚡', '🎯', '📌'];

// ── Helper: generate condition id ─────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 10); }

// ── Default empty rule ─────────────────────────────────────────────────────────
const DEFAULT_RULE: Omit<BillingRule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
  nama: '',
  deskripsi: '',
  prioritas: 10,
  aktif: true,
  warna: '#3b82f6',
  ikon: '📋',
  pesan: '',
  logicType: 'AND',
  conditions: [],
  aksi: 'warning',
};

// ── Action badge ───────────────────────────────────────────────────────────────
function ActionBadge({ aksi }: { aksi: RuleAction }) {
  const cfg = ACTION_CONFIG[aksi];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Condition row in builder ───────────────────────────────────────────────────
function ConditionRow({
  cond, onChange, onRemove, showLogic, logicType, onLogicChange,
}: {
  cond: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
  showLogic: boolean;
  logicType: RuleLogic;
  onLogicChange: (l: RuleLogic) => void;
}) {
  const isNumeric = NUMERIC_FIELDS.includes(cond.field);
  const operators = isNumeric ? NUMERIC_OPERATORS : TEXT_OPERATORS;
  const noValue = cond.operator === 'empty' || cond.operator === 'not_empty';

  return (
    <div className="space-y-1">
      {showLogic && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => onLogicChange(logicType === 'AND' ? 'OR' : 'AND')}
            className="text-xs font-bold px-3 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
          >
            {logicType}
          </button>
        </div>
      )}
      <div className="flex gap-2 items-start">
        {/* Field */}
        <select
          value={cond.field}
          onChange={e => {
            const f = e.target.value as RuleField;
            const ops = NUMERIC_FIELDS.includes(f) ? NUMERIC_OPERATORS : TEXT_OPERATORS;
            onChange({ ...cond, field: f, operator: ops[0], value: '' });
          }}
          className="h-9 px-2 rounded-md border border-input bg-background text-sm flex-1 min-w-0"
        >
          {(Object.keys(FIELD_LABELS) as RuleField[]).map(f => (
            <option key={f} value={f}>{FIELD_LABELS[f]}</option>
          ))}
        </select>
        {/* Operator */}
        <select
          value={cond.operator}
          onChange={e => onChange({ ...cond, operator: e.target.value as RuleOperator, value: '' })}
          className="h-9 px-2 rounded-md border border-input bg-background text-sm flex-1 min-w-0"
        >
          {operators.map(op => (
            <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
          ))}
        </select>
        {/* Value */}
        {!noValue && (
          <Input
            type={isNumeric ? 'number' : 'text'}
            value={cond.value}
            onChange={e => onChange({ ...cond, value: e.target.value })}
            placeholder="Nilai..."
            className="h-9 text-sm flex-1 min-w-0"
          />
        )}
        <button
          type="button"
          onClick={onRemove}
          className="h-9 w-9 flex items-center justify-center rounded-md border border-border hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Rule Form Dialog ───────────────────────────────────────────────────────────
function RuleFormDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: BillingRule | null;
  onClose: () => void;
  onSave: (rule: Omit<BillingRule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: number }) => void;
}) {
  const [form, setForm] = useState({ ...DEFAULT_RULE, conditions: [] as RuleCondition[] });

  useEffect(() => {
    if (open) {
      setForm(initial
        ? { ...initial, conditions: initial.conditions.map(c => ({ ...c })) }
        : { ...DEFAULT_RULE, conditions: [] }
      );
    }
  }, [open, initial]);

  const addCondition = () =>
    setForm(f => ({
      ...f,
      conditions: [...f.conditions, { id: genId(), field: 'nama_item', operator: 'contains', value: '' }],
    }));

  const updateCond = (idx: number, c: RuleCondition) =>
    setForm(f => { const cs = [...f.conditions]; cs[idx] = c; return { ...f, conditions: cs }; });

  const removeCond = (idx: number) =>
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== idx) }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nama.trim()) { toast.error('Nama rule wajib diisi'); return; }
    if (form.conditions.length === 0) { toast.error('Tambahkan minimal 1 kondisi'); return; }
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? 'Edit Rule' : 'Tambah Rule Baru'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 py-2">

          {/* Info dasar */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="text-sm font-semibold">Nama Rule *</label>
              <Input value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} placeholder="Contoh: BPJS Qty > 1" required />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-sm font-semibold">Deskripsi</label>
              <Input value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))} placeholder="Keterangan singkat tentang rule ini" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold">Prioritas</label>
              <Input type="number" min={1} max={999} value={form.prioritas} onChange={e => setForm(f => ({ ...f, prioritas: Number(e.target.value) }))} />
              <p className="text-xs text-muted-foreground">Lebih tinggi = lebih diutamakan</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold">Status</label>
              <div className="flex items-center gap-2 h-9">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, aktif: !f.aktif }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${form.aktif ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-border text-muted-foreground'}`}
                >
                  {form.aktif ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {form.aktif ? 'Aktif' : 'Nonaktif'}
                </button>
              </div>
            </div>
          </div>

          {/* Ikon + Warna */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Ikon</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_ICONS.map(ic => (
                  <button key={ic} type="button" onClick={() => setForm(f => ({ ...f, ikon: ic }))}
                    className={`w-8 h-8 rounded border text-base transition-colors ${form.ikon === ic ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Warna Label</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, warna: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.warna === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Conditions builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Kondisi (IF) *</label>
              <Button type="button" variant="outline" size="sm" onClick={addCondition} className="h-7 gap-1 text-xs">
                <Plus className="w-3 h-3" /> Tambah Kondisi
              </Button>
            </div>
            {form.conditions.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg py-6 text-center text-sm text-muted-foreground">
                Belum ada kondisi. Klik "Tambah Kondisi" untuk mulai.
              </div>
            ) : (
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                {form.conditions.map((cond, idx) => (
                  <ConditionRow
                    key={cond.id}
                    cond={cond}
                    onChange={c => updateCond(idx, c)}
                    onRemove={() => removeCond(idx)}
                    showLogic={idx > 0}
                    logicType={form.logicType}
                    onLogicChange={l => setForm(f => ({ ...f, logicType: l }))}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Action (THEN) */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Aksi (THEN) *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(ACTION_CONFIG) as RuleAction[]).map(a => {
                const cfg = ACTION_CONFIG[a];
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, aksi: a }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left ${
                      form.aksi === a ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${cfg.color}`}>
                      {cfg.icon}
                    </span>
                    <span className="text-xs leading-tight">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pesan */}
          <div className="space-y-1">
            <label className="text-sm font-semibold">Pesan yang Ditampilkan</label>
            <Input value={form.pesan} onChange={e => setForm(f => ({ ...f, pesan: e.target.value }))} placeholder="Pesan ketika rule ini cocok..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit">{initial?.id ? 'Simpan Perubahan' : 'Buat Rule'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BillingRuleSettings() {
  const { user } = useAuth();
  const [rules, setRules] = useState<BillingRule[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'semua' | 'aktif' | 'nonaktif'>('semua');
  const [sortDesc, setSortDesc] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editRule, setEditRule] = useState<BillingRule | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const loadRules = useCallback(async () => {
    const db = await getDB();
    const all = await db.getAll('billingRules');
    setRules(all.sort((a, b) => sortDesc ? b.prioritas - a.prioritas : a.prioritas - b.prioritas));
  }, [sortDesc]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const filtered = rules.filter(r => {
    const matchSearch = !search.trim() || r.nama.toLowerCase().includes(search.toLowerCase()) || r.deskripsi.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'semua' || (filterStatus === 'aktif' ? r.aktif : !r.aktif);
    return matchSearch && matchStatus;
  });

  const handleSave = async (form: Omit<BillingRule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: number }) => {
    const db = await getDB();
    const now = Date.now();
    const isEdit = !!form.id;

    if (isEdit) {
      const updated: BillingRule = { ...form as BillingRule, updatedAt: now };
      await db.put('billingRules', updated);
      await writeLog({ modul: 'Billing Rule', aktivitas: `Edit rule "${form.nama}"`, status: 'Success', oldValue: editRule, newValue: form });
      toast.success('Rule berhasil diperbarui.');
    } else {
      const newRule: BillingRule = { ...form, createdAt: now, updatedAt: now, createdBy: user?.username ?? 'unknown' };
      await db.add('billingRules', newRule);
      await writeLog({ modul: 'Billing Rule', aktivitas: `Tambah rule "${form.nama}"`, status: 'Success', newValue: form });
      toast.success('Rule berhasil ditambahkan.');
    }
    setIsFormOpen(false);
    setEditRule(null);
    loadRules();
  };

  const handleDelete = async (id: number) => {
    const db = await getDB();
    const rule = rules.find(r => r.id === id);
    await db.delete('billingRules', id);
    await writeLog({ modul: 'Billing Rule', aktivitas: `Hapus rule "${rule?.nama}"`, status: 'Warning', oldValue: rule });
    toast.success('Rule dihapus.');
    setConfirmDeleteId(null);
    loadRules();
  };

  const handleDuplicate = async (rule: BillingRule) => {
    const db = await getDB();
    const now = Date.now();
    const copy: BillingRule = {
      ...rule,
      id: undefined,
      nama: `Salinan: ${rule.nama}`,
      aktif: false,
      createdAt: now,
      updatedAt: now,
      createdBy: user?.username ?? 'unknown',
      conditions: rule.conditions.map(c => ({ ...c, id: genId() })),
    };
    await db.add('billingRules', copy);
    await writeLog({ modul: 'Billing Rule', aktivitas: `Duplikasi rule "${rule.nama}"`, status: 'Success' });
    toast.success('Rule berhasil diduplikasi.');
    loadRules();
  };

  const handleToggle = async (rule: BillingRule) => {
    const db = await getDB();
    const updated = { ...rule, aktif: !rule.aktif, updatedAt: Date.now() };
    await db.put('billingRules', updated);
    await writeLog({ modul: 'Billing Rule', aktivitas: `${updated.aktif ? 'Aktifkan' : 'Nonaktifkan'} rule "${rule.nama}"`, status: 'Info' });
    toast.success(`Rule ${updated.aktif ? 'diaktifkan' : 'dinonaktifkan'}.`);
    loadRules();
  };

  const handleExport = () => {
    const json = JSON.stringify(rules, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-rules-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Rules berhasil diekspor.');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const imported: BillingRule[] = JSON.parse(text);
      if (!Array.isArray(imported)) throw new Error('Format tidak valid');
      const db = await getDB();
      const now = Date.now();
      let count = 0;
      for (const rule of imported) {
        if (!rule.nama || !rule.conditions || !rule.aksi) continue;
        await db.add('billingRules', {
          ...rule,
          id: undefined,
          nama: `[Import] ${rule.nama}`,
          aktif: false,
          createdAt: now,
          updatedAt: now,
          createdBy: user?.username ?? 'import',
          conditions: (rule.conditions || []).map((c: RuleCondition) => ({ ...c, id: genId() })),
        });
        count++;
      }
      await writeLog({ modul: 'Billing Rule', aktivitas: `Import ${count} rule`, status: 'Success' });
      toast.success(`${count} rule berhasil diimpor (status nonaktif).`);
      loadRules();
    } catch (err: any) {
      toast.error('Gagal mengimpor: ' + (err?.message ?? 'Format file tidak valid'));
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
                Billing Rule
              </CardTitle>
              <CardDescription className="mt-1">
                Atur semua aturan validasi billing. Proses pengecekan mengacu pada rule yang aktif di sini.
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="w-4 h-4" /> Export
              </Button>
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <span><Upload className="w-4 h-4" /> Import</span>
                </Button>
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditRule(null); setIsFormOpen(true); }}>
                <Plus className="w-4 h-4" /> Tambah Rule
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter + Search */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari rule..." className="pl-8 h-9 text-sm" />
            </div>
            {(['semua', 'aktif', 'nonaktif'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize ${filterStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {s === 'semua' ? `Semua (${rules.length})` : s === 'aktif' ? `Aktif (${rules.filter(r => r.aktif).length})` : `Nonaktif (${rules.filter(r => !r.aktif).length})`}
              </button>
            ))}
            <button
              onClick={() => setSortDesc(d => !d)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              Prioritas {sortDesc ? '↓' : '↑'}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Rule list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          {rules.length === 0
            ? 'Belum ada Billing Rule. Klik "Tambah Rule" untuk membuat yang pertama.'
            : 'Tidak ada rule yang cocok dengan filter.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(rule => (
            <Card key={rule.id} className={`border-l-4 transition-opacity ${rule.aktif ? 'opacity-100' : 'opacity-60'}`}
              style={{ borderLeftColor: rule.warna }}
            >
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{rule.ikon}</span>
                      <span className="font-semibold text-sm">{rule.nama}</span>
                      <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
                        Prioritas {rule.prioritas}
                      </span>
                      {rule.aktif
                        ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">Aktif</Badge>
                        : <Badge variant="outline" className="text-xs text-muted-foreground">Nonaktif</Badge>
                      }
                      <ActionBadge aksi={rule.aksi} />
                    </div>
                    {rule.deskripsi && (
                      <p className="text-xs text-muted-foreground mt-1">{rule.deskripsi}</p>
                    )}
                    {/* Conditions preview */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rule.conditions.map((c, i) => (
                        <React.Fragment key={c.id}>
                          {i > 0 && (
                            <span className="text-xs font-bold text-primary px-1">{rule.logicType}</span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                            {FIELD_LABELS[c.field]} {OPERATOR_LABELS[c.operator].split(' ')[0]} {c.value && `"${c.value}"`}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                    {rule.pesan && (
                      <p className="text-xs italic text-muted-foreground mt-1.5">💬 {rule.pesan}</p>
                    )}
                  </div>
                  {/* Right: actions */}
                  <div className="flex gap-1 shrink-0">
                    <button title={rule.aktif ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => handleToggle(rule)}
                      className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
                    >
                      {rule.aktif ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    <button title="Duplikasi" onClick={() => handleDuplicate(rule)}
                      className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button title="Edit" onClick={() => { setEditRule(rule); setIsFormOpen(true); }}
                      className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button title="Hapus" onClick={() => setConfirmDeleteId(rule.id!)}
                      className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary footer */}
      {rules.length > 0 && (
        <p className="text-xs text-center text-muted-foreground">
          {rules.filter(r => r.aktif).length} rule aktif · {rules.filter(r => !r.aktif).length} nonaktif · Total {rules.length} rule
        </p>
      )}

      {/* Form Dialog */}
      <RuleFormDialog
        open={isFormOpen}
        initial={editRule}
        onClose={() => { setIsFormOpen(false); setEditRule(null); }}
        onSave={handleSave}
      />

      {/* Confirm Delete Dialog */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Rule?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Rule <strong>"{rules.find(r => r.id === confirmDeleteId)?.nama}"</strong> akan dihapus permanen.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
