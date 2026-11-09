// Shared business rules: balances, shipping price calculation, codes.
import { all, get, run, setting } from './db.js';

export type Currency = 'THB' | 'CNY';
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const today = () => new Date().toISOString().slice(0, 10);

export function addBalance(o: {
  customer_id: number; currency: Currency; income?: number; expense?: number; ref_code?: string | null;
  description?: string | null; date?: string; source?: string; source_id?: number; user: string;
}) {
  return run(
    `INSERT INTO customer_balances (customer_id, currency, ref_code, description, date, income, expense, source, source_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [o.customer_id, o.currency, o.ref_code ?? null, o.description ?? null, o.date || today(), round2(o.income || 0), round2(o.expense || 0),
      o.source || 'manual', o.source_id ?? null, o.user],
  ).id;
}
export function removeBalanceBySource(source: string, sourceId: number) {
  run('DELETE FROM customer_balances WHERE source = ? AND source_id = ?', [source, sourceId]);
}
export function customerBalance(customerId: number, currency: Currency): number {
  return round2(get<{ b: number }>(
    'SELECT COALESCE(SUM(income - expense), 0) AS b FROM customer_balances WHERE customer_id = ? AND currency = ?', [customerId, currency],
  )!.b);
}

export function bankBalance(bankId: number): number {
  const r = get<{ b: number }>(
    `SELECT b.opening_balance + COALESCE((SELECT SUM(income - expense) FROM bank_statements s WHERE s.bank_id = b.id), 0) AS b
     FROM banks b WHERE b.id = ?`, [bankId]);
  return round2(r?.b || 0);
}

// Cash accounts have no bank export to import, so every money movement on a cash account is posted
// to its statement automatically. Real bank accounts get their statement lines from "Import bank statement".
export function postCash(source: string, sourceId: number, entries: { bank_id?: number | null; date: string; income?: number; expense?: number; detail: string }[], user: string) {
  run('DELETE FROM bank_statements WHERE source = ? AND source_id = ?', [source, sourceId]);
  for (const e of entries) {
    if (!e.bank_id) continue;
    const bank = get<{ is_cash: number }>('SELECT is_cash FROM banks WHERE id = ?', [e.bank_id]);
    if (!bank?.is_cash) continue;
    run('INSERT INTO bank_statements (bank_id, date, income, expense, detail, source, source_id, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [e.bank_id, e.date, round2(e.income || 0), round2(e.expense || 0), e.detail, source, sourceId, user]);
  }
}
export function unpostCash(source: string, sourceId: number) {
  run('DELETE FROM bank_statements WHERE source = ? AND source_id = ?', [source, sourceId]);
}

export function latestExchangeRate(): number {
  return get<{ rate: number }>('SELECT rate FROM exchange_rates ORDER BY date DESC, id DESC LIMIT 1')?.rate || 0;
}

export const cubicMeters = (p: { cubic1: number; cubic2: number; cubic3: number }) =>
  ((p.cubic1 || 0) * (p.cubic2 || 0) * (p.cubic3 || 0)) / 1_000_000;

export interface Rates { kilo: number; cubic: number; kilo_yuan: number; cubic_yuan: number; calc_type: string }

export function customerRates(customerId: number): Rates {
  const c = get<any>('SELECT * FROM customers WHERE id = ?', [customerId]) || {};
  const n = (v: any, k: string) => (v === null || v === undefined || v === '' ? Number(setting(k)) : Number(v));
  return {
    kilo: n(c.kilo_rate, 'kilo_rate'),
    cubic: n(c.cubic_rate, 'cubic_rate'),
    kilo_yuan: n(c.kilo_rate_yuan, 'kilo_rate_yuan'),
    cubic_yuan: n(c.cubic_rate_yuan, 'cubic_rate_yuan'),
    calc_type: c.calc_type || 'mix',
  };
}

// Price of one packed box. rate_type on the packing overrides the customer's default rule.
export function packingPrice(p: any, rates: Rates, currency: Currency) {
  const cbm = cubicMeters(p);
  const yuan = currency === 'CNY';
  const kRate = yuan ? rates.kilo_yuan : rates.kilo;
  const cRate = yuan ? rates.cubic_yuan : rates.cubic;
  if (p.rate_type === 'kilo' && p.rate != null) return { price: round2(p.weight * p.rate), basis: 'kilo', rate: p.rate, cbm };
  if (p.rate_type === 'cubic' && p.rate != null) return { price: round2(cbm * p.rate), basis: 'cubic', rate: p.rate, cbm };
  if (p.rate_type === 'fixed' && p.rate != null) return { price: round2(p.rate), basis: 'fixed', rate: p.rate, cbm };
  const byKilo = round2(p.weight * kRate);
  const byCubic = round2(cbm * cRate);
  if (rates.calc_type === 'kilo') return { price: byKilo, basis: 'kilo', rate: kRate, cbm };
  if (rates.calc_type === 'cubic') return { price: byCubic, basis: 'cubic', rate: cRate, cbm };
  return byKilo >= byCubic ? { price: byKilo, basis: 'kilo', rate: kRate, cbm } : { price: byCubic, basis: 'cubic', rate: cRate, cbm };
}

export function shipmentCustomerCharges(shipmentId: number, customerId: number, currency: Currency) {
  const rates = customerRates(customerId);
  const packings = all<any>(
    'SELECT * FROM packings WHERE shipment_id = ? AND customer_id = ? ORDER BY ctn, no, id', [shipmentId, customerId],
  ).map((p) => ({ ...p, ...packingPrice(p, rates, currency) }));
  const others = all<any>('SELECT * FROM shipment_other_amounts WHERE shipment_id = ? AND customer_id = ? ORDER BY id', [shipmentId, customerId]);
  const shipping = round2(packings.reduce((s, p) => s + p.price, 0));
  const other = round2(others.reduce((s, o) => s + o.amount, 0));
  return { rates, packings, others, shipping, other, total: round2(shipping + other) };
}

export function nextPackingCode(): string {
  const last = get<{ id: number }>('SELECT MAX(id) AS id FROM packings')?.id || 0;
  let n = last + 1;
  while (get('SELECT 1 FROM packings WHERE packing_code = ?', [`PK${String(n).padStart(4, '0')}`])) n++;
  return `PK${String(n).padStart(4, '0')}`;
}
export function nextPackageCode(): string {
  const d = new Date();
  const prefix = `B${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const last = get<{ code: string }>("SELECT code FROM packages WHERE code LIKE ? ORDER BY code DESC LIMIT 1", [`${prefix}%`]);
  const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

// Quantities per order line: ordered, billed/received (package_items), packed (packing_items).
export function orderItemProgress(where = '1=1', params: any[] = []) {
  return all<any>(
    `SELECT oi.*, o.customer_id, o.order_date, o.supplier_name, o.order_no, c.code AS customer_code,
       s.th AS style_th, s.zh AS style_zh, s.en AS style_en,
       COALESCE((SELECT SUM(quantity) FROM package_items pi WHERE pi.order_item_id = oi.id), 0) AS received_qty,
       COALESCE((SELECT SUM(quantity) FROM packing_items pk WHERE pk.order_item_id = oi.id), 0) AS packed_qty
     FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN customers c ON c.id = o.customer_id
     LEFT JOIN styles s ON s.id = oi.style_id WHERE ${where} ORDER BY oi.order_id DESC, oi.id`, params,
  );
}

export function packageTotals(packageId: number) {
  const items = get<{ t: number; d: number }>(
    'SELECT COALESCE(SUM(quantity * unit_price), 0) AS t, COALESCE(SUM(deposit), 0) AS d FROM package_items WHERE package_id = ?', [packageId])!;
  const deductions = get<{ s: number }>(
    `SELECT COALESCE(SUM(st.amount), 0) AS s FROM package_item_statements st JOIN package_items pi ON pi.id = st.package_item_id
     WHERE pi.package_id = ?`, [packageId])!.s;
  const pkg = get<any>('SELECT deposit FROM packages WHERE id = ?', [packageId]);
  const paid = get<{ s: number }>('SELECT COALESCE(SUM(amount), 0) AS s FROM package_payments WHERE package_id = ?', [packageId])!.s;
  const total = round2(items.t);
  const deposit = round2(items.d + (pkg?.deposit || 0));
  const due = round2(total - deposit - deductions);
  return { total, deposit, deductions: round2(deductions), due, paid: round2(paid), remaining: round2(due - paid) };
}

// Same figures as packageTotals() for many bills in one query: add PACKAGE_TOTALS_COLS to a SELECT over `packages k`,
// then pass each row through packageTotalsOf(). Avoids 4 extra queries per bill on the bill lists.
export const PACKAGE_TOTALS_COLS = `
  COALESCE((SELECT SUM(quantity * unit_price) FROM package_items x WHERE x.package_id = k.id), 0) AS _t,
  COALESCE((SELECT SUM(deposit) FROM package_items x WHERE x.package_id = k.id), 0) AS _d,
  COALESCE((SELECT SUM(st.amount) FROM package_item_statements st JOIN package_items x ON x.id = st.package_item_id WHERE x.package_id = k.id), 0) AS _s,
  COALESCE((SELECT SUM(amount) FROM package_payments x WHERE x.package_id = k.id), 0) AS _p`;
export function packageTotalsOf<T extends { _t: number; _d: number; _s: number; _p: number; deposit?: number | null }>(row: T) {
  const { _t, _d, _s, _p, ...rest } = row;
  const total = round2(_t);
  const deposit = round2(_d + (row.deposit || 0));
  const due = round2(total - deposit - _s);
  return { ...rest, total, deposit, deductions: round2(_s), due, paid: round2(_p), remaining: round2(due - _p) };
}

// Optional: notify an external customer website about status changes (M4Helper.SendStatus / SendOffChina in the old app).
export async function notifyStatus(event: string, payload: unknown) {
  const url = setting('status_webhook_url');
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.STATUS_WEBHOOK_KEY ? { apikey: process.env.STATUS_WEBHOOK_KEY } : {}) },
      body: JSON.stringify({ event, payload }),
    });
  } catch (e) {
    console.warn('status webhook failed', e);
  }
}
