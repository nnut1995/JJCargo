// Generic list / create / update / delete / check endpoints for simple tables.
// Workflow-heavy features (orders, bills, packing, payment checking...) live in routes.ts.
import { Router } from 'express';
import { all, get, run, audit } from './db.js';
import { HttpError, canMenu, canVerify } from './auth.js';
import { postCash, unpostCash } from './logic.js';

type Entry = { bank_id?: number | null; date: string; income?: number; expense?: number; detail: string };

interface Resource {
  table: string;
  menus: string[]; // any of these menu keys grants access
  fields: string[]; // writable columns
  required?: string[];
  select?: string; // list query (must alias main table as t)
  search?: string[]; // columns for ?q=
  dateCol?: string; // for ?from=&to=
  filters?: string[]; // allowed ?field=value equality filters (t.<field>)
  order?: string;
  createdBy?: boolean;
  verifyKey?: string; // enables /check and blocks delete/edit after checked
  softDelete?: string; // column name
  bools?: string[];
  cash?: (row: any) => Entry[]; // money movements to post on cash accounts
}

const R: Record<string, Resource> = {
  customer_addresses: {
    table: 'customer_addresses', menus: ['customer.info'],
    fields: ['customer_id', 'name', 'address', 'province_id', 'postcode', 'is_default'], required: ['customer_id', 'address'],
    select: 'SELECT t.*, p.name AS province FROM customer_addresses t LEFT JOIN provinces p ON p.id = t.province_id',
    filters: ['customer_id'], order: 't.is_default DESC, t.id', bools: ['is_default'],
  },
  banks: {
    table: 'banks', menus: ['bank.info', 'bank.statement', 'bank.total'],
    fields: ['name', 'nickname', 'account_name', 'account_number', 'is_active', 'is_thai', 'opening_balance', 'customer_visible', 'is_cash'],
    required: ['name', 'is_thai'], search: ['name', 'nickname', 'account_number'], filters: ['is_thai', 'is_active'], order: 't.is_thai DESC, t.id',
    bools: ['is_active', 'is_thai', 'customer_visible', 'is_cash'],
  },
  style_units: { table: 'style_units', menus: ['style'], fields: ['description'], required: ['description'], order: 't.id' },
  styles: {
    table: 'styles', menus: ['style', 'packing.new', 'packing.nobill', 'order.new', 'order.search', 'packing.search'],
    fields: ['en', 'zh', 'th', 'unit_id', 'active'],
    select: 'SELECT t.*, u.description AS unit FROM styles t LEFT JOIN style_units u ON u.id = t.unit_id WHERE t.is_deleted = 0',
    search: ['en', 'zh', 'th'], order: 't.id DESC', softDelete: 'is_deleted', bools: ['active'],
  },
  supplier_banks: {
    table: 'supplier_banks', menus: ['package.new', 'package.search', 'invoice.payment'],
    fields: ['bank', 'account_name', 'account_number', 'tel'], required: ['bank', 'account_number'],
    select: 'SELECT t.* FROM supplier_banks t WHERE t.is_deleted = 0', search: ['bank', 'account_name', 'account_number', 'tel'],
    order: 't.id DESC', softDelete: 'is_deleted',
  },
  shipments: {
    table: 'shipments', menus: ['shipment.list', 'packing.offchina', 'packing.new', 'packing.search', 'shipment.summary', 'shipment.search', 'packing.bulk', 'packing.nobill', 'payments', 'customer.payment'],
    fields: ['code', 'date', 'arrived_date'], required: ['code', 'date'],
    select: `SELECT t.*, (SELECT COUNT(*) FROM packings p WHERE p.shipment_id = t.id) AS packing_count,
      (SELECT ROUND(SUM(weight),2) FROM packings p WHERE p.shipment_id = t.id) AS total_weight FROM shipments t`,
    search: ['code'], dateCol: 'date', order: 't.date DESC, t.id DESC', createdBy: true,
  },
  expense_types: {
    table: 'expense_types', menus: ['expense.thai', 'expense.china'], fields: ['description', 'is_thai'], required: ['description'],
    filters: ['is_thai'], order: 't.description', bools: ['is_thai'],
  },
  daily_expenses: {
    table: 'daily_expenses', menus: ['expense.thai', 'expense.china'],
    fields: ['date', 'amount', 'bank_fee', 'remark', 'bank_id', 'type_id', 'is_thai'], required: ['date', 'amount'],
    select: `SELECT t.*, b.name AS bank, e.description AS type FROM daily_expenses t
      LEFT JOIN banks b ON b.id = t.bank_id LEFT JOIN expense_types e ON e.id = t.type_id`,
    search: ['remark'], dateCol: 'date', filters: ['is_thai', 'type_id', 'bank_id', 'checked'], order: 't.date DESC, t.id DESC',
    createdBy: true, verifyKey: 'expense', bools: ['is_thai'],
    cash: (r) => [{ bank_id: r.bank_id, date: r.date, expense: (r.amount || 0) + (r.bank_fee || 0), detail: `ค่าใช้จ่าย ${r.remark || ''}` }],
  },
  other_incomes: {
    table: 'other_incomes', menus: ['income.other'], fields: ['date', 'amount', 'remark', 'bank_id'], required: ['date', 'amount'],
    select: 'SELECT t.*, b.name AS bank FROM other_incomes t LEFT JOIN banks b ON b.id = t.bank_id',
    search: ['remark'], dateCol: 'date', filters: ['bank_id', 'checked'], order: 't.date DESC, t.id DESC', createdBy: true, verifyKey: 'other_income',
    cash: (r) => [{ bank_id: r.bank_id, date: r.date, income: r.amount, detail: `รายรับอื่นๆ ${r.remark || ''}` }],
  },
  account_transfers: {
    table: 'account_transfers', menus: ['account.transfer'],
    fields: ['date', 'amount', 'bank_fee', 'company_cost', 'from_bank_id', 'to_bank_id', 'remark'], required: ['date', 'amount', 'from_bank_id', 'to_bank_id'],
    select: `SELECT t.*, f.name AS from_bank, b.name AS to_bank FROM account_transfers t
      LEFT JOIN banks f ON f.id = t.from_bank_id LEFT JOIN banks b ON b.id = t.to_bank_id`,
    search: ['remark'], dateCol: 'date', filters: ['from_bank_id', 'to_bank_id', 'checked'], order: 't.date DESC, t.id DESC', createdBy: true, verifyKey: 'account_transfer',
    cash: (r) => [
      { bank_id: r.from_bank_id, date: r.date, expense: (r.amount || 0) + (r.bank_fee || 0), detail: `โอนเงินไปบัญชี 汇款 -> ${r.remark || ''}` },
      { bank_id: r.to_bank_id, date: r.date, income: r.amount, detail: `รับเงินจากบัญชี 收款 <- ${r.remark || ''}` },
    ],
  },
  exchange_rates: {
    table: 'exchange_rates', menus: ['exchange', 'payment.check', 'customer.payment'], fields: ['date', 'rate'], required: ['date', 'rate'],
    dateCol: 'date', order: 't.date DESC, t.id DESC',
  },
  shipment_other_amounts: {
    table: 'shipment_other_amounts', menus: ['shipment.summary'], fields: ['customer_id', 'shipment_id', 'detail', 'amount'],
    required: ['customer_id', 'shipment_id', 'amount'], filters: ['customer_id', 'shipment_id'], order: 't.id', createdBy: true,
  },
  roles: {
    table: 'roles', menus: ['employees', 'permission'], fields: ['description'], required: ['description'], order: 't.id',
  },
  bank_statements: {
    table: 'bank_statements', menus: ['bank.statement', 'bank.import'],
    fields: ['bank_id', 'date', 'income', 'expense', 'detail', 'bank_detail'], required: ['bank_id', 'date'],
    select: `SELECT t.*, b.name AS bank, c.code AS customer_code FROM bank_statements t LEFT JOIN banks b ON b.id = t.bank_id
      LEFT JOIN payment_infos pi ON pi.id = t.payment_id LEFT JOIN customers c ON c.id = pi.customer_id`,
    search: ['detail', 'bank_detail'], dateCol: 'date', filters: ['bank_id'], order: 't.date DESC, t.id DESC', createdBy: true,
  },
};

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new HttpError(400, 'Bad field');
  return s;
};

function access(user: Express.Request['user'], res: Resource) {
  if (!res.menus.some((m) => canMenu(user, m))) throw new HttpError(403, 'No permission');
}

function clean(res: Resource, body: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const f of res.fields) {
    if (!(f in body)) continue;
    let v = body[f];
    if (v === '') v = null;
    if (res.bools?.includes(f)) v = v ? 1 : 0;
    out[f] = v;
  }
  return out;
}

export function listResource(name: string, query: Record<string, any>) {
  const res = R[name];
  const base = res.select || `SELECT t.* FROM ${res.table} t`;
  const where: string[] = [];
  const params: any[] = [];
  if (res.softDelete && !res.select) where.push(`t.${res.softDelete} = 0`);
  if (query.q && res.search) {
    where.push('(' + res.search.map((c) => `CAST(t.${ident(c)} AS TEXT) LIKE ?`).join(' OR ') + ')');
    res.search.forEach(() => params.push(`%${query.q}%`));
  }
  if (res.dateCol && query.from) { where.push(`t.${res.dateCol} >= ?`); params.push(query.from); }
  if (res.dateCol && query.to) { where.push(`t.${res.dateCol} <= ?`); params.push(query.to); }
  for (const f of res.filters || []) {
    if (query[f] !== undefined && query[f] !== '') { where.push(`t.${ident(f)} = ?`); params.push(query[f]); }
  }
  // filters run on the outer query, so they see the same column names the list returns
  const sql = `SELECT * FROM (${base}) t ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${res.order || 't.id DESC'} LIMIT ${Math.min(Number(query.limit) || 2000, 5000)}`;
  return all(sql, params);
}

export function crudRouter() {
  const r = Router();

  r.get('/r/:name', (req, res) => {
    const def = R[req.params.name];
    if (!def) throw new HttpError(404, 'Unknown resource');
    access(req.user, def);
    res.json(listResource(req.params.name, req.query as any));
  });

  r.post('/r/:name', (req, res) => {
    const def = R[req.params.name];
    if (!def) throw new HttpError(404, 'Unknown resource');
    access(req.user, def);
    const data = clean(def, req.body);
    for (const f of def.required || []) if (data[f] === undefined || data[f] === null) throw new HttpError(400, `Missing ${f}`);
    if (def.createdBy) data.created_by = req.user.username;
    const cols = Object.keys(data).map(ident);
    const { id } = run(`INSERT INTO ${def.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => data[c]));
    if (def.cash) postCash(def.table, id, def.cash(get(`SELECT * FROM ${def.table} WHERE id = ?`, [id])), req.user.username);
    audit(req.user.username, 'create', def.table, id, data);
    res.json(get(`SELECT * FROM ${def.table} WHERE id = ?`, [id]));
  });

  r.put('/r/:name/:id', (req, res) => {
    const def = R[req.params.name];
    if (!def) throw new HttpError(404, 'Unknown resource');
    access(req.user, def);
    const id = Number(req.params.id);
    const row = get<any>(`SELECT * FROM ${def.table} WHERE id = ?`, [id]);
    if (!row) throw new HttpError(404, 'Not found');
    if (def.verifyKey && row.checked) throw new HttpError(409, 'Already checked — cannot edit');
    if (def.table === 'bank_statements' && !canVerify(req.user, 'bank_statement')) throw new HttpError(403, 'No permission to edit bank statements');
    const data = clean(def, req.body);
    const cols = Object.keys(data).map(ident);
    if (cols.length) run(`UPDATE ${def.table} SET ${cols.map((c) => `${c} = ?`).join(',')} WHERE id = ?`, [...cols.map((c) => data[c]), id]);
    if (def.table === 'bank_statements') run('UPDATE bank_statements SET updated_by = ? WHERE id = ?', [req.user.username, id]);
    if (def.cash) postCash(def.table, id, def.cash(get(`SELECT * FROM ${def.table} WHERE id = ?`, [id])), req.user.username);
    audit(req.user.username, 'update', def.table, id, { before: row, after: data });
    res.json(get(`SELECT * FROM ${def.table} WHERE id = ?`, [id]));
  });

  r.delete('/r/:name/:id', (req, res) => {
    const def = R[req.params.name];
    if (!def) throw new HttpError(404, 'Unknown resource');
    access(req.user, def);
    const id = Number(req.params.id);
    const row = get<any>(`SELECT * FROM ${def.table} WHERE id = ?`, [id]);
    if (!row) throw new HttpError(404, 'Not found');
    if (def.verifyKey && row.checked) throw new HttpError(409, 'Already checked — cannot delete');
    if (def.table === 'bank_statements' && row.payment_id) throw new HttpError(409, 'Statement is matched to a payment — unmatch it first');
    if (def.table === 'bank_statements' && row.source) throw new HttpError(409, 'This line was posted by another screen — delete it there');
    if (def.softDelete) run(`UPDATE ${def.table} SET ${def.softDelete} = 1 WHERE id = ?`, [id]);
    else run(`DELETE FROM ${def.table} WHERE id = ?`, [id]);
    if (def.cash) unpostCash(def.table, id);
    audit(req.user.username, 'delete', def.table, id, row);
    res.json({ ok: true });
  });

  // Mark rows as checked/verified (ตรวจสอบแล้ว) — the "Checked / CheckedBy" pattern of the desktop app.
  r.post('/r/:name/check', (req, res) => {
    const def = R[req.params.name];
    if (!def?.verifyKey) throw new HttpError(404, 'Not checkable');
    access(req.user, def);
    if (!canVerify(req.user, def.verifyKey)) throw new HttpError(403, 'คุณไม่มีสิทธิ์ตรวจสอบรายการ / 您无权验证');
    const ids: number[] = (req.body.ids || []).map(Number);
    for (const id of ids) run(`UPDATE ${def.table} SET checked = 1, checked_by = ? WHERE id = ? AND checked = 0`, [req.user.username, id]);
    audit(req.user.username, 'check', def.table, undefined, ids);
    res.json({ ok: true, count: ids.length });
  });

  return r;
}
