import * as XLSX from 'xlsx';
import { MasterTarifItem, BillingRule, BillingCheckItem, BillingRuleResult, BillingOverallStatus, BillingItemStatus } from './db';
import { lookupHarga } from './estimasi';

// ── Billing Excel Parser ──────────────────────────────────────────────────────
// TrakCare billing format:
// ITM_Date | ARCIM_Code | ARCIM_Desc | ARCBG_Desc | CTLOC_Desc | ITM_DailyQty | ITM_LineTotal

export interface BillingRawItem {
  itemCode: string;
  namaItem: string;
  kategori: string;
  qty: number;
  totalBilling: number;
  hargaBilling: number; // unit price (totalBilling / qty)
}

export function parseBillingExcel(buffer: ArrayBuffer): BillingRawItem[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const rowMap = new Map<string, { namaItem: string; kategori: string; qty: number; total: number }>();

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!raw.length) continue;

    let hRow = -1;
    let colCode = -1, colDesc = -1, colCat = -1, colQty = -1, colTotal = -1;

    for (let r = 0; r < Math.min(10, raw.length); r++) {
      const row = raw[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const v = String(row[c] ?? '').trim().toUpperCase();
        if (v === 'ARCIM_CODE') colCode = c;
        if (v === 'ARCIM_DESC') colDesc = c;
        if (v === 'ARCBG_DESC') colCat = c;
        if (v === 'ITM_DAILYQTY') colQty = c;
        if (v === 'ITM_LINETOTAL') colTotal = c;
      }
      if (colDesc >= 0 && (colCode >= 0 || colQty >= 0)) { hRow = r; break; }
    }

    if (hRow < 0) continue;
    if (colQty < 0) colQty = 5;
    if (colTotal < 0) colTotal = 6;

    for (let r = hRow + 1; r < raw.length; r++) {
      const row = raw[r] ?? [];
      const code = String(row[colCode] ?? '').trim();
      const desc = String(row[colDesc] ?? '').trim();
      if (!desc) continue;

      const qRaw = row[colQty];
      const tRaw = row[colTotal];
      const qty = typeof qRaw === 'number' ? qRaw : parseFloat(String(qRaw ?? '').replace(/[^0-9.-]/g, '')) || 0;
      const total = typeof tRaw === 'number' ? tRaw : parseFloat(String(tRaw ?? '').replace(/[^0-9.-]/g, '')) || 0;

      const key = code || desc;
      if (!rowMap.has(key)) {
        rowMap.set(key, { namaItem: desc, kategori: String(row[colCat] ?? '').trim(), qty: 0, total: 0 });
      }
      const entry = rowMap.get(key)!;
      entry.qty += qty;
      entry.total += total;
    }
  }

  return Array.from(rowMap.entries()).map(([code, v]) => ({
    itemCode: code,
    namaItem: v.namaItem,
    kategori: v.kategori,
    qty: v.qty,
    totalBilling: v.total,
    hargaBilling: v.qty > 0 ? Math.round(v.total / v.qty) : 0,
  }));
}

// ── Item Checker ──────────────────────────────────────────────────────────────

export function checkBillingItems(
  rawItems: BillingRawItem[],
  masterItems: MasterTarifItem[],
  kelasTarif: string,
): BillingCheckItem[] {
  return rawItems.map(raw => {
    const lookup = lookupHarga(raw.namaItem, kelasTarif, masterItems);
    const hargaMaster = lookup.price;
    const hargaBilling = raw.hargaBilling;
    const selisih = hargaBilling - hargaMaster;

    let status: BillingItemStatus;
    if (lookup.status === 'unmapped') {
      status = 'tidak_ditemukan';
    } else if (hargaMaster === 0 || Math.abs(selisih) < 1) {
      status = 'sesuai';
    } else {
      status = 'selisih';
    }

    return {
      itemCode: raw.itemCode,
      namaItem: raw.namaItem,
      kategori: raw.kategori,
      qty: raw.qty,
      hargaBilling,
      totalBilling: raw.totalBilling,
      hargaMaster,
      selisih,
      totalSelisih: selisih * raw.qty,
      status,
      matchedMasterName: lookup.matchedName,
    };
  });
}

// ── Rule Engine ───────────────────────────────────────────────────────────────

export function runRuleEngine(
  items: BillingCheckItem[],
  rules: BillingRule[],
  penjamin: string,
  lamaRawat = 1,
): BillingRuleResult[] {
  const norm = (s: string) => s.toLowerCase().trim();
  const pn = norm(penjamin);

  const active = rules.filter(r => {
    if (!r.aktif) return false;
    const rp = norm(r.penjamin);
    return rp === '*' || rp === 'semua' || rp === pn ||
           pn.includes(rp) || rp.includes(pn);
  });

  if (!active.length) return [];

  return active.map(rule => {
    const rn = norm(rule.namaItem);
    const matched = items.filter(item => {
      const an = norm(item.namaItem);
      return rule.matchMode === 'exact' ? an === rn : an.includes(rn) || rn.includes(an);
    });

    const found = matched.length > 0;
    const totalQty = matched.reduce((s, i) => s + i.qty, 0);
    let status: 'ok' | 'warning' | 'error' = 'ok';
    let detail = '';
    const n = rule.nilai ?? 1;

    switch (rule.tipe) {
      case 'wajib_ada':
        if (!found) { status = 'error'; detail = `"${rule.namaItem}" tidak ditemukan di billing`; }
        else { detail = `"${rule.namaItem}" ditemukan (Qty ${totalQty})`; }
        break;
      case 'tidak_boleh_ada':
        if (found) { status = 'error'; detail = `"${rule.namaItem}" tidak seharusnya ada`; }
        else { detail = `"${rule.namaItem}" tidak ada — sesuai rule`; }
        break;
      case 'qty_exact':
        if (!found) { status = 'error'; detail = `Tidak ditemukan (diharapkan Qty ${n})`; }
        else if (totalQty !== n) { status = 'warning'; detail = `Qty ${totalQty} ≠ ${n}`; }
        else { detail = `Qty ${totalQty} — sesuai`; }
        break;
      case 'qty_min':
        if (!found || totalQty < n) { status = 'error'; detail = `Qty ${found ? totalQty : 0} < minimum ${n}`; }
        else { detail = `Qty ${totalQty} ≥ ${n} — sesuai`; }
        break;
      case 'qty_max':
        if (found && totalQty > n) { status = 'warning'; detail = `Qty ${totalQty} > maksimum ${n}`; }
        else { detail = found ? `Qty ${totalQty} ≤ ${n}` : 'Item tidak ada'; }
        break;
      case 'qty_per_hari': {
        const exp = n * lamaRawat;
        if (!found) { status = 'error'; detail = `Tidak ditemukan (ekspektasi ${exp} = ${n}/hari × ${lamaRawat} hari)`; }
        else if (Math.abs(totalQty - exp) > 1) { status = 'warning'; detail = `Qty ${totalQty}, ekspektasi ${exp} (${n}/hari × ${lamaRawat} hari)`; }
        else { detail = `Qty ${totalQty} sesuai lama rawat ${lamaRawat} hari`; }
        break;
      }
      case 'harga_sesuai': {
        const mis = matched.filter(i => i.status === 'selisih');
        if (!found) { status = 'error'; detail = `"${rule.namaItem}" tidak ditemukan di billing`; }
        else if (mis.length > 0) { status = 'warning'; detail = `Harga tidak sesuai master tarif`; }
        else { detail = `Harga sesuai master tarif`; }
        break;
      }
      default:
        detail = 'Periksa manual';
    }

    return {
      ruleId: rule.id!,
      namaItem: rule.namaItem,
      tipe: rule.tipe,
      keterangan: rule.keterangan,
      status,
      detail,
    };
  });
}

// ── Overall Status ────────────────────────────────────────────────────────────

export function calcOverallStatus(
  items: BillingCheckItem[],
  ruleResults: BillingRuleResult[],
): BillingOverallStatus {
  if (ruleResults.some(r => r.status === 'error')) return 'invalid';
  if (ruleResults.some(r => r.status === 'warning') || items.some(i => i.status !== 'sesuai')) return 'warning';
  return 'valid';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function calcLamaRawat(admissionDate: string, dischargeDate?: string | null): number {
  if (!admissionDate) return 1;
  try {
    const d1 = new Date(admissionDate);
    const d2 = dischargeDate ? new Date(dischargeDate) : new Date();
    return Math.max(1, Math.floor((d2.getTime() - d1.getTime()) / 86400000));
  } catch { return 1; }
}

export const fmtRpBilling = (n: number) =>
  'Rp\u00A0' + Math.abs(Math.round(n)).toLocaleString('id-ID');
