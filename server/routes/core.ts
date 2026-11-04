// Auth, lookups, dashboard, settings, employees, permissions.
import { Router } from 'express';
import { all, get, run, tx, audit, DEFAULT_SETTINGS } from '../db.js';
import { HttpError, hashPassword, verifyPassword, issueSession, clearSession, needMenu, type SessionUser } from '../auth.js';
import { ALL_MENU_KEYS, VERIFY_KEYS } from '../../shared/menus.js';
import { bankBalance, latestExchangeRate, round2 } from '../logic.js';

export function loadUser(id: number): SessionUser | undefined {
  const e = get<any>('SELECT id, name, username, is_admin, role_id, is_active FROM employees WHERE id = ?', [id]);
  if (!e || !e.is_active) return;
  const menus = all<{ menu_key: string }>(
    `SELECT menu_key FROM role_menus WHERE role_id = ? UNION SELECT menu_key FROM user_menus WHERE employee_id = ?`, [e.role_id, id],
  ).map((r) => r.menu_key);
  const verify = all<{ verify_key: string }>('SELECT verify_key FROM verify_items WHERE employee_id = ?', [id]).map((r) => r.verify_key);
  return { id: e.id, name: e.name, username: e.username, is_admin: e.is_admin, role_id: e.role_id, menus: e.is_admin ? ALL_MENU_KEYS : menus, verify: e.is_admin ? VERIFY_KEYS.map((v) => v.key) : verify };
}

export function publicRouter() {
  const r = Router();
  r.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const e = get<any>('SELECT * FROM employees WHERE username = ?', [String(username || '')]);
    if (!e || !e.is_active || !verifyPassword(String(password || ''), e.password_hash)) {
      throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง / 用户名或密码错误');
    }
    issueSession(res, e.id);
    audit(e.username, 'login', 'employees', e.id);
    res.json(loadUser(e.id));
  });
  r.post('/logout', (_req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });
  return r;
}

export function coreRouter() {
  const r = Router();
  r.get('/me', (req, res) => res.json(req.user));

  r.post('/me/password', (req, res) => {
    const { current, next } = req.body || {};
    const e = get<any>('SELECT * FROM employees WHERE id = ?', [req.user.id]);
    if (!verifyPassword(String(current || ''), e.password_hash)) throw new HttpError(400, 'Current password is wrong');
    if (!next || String(next).length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
    run('UPDATE employees SET password_hash = ? WHERE id = ?', [hashPassword(String(next)), req.user.id]);
    res.json({ ok: true });
  });

  // Dropdown data that almost every screen needs (the gObj* globals of MainForm).
  r.get('/lookups', (_req, res) => {
    res.json({
      customers: all("SELECT id, code, firstname, lastname, nickname, calc_type FROM customers WHERE is_deleted = 0 ORDER BY code"),
      banks: all('SELECT id, name, nickname, account_name, account_number, is_thai, is_cash, is_active FROM banks ORDER BY is_thai DESC, id'),
      styles: all('SELECT s.id, s.en, s.zh, s.th, u.description AS unit FROM styles s LEFT JOIN style_units u ON u.id = s.unit_id WHERE s.is_deleted = 0 AND s.active = 1 ORDER BY s.id'),
      units: all('SELECT * FROM style_units ORDER BY id'),
      shipments: all('SELECT id, code, date, arrived_date FROM shipments ORDER BY date DESC, id DESC LIMIT 300'),
      expenseTypes: all('SELECT * FROM expense_types ORDER BY description'),
      provinces: all('SELECT * FROM provinces ORDER BY id'),
      statuses: all('SELECT * FROM payment_statuses ORDER BY id'),
      roles: all('SELECT * FROM roles ORDER BY id'),
      supplierBanks: all('SELECT * FROM supplier_banks WHERE is_deleted = 0 ORDER BY id DESC'),
      settings: Object.fromEntries(all<any>('SELECT key, value FROM settings').map((s) => [s.key, s.value])),
      rate: latestExchangeRate(),
    });
  });

  r.get('/dashboard', (_req, res) => {
    const banks = all<any>('SELECT id, name, is_thai, is_cash FROM banks WHERE is_active = 1').map((b) => ({ ...b, balance: bankBalance(b.id) }));
    const one = (sql: string, p: any[] = []) => (get<any>(sql, p) || {}).v || 0;
    res.json({
      banks,
      totalThb: round2(banks.filter((b) => b.is_thai).reduce((s, b) => s + b.balance, 0)),
      totalCny: round2(banks.filter((b) => !b.is_thai).reduce((s, b) => s + b.balance, 0)),
      customers: one('SELECT COUNT(*) AS v FROM customers WHERE is_deleted = 0'),
      pendingPayments: one('SELECT COUNT(*) AS v FROM payment_infos WHERE status_id = 1'),
      pendingAmount: round2(one('SELECT SUM(amount_check) AS v FROM payment_infos WHERE status_id = 1')),
      unpaidShipping: round2(one('SELECT SUM(total) AS v FROM shipment_summaries WHERE paid = 0')),
      unpaidBills: one('SELECT COUNT(*) AS v FROM packages WHERE is_done_paid = 0'),
      waitingToPack: one(`SELECT COUNT(*) AS v FROM order_items oi WHERE
        COALESCE((SELECT SUM(quantity) FROM package_items pi WHERE pi.order_item_id = oi.id),0) >
        COALESCE((SELECT SUM(quantity) FROM packing_items pk WHERE pk.order_item_id = oi.id),0)`),
      notLoaded: one('SELECT COUNT(*) AS v FROM packings WHERE shipment_id IS NULL'),
      unchecked: {
        expenses: one('SELECT COUNT(*) AS v FROM daily_expenses WHERE checked = 0'),
        transfers: one('SELECT COUNT(*) AS v FROM customer_transfers WHERE checked = 0'),
        accountTransfers: one('SELECT COUNT(*) AS v FROM account_transfers WHERE checked = 0'),
        otherIncome: one('SELECT COUNT(*) AS v FROM other_incomes WHERE checked = 0'),
        billPayments: one('SELECT COUNT(*) AS v FROM package_payments WHERE checked = 0'),
      },
      recentShipments: all(`SELECT s.id, s.code, s.date, s.arrived_date, s.status, s.status_date, COUNT(p.id) AS boxes, ROUND(SUM(p.weight), 2) AS weight
        FROM shipments s LEFT JOIN packings p ON p.shipment_id = s.id GROUP BY s.id ORDER BY s.date DESC, s.id DESC LIMIT 8`),
      rate: latestExchangeRate(),
    });
  });

  // ---- settings (GeneralSettingForm, PrinterSettingForm, PrintTextSettingForm)
  r.get('/settings', needMenu('settings'), (_req, res) => {
    res.json(Object.fromEntries(all<any>('SELECT key, value FROM settings').map((s) => [s.key, s.value])));
  });
  r.put('/settings', needMenu('settings'), (req, res) => {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (k in req.body) run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, String(req.body[k] ?? '')]);
    }
    audit(req.user.username, 'update', 'settings', undefined, req.body);
    res.json({ ok: true });
  });

  // ---- employees
  r.get('/employees', needMenu('employees', 'permission', 'verify'), (_req, res) => {
    res.json(all(`SELECT e.id, e.name, e.phone, e.address, e.email, e.role_id, e.salary, e.start_date, e.username, e.is_active, e.is_admin,
      r.description AS role FROM employees e LEFT JOIN roles r ON r.id = e.role_id ORDER BY e.id`));
  });
  const empFields = ['name', 'phone', 'address', 'email', 'role_id', 'salary', 'start_date', 'username', 'is_active'];
  r.post('/employees', needMenu('employees'), (req, res) => {
    const b = req.body;
    if (!b.name || !b.username || !b.password) throw new HttpError(400, 'Name, username and password are required');
    if (get('SELECT 1 FROM employees WHERE username = ?', [b.username])) throw new HttpError(409, 'Username already used');
    const { id } = run(`INSERT INTO employees (${empFields.join(',')}, password_hash) VALUES (${empFields.map(() => '?').join(',')}, ?)`,
      [...empFields.map((f) => (f === 'is_active' ? (b[f] === false ? 0 : 1) : b[f] ?? null)), hashPassword(String(b.password))]);
    audit(req.user.username, 'create', 'employees', id);
    res.json({ id });
  });
  r.put('/employees/:id', needMenu('employees'), (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    run(`UPDATE employees SET ${empFields.map((f) => `${f} = ?`).join(',')} WHERE id = ?`,
      [...empFields.map((f) => (f === 'is_active' ? (b[f] ? 1 : 0) : b[f] ?? null)), id]);
    if (b.password) run('UPDATE employees SET password_hash = ? WHERE id = ?', [hashPassword(String(b.password)), id]);
    audit(req.user.username, 'update', 'employees', id);
    res.json({ ok: true });
  });
  r.delete('/employees/:id', needMenu('employees'), (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'You cannot disable yourself');
    run('UPDATE employees SET is_active = 0 WHERE id = ?', [id]);
    res.json({ ok: true });
  });
  r.delete('/roles/:id', needMenu('employees'), (req, res) => {
    if (get('SELECT 1 FROM employees WHERE role_id = ?', [req.params.id])) {
      throw new HttpError(409, 'ไม่สามารถลบได้เนื่องจากตำแหน่งนี้มีพนักงานอยู่ / This role still has employees');
    }
    run('DELETE FROM roles WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ---- menu permissions per role and per user (EmployeeForm + UserPermissionForm)
  r.get('/permissions/:kind/:id', needMenu('permission', 'employees'), (req, res) => {
    const rows = req.params.kind === 'role'
      ? all<any>('SELECT menu_key FROM role_menus WHERE role_id = ?', [req.params.id])
      : all<any>('SELECT menu_key FROM user_menus WHERE employee_id = ?', [req.params.id]);
    res.json(rows.map((r) => r.menu_key));
  });
  r.put('/permissions/:kind/:id', needMenu('permission', 'employees'), (req, res) => {
    const keys: string[] = (req.body.keys || []).filter((k: string) => ALL_MENU_KEYS.includes(k));
    const id = Number(req.params.id);
    tx(() => {
      if (req.params.kind === 'role') {
        run('DELETE FROM role_menus WHERE role_id = ?', [id]);
        keys.forEach((k) => run('INSERT INTO role_menus VALUES (?, ?)', [id, k]));
      } else {
        run('DELETE FROM user_menus WHERE employee_id = ?', [id]);
        keys.forEach((k) => run('INSERT INTO user_menus VALUES (?, ?)', [id, k]));
      }
    });
    audit(req.user.username, 'permissions', req.params.kind, id, keys);
    res.json({ ok: true });
  });
  r.get('/verify/:employeeId', needMenu('verify'), (req, res) => {
    res.json(all<any>('SELECT verify_key FROM verify_items WHERE employee_id = ?', [req.params.employeeId]).map((r) => r.verify_key));
  });
  r.put('/verify/:employeeId', needMenu('verify'), (req, res) => {
    const id = Number(req.params.employeeId);
    const keys: string[] = (req.body.keys || []).filter((k: string) => VERIFY_KEYS.some((v) => v.key === k));
    tx(() => {
      run('DELETE FROM verify_items WHERE employee_id = ?', [id]);
      keys.forEach((k) => run('INSERT INTO verify_items VALUES (?, ?)', [id, k]));
    });
    res.json({ ok: true });
  });

  r.get('/audit', needMenu('employees'), (req, res) => {
    res.json(all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [Math.min(Number(req.query.limit) || 200, 2000)]));
  });
  return r;
}
