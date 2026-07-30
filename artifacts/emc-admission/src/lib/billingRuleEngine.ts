/**
 * Billing Rule Engine
 * Evaluates billing rules against a billing row and returns the first matching result
 * (highest priority first).
 */

import { BillingRule, RuleCondition } from './db';

export interface BillingRowContext {
  penjamin: string;
  kelas: string;
  kode: string;
  namaItem: string;
  kelompok: string;
  lokasi: string;
  qty: number;
  hargaBilling: number;
  hargaMaster: number | null;
  selisih: number | null;
}

export interface RuleMatchResult {
  ruleId: number;
  ruleName: string;
  aksi: BillingRule['aksi'];
  pesan: string;
  warna: string;
  detail: string;
}

const NUMERIC_FIELDS: BillingRule['conditions'][number]['field'][] = ['qty', 'harga_billing', 'harga_master', 'selisih'];

function getFieldValue(field: RuleCondition['field'], row: BillingRowContext): string | number | null {
  switch (field) {
    case 'penjamin':     return row.penjamin;
    case 'kelas':        return row.kelas;
    case 'kode_tarif':   return row.kode;
    case 'nama_item':    return row.namaItem;
    case 'kelompok':     return row.kelompok;
    case 'lokasi':       return row.lokasi;
    case 'qty':          return row.qty;
    case 'harga_billing':return row.hargaBilling;
    case 'harga_master': return row.hargaMaster;
    case 'selisih':      return row.selisih;
    default:             return '';
  }
}

function evalCondition(cond: RuleCondition, row: BillingRowContext): boolean {
  const raw = getFieldValue(cond.field, row);
  const strVal = String(raw ?? '').toLowerCase().trim();
  const condStr = cond.value.toLowerCase().trim();
  const numVal = Number(raw);
  const condNum = Number(cond.value);

  switch (cond.operator) {
    case 'eq':          return strVal === condStr;
    case 'neq':         return strVal !== condStr;
    case 'gt':          return !isNaN(numVal) && !isNaN(condNum) && numVal > condNum;
    case 'lt':          return !isNaN(numVal) && !isNaN(condNum) && numVal < condNum;
    case 'contains':    return strVal.includes(condStr);
    case 'not_contains':return !strVal.includes(condStr);
    case 'empty':       return raw === null || raw === undefined || strVal === '';
    case 'not_empty':   return raw !== null && raw !== undefined && strVal !== '';
    default:            return false;
  }
}

export function evalRule(rule: BillingRule, row: BillingRowContext): boolean {
  if (!rule.aktif || !rule.conditions || rule.conditions.length === 0) return false;
  if (rule.logicType === 'AND') return rule.conditions.every(c => evalCondition(c, row));
  return rule.conditions.some(c => evalCondition(c, row));
}

/**
 * Apply all active rules to a row. Returns the first matching rule result
 * (sorted descending by prioritas — highest priority wins).
 */
export function applyRules(rules: BillingRule[], row: BillingRowContext): RuleMatchResult | null {
  const active = [...rules]
    .filter(r => r.aktif)
    .sort((a, b) => b.prioritas - a.prioritas);

  for (const rule of active) {
    if (evalRule(rule, row)) {
      const conditionSummary = rule.conditions
        .map(c => `${c.field} ${c.operator} "${c.value}"`)
        .join(` ${rule.logicType} `);
      return {
        ruleId: rule.id!,
        ruleName: rule.nama,
        aksi: rule.aksi,
        pesan: rule.pesan || rule.nama,
        warna: rule.warna || '#6366f1',
        detail: `Rule "${rule.nama}" cocok — IF ${conditionSummary}`,
      };
    }
  }
  return null;
}

export { NUMERIC_FIELDS };
