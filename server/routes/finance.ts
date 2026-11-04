// Payment notices + checking, customer deposit/withdraw, bank statements, exchange, unpaid summary.
import { Router } from 'express';
import { all, get, run, tx, audit } from '../db.js';
import { HttpError, needMenu, canVerify } from '../auth.js';
import {
  addBalance, removeBalanceBySource, customerBalance, bankBalance, packageTotals, postCash, unpostCash, round2, today, type Currency,
} from '../logic.js';

const PAYMENT_TYPES = ['topup', 'topup_cny', 'shipping', 'goods'] as const;
const PAYMENT_SELECT = `SELECT pi.*, c.code AS customer_code, c.firstname, b.name AS bank, s.code AS shipment_code, ps.text AS status
  FROM payment_infos pi JOIN customers c ON c.id = pi.customer_id LEFT JOIN banks b ON b.id = pi.bank_id
  LEFT JOIN shipments s ON s.id = pi.shipment_id LEFT JOIN payment_statuses ps ON ps.id = pi.status_id`;

function undoPayment(p: any) {
  removeBalanceBySource('payment', p.id);
  run('UPDATE bank_statements SET payment_id = NULL WHERE payment_id = ?', [p.id]);
  if (p.type === 'shipping' && p.shipment_id) run('UPDATE shipment_summaries SET paid = 0 WHERE shipment_id = ? AND customer_id = ?', [p.shipment_id, p.customer_id]);
}

export function financeRouter() {
  const r = Router();

  // ================= Payment notices (ThaiPaymentInfoForm / ThaiPaymentInfoEditForm)
  r.get('/payments', needMenu('customer.payment', 'payment.check'), (req, res) => {
    const w = ['1=1']; const p: any[] = [];
    if (req.query.customer_id) { w.push('pi.customer_id = ?'); p.push(req.query.customer_id); }
    if (req.query.status_id) { w.push('pi.status_id = ?'); p.push(req.query.status_id); }
    if (req.query.from) { w.push('COALESCE(pi.payment_date, pi.inform_date) >= ?'); p.push(req.query.from); }
    if (req.query.to) { w.push('COALESCE(pi.payment_date, pi.inform_date) <= ?'); p.push(req.query.to); }
    res.json(all(`${PAYMENT_SELECT} WHERE ${w.join(' AND ')} ORDER BY pi.id DESC LIMIT 2000`, p));
  });
  const payFields = ['customer_id', 'bank_id', 'payment_date', 'inform_date', 'description', 'amount_check', 'remark', 'reference', 'type',
    'exchange_rate', 'exchange_fee', 'shipment_id', 'pay_from'];
  const payValues = (b: any) => payFields.map((f) => (b[f] === '' || b[f] === undefined ? null : b[f]));
  r.post('/payments', needMenu('customer.payment', 'payment.check'), (req, res) => {
    const b = req.body;
    if (!b.customer_id) throw new HttpError(400, 'กรุณาเลือกลูกค้า / Choose a customer');
    if (!PAYMENT_TYPES.includes(b.type)) throw new HttpError(400, 'กรุณาเลือกว่าต้องการทำรายการอะไร / Choose a type');
    if (!(Number(b.amount_check) > 0)) throw new HttpError(400, 'กรุณาใส่ยอดเงิน / Enter an amount');
    if (b.pay_from !== 'balance' && b.pay_from !== 'yuan' && !b.bank_id) throw new HttpError(400, 'กรุณาเลือกช่องทางการโอนเงิน / Choose the bank');
    const { id } = run(`INSERT INTO payment_infos (${payFields.join(',')}) VALUES (${payFields.map(() => '?').join(',')})`,
      payValues({ inform_date: today(), pay_from: 'bank', ...b }));
    audit(req.user.username, 'create', 'payment_infos', id, b);
    res.json({ id });
  });
  r.put('/payments/:id', needMenu('customer.payment', 'payment.check'), (req, res) => {
    const p = get<any>('SELECT * FROM payment_infos WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Not found');
    if (p.status_id === 2) throw new HttpError(409, 'Approved already — reset it first');
    run(`UPDATE payment_infos SET ${payFields.map((f) => `${f} = ?`).join(',')} WHERE id = ?`, [...payValues({ ...p, ...req.body }), p.id]);
    res.json({ ok: true });
  });
  r.delete('/payments/:id', needMenu('customer.payment', 'payment.check'), (req, res) => {
    const p = get<any>('SELECT * FROM payment_infos WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Not found');
    if (p.status_id === 2) throw new HttpError(409, 'ไม่สามารถลบได้เนื่องจากรายการนี้ได้ตรวจสอบแล้ว / Approved already');
    run('DELETE FROM payment_infos WHERE id = ?', [p.id]);
    res.json({ ok: true });
  });

  // ================= Check payments (CheckPaymentForm): match notices to bank statement lines, then approve.
  r.get('/payments/check', needMenu('payment.check'), (_req, res) => {
    const pending = all<any>(`${PAYMENT_SELECT} WHERE pi.status_id = 1 ORDER BY pi.id`);
    res.json(pending.map((p) => {
      let candidates: any[] = [];
      if (p.bank_id && p.pay_from === 'bank') {
        const d = p.payment_date || p.inform_date || today();
        candidates = all(`SELECT s.*, b.name AS bank FROM bank_statements s JOIN banks b ON b.id = s.bank_id
          WHERE s.bank_id = ? AND s.payment_id IS NULL AND ABS(s.income - ?) < 0.01 AND s.date BETWEEN date(?, '-3 day') AND date(?, '+3 day')
          ORDER BY ABS(julianday(s.date) - julianday(?)) LIMIT 5`, [p.bank_id, p.amount_check, d, d, d]);
      }
      return {
        ...p, candidates,
        balance_thb: customerBalance(p.customer_id, 'THB'), balance_cny: customerBalance(p.customer_id, 'CNY'),
        shipment_due: p.shipment_id ? get<any>('SELECT total, paid FROM shipment_summaries WHERE shipment_id = ? AND customer_id = ?', [p.shipment_id, p.customer_id]) : null,
      };
    }));
  });
  r.post('/payments/:id/approve', needMenu('payment.check'), (req, res) => {
    if (!canVerify(req.user, 'payment')) throw new HttpError(403, 'คุณไม่มีสิทธิ์ตรวจสอบรายการ / 您无权验证');
    const p = get<any>(`${PAYMENT_SELECT} WHERE pi.id = ?`, [req.params.id]);
    if (!p) throw new HttpError(404, 'Not found');
    if (p.status_id === 2) throw new HttpError(409, 'Already approved');
    const b = req.body;
    const amount = round2(Number(b.amount_paid ?? p.amount_check));
    const rate = Number(b.exchange_rate ?? p.exchange_rate ?? 0);
    const fee = Number(b.exchange_fee ?? p.exchange_fee ?? 0);
    const date = b.payment_date || p.payment_date || today();
    const statementId = b.statement_id ? Number(b.statement_id) : null;
    const src = { source: 'payment', source_id: p.id, user: req.user.username, date, ref_code: p.reference || `PAY${p.id}` };
    tx(() => {
      if (p.pay_from === 'bank') {
        if (statementId) {
          const s = get<any>('SELECT * FROM bank_statements WHERE id = ?', [statementId]);
          if (!s || s.payment_id) throw new HttpError(409, 'Statement line is already matched');
          run('UPDATE bank_statements SET payment_id = ? WHERE id = ?', [p.id, statementId]);
        } else if (!b.force) {
          throw new HttpError(409, 'หาไม่เจอ ! No matching bank line — pick one or tick "approve without bank line"');
        }
      }
      const toCny = p.type === 'topup_cny' || p.type === 'goods';
      if (toCny && !(rate > 0)) throw new HttpError(400, 'Enter the exchange rate');
      const yuan = toCny ? round2((amount - fee) / rate) : 0;
      if (p.pay_from === 'bank') {
        if (toCny) {
          addBalance({ ...src, customer_id: p.customer_id, currency: 'THB', income: amount, description: `โอนเงินเข้ามา ${p.bank || ''}` });
          addBalance({ ...src, customer_id: p.customer_id, currency: 'THB', expense: amount, description: `แลกเงินหยวน @${rate}${fee ? ` fee ${fee}` : ''}` });
          addBalance({ ...src, customer_id: p.customer_id, currency: 'CNY', income: yuan, description: `เติมเงินเข้า balance เงินจีน @${rate}` });
        } else {
          addBalance({ ...src, customer_id: p.customer_id, currency: 'THB', income: amount,
            description: p.type === 'shipping' ? `ชำระค่าขนส่ง ${p.shipment_code || ''}` : `เติมเงินเข้า balance เงินไทย ${p.bank || ''}` });
        }
      } else if (p.pay_from === 'yuan' || (p.pay_from === 'balance' && toCny)) {
        // convert part of the THB balance into CNY balance (หักจาก balance เงินไทย -> เงินหยวน)
        if (customerBalance(p.customer_id, 'THB') < amount) throw new HttpError(409, 'ยอดเงินใน balance ไม่พอชำระ / THB balance is not enough');
        addBalance({ ...src, customer_id: p.customer_id, currency: 'THB', expense: amount, description: `หักจาก balance เงินไทย → หยวน @${rate}` });
        addBalance({ ...src, customer_id: p.customer_id, currency: 'CNY', income: yuan, description: `แลกจาก balance เงินไทย @${rate}` });
      } else if (p.pay_from === 'balance' && p.type === 'shipping') {
        if (customerBalance(p.customer_id, 'THB') < 0) throw new HttpError(409, 'ยอดเงินใน balance ไม่พอชำระ / THB balance is negative');
      }
      if (p.type === 'shipping' && p.shipment_id) {
        run('UPDATE shipment_summaries SET paid = 1 WHERE shipment_id = ? AND customer_id = ?', [p.shipment_id, p.customer_id]);
      }
      run(`UPDATE payment_infos SET status_id = 2, amount_paid = ?, payment_date = ?, exchange_rate = ?, exchange_fee = ?, statement_id = ?,
        checked_by = ?, checked_at = CURRENT_TIMESTAMP WHERE id = ?`, [amount, date, rate || null, fee || null, statementId, req.user.username, p.id]);
    });
    audit(req.user.username, 'approve', 'payment_infos', p.id, b);
    res.json({ ok: true });
  });
  r.post('/payments/:id/reject', needMenu('payment.check'), (req, res) => {
    if (!canVerify(req.user, 'payment')) throw new HttpError(403, 'คุณไม่มีสิทธิ์ตรวจสอบรายการ / 您无权验证');
    const p = get<any>('SELECT * FROM payment_infos WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Not found');
    tx(() => {
      if (p.status_id === 2) undoPayment(p);
      run('UPDATE payment_infos SET status_id = 3, remark = COALESCE(?, remark), checked_by = ?, checked_at = CURRENT_TIMESTAMP WHERE id = ?',
        [req.body.remark || null, req.user.username, p.id]);
    });
    res.json({ ok: true });
  });
  r.post('/payments/:id/reset', needMenu('payment.check'), (req, res) => {
    if (!canVerify(req.user, 'payment')) throw new HttpError(403, 'คุณไม่มีสิทธิ์ตรวจสอบรายการ / 您无权验证');
    const p = get<any>('SELECT * FROM payment_infos WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Not found');
    tx(() => {
      undoPayment(p);
      run('UPDATE payment_infos SET status_id = 1, amount_paid = NULL, statement_id = NULL, checked_by = NULL, checked_at = NULL WHERE id = ?', [p.id]);
    });
    audit(req.user.username, 'reset', 'payment_infos', p.id);
    res.json({ ok: true });
  });

  // ================= Customer deposit / withdraw in China (CNY) or Thailand (THB)
  const trMenu = (region: string) => (region === 'CN' ? 'transfer.china' : 'transfer.thai');
  const trGuard = (req: any, res: any, next: any) => needMenu(trMenu(req.params.region))(req, res, next);
  function postTransfer(t: any, user: string) {
    const currency: Currency = t.region === 'CN' ? 'CNY' : 'THB';
    removeBalanceBySource('transfer', t.id);
    const label = t.region === 'CN' ? (t.income ? '中国来钱 ฝากเงินที่เมืองจีน' : '中国拿钱 ถอนเงินที่เมืองจีน') : (t.income ? 'ฝากเงินที่เมืองไทย' : 'ถอนเงินที่เมืองไทย');
    if (t.income) addBalance({ customer_id: t.customer_id, currency, income: t.income, ref_code: t.ref_code, description: `${label} ${t.remark || ''}`, date: t.date, source: 'transfer', source_id: t.id, user });
    if (t.expense) addBalance({ customer_id: t.customer_id, currency, expense: t.expense, ref_code: t.ref_code, description: `${label} ${t.remark || ''}`, date: t.date, source: 'transfer', source_id: t.id, user });
    if (t.service_fee) addBalance({ customer_id: t.customer_id, currency, expense: t.service_fee, ref_code: t.ref_code, description: 'ค่าบริการ 服务费', date: t.date, source: 'transfer', source_id: t.id, user });
    postCash('transfer', t.id, [{ bank_id: t.bank_id, date: t.date, income: t.income, expense: (t.expense || 0) + (t.bank_fee || 0), detail: `${label} ${t.ref_code || ''}` }], user);
  }
  r.get('/transfers/:region', trGuard, (req, res) => {
    const w = ['t.region = ?']; const p: any[] = [req.params.region];
    if (req.query.customer_id) { w.push('t.customer_id = ?'); p.push(req.query.customer_id); }
    if (req.query.from) { w.push('t.date >= ?'); p.push(req.query.from); }
    if (req.query.to) { w.push('t.date <= ?'); p.push(req.query.to); }
    if (req.query.checked === '0' || req.query.checked === '1') { w.push('t.checked = ?'); p.push(Number(req.query.checked)); }
    res.json(all(`SELECT t.*, c.code AS customer_code, b.name AS bank, b.is_cash FROM customer_transfers t JOIN customers c ON c.id = t.customer_id
      LEFT JOIN banks b ON b.id = t.bank_id WHERE ${w.join(' AND ')} ORDER BY t.date DESC, t.id DESC LIMIT 2000`, p));
  });
  const trFields = ['customer_id', 'ref_code', 'date', 'income', 'expense', 'bank_fee', 'service_fee', 'company_cost', 'remark', 'bank_id'];
  r.post('/transfers/:region', trGuard, (req, res) => {
    const b = req.body;
    if (!b.customer_id) throw new HttpError(400, 'กรุณาเลือกลูกค้า / Choose a customer');
    if (!Number(b.income) && !Number(b.expense)) throw new HttpError(400, 'กรุณาใส่ยอดเงิน / Enter an amount');
    const id = tx(() => {
      const { id } = run(`INSERT INTO customer_transfers (region, ${trFields.join(',')}, created_by) VALUES (?, ${trFields.map(() => '?').join(',')}, ?)`,
        [req.params.region, ...trFields.map((f) => (b[f] === '' || b[f] === undefined ? (['income', 'expense', 'bank_fee', 'service_fee', 'company_cost'].includes(f) ? 0 : null) : b[f])), req.user.username]);
      postTransfer(get('SELECT * FROM customer_transfers WHERE id = ?', [id]), req.user.username);
      return id;
    });
    audit(req.user.username, 'create', 'customer_transfers', id, b);
    res.json({ id });
  });
  r.put('/transfers/:region/:id', trGuard, (req, res) => {
    const t = get<any>('SELECT * FROM customer_transfers WHERE id = ?', [req.params.id]);
    if (!t) throw new HttpError(404, 'Not found');
    if (t.checked) throw new HttpError(409, 'Already checked — cannot edit');
    const b = { ...t, ...req.body };
    tx(() => {
      run(`UPDATE customer_transfers SET ${trFields.map((f) => `${f} = ?`).join(',')} WHERE id = ?`, [...trFields.map((f) => b[f] === '' ? null : b[f]), t.id]);
      postTransfer(get('SELECT * FROM customer_transfers WHERE id = ?', [t.id]), req.user.username);
    });
    res.json({ ok: true });
  });
  r.delete('/transfers/:region/:id', trGuard, (req, res) => {
    const t = get<any>('SELECT * FROM customer_transfers WHERE id = ?', [req.params.id]);
    if (!t) throw new HttpError(404, 'Not found');
    if (t.checked) throw new HttpError(409, 'ไม่สามารถลบได้เนื่องจากรายการนี้ได้ตรวจสอบแล้ว / Already checked');
    tx(() => { removeBalanceBySource('transfer', t.id); unpostCash('transfer', t.id); run('DELETE FROM customer_transfers WHERE id = ?', [t.id]); });
    audit(req.user.username, 'delete', 'customer_transfers', t.id, t);
    res.json({ ok: true });
  });
  r.post('/transfers/:region/check', trGuard, (req, res) => {
    if (!canVerify(req.user, 'transfer')) throw new HttpError(403, 'คุณไม่มีสิทธิ์ตรวจสอบรายการ / 您无权验证');
    for (const id of req.body.ids || []) run('UPDATE customer_transfers SET checked = 1, checked_by = ? WHERE id = ?', [req.user.username, id]);
    res.json({ ok: true });
  });

  // ================= Bank statements with running balance (ViewBankStatementForm)
  r.get('/bank/statements', needMenu('bank.statement'), (req, res) => {
    const bankId = Number(req.query.bank_id);
    if (!bankId) return res.json({ rows: [], opening: 0, closing: 0 });
    const bank = get<any>('SELECT * FROM banks WHERE id = ?', [bankId]);
    const from = String(req.query.from || '0000-01-01');
    const to = String(req.query.to || '9999-12-31');
    const before = get<any>('SELECT COALESCE(SUM(income - expense), 0) AS s FROM bank_statements WHERE bank_id = ? AND date < ?', [bankId, from]).s;
    const opening = round2(bank.opening_balance + before);
    let bal = opening;
    let rows = all<any>(`SELECT s.*, c.code AS customer_code, pi.id AS payment_ref FROM bank_statements s
      LEFT JOIN payment_infos pi ON pi.id = s.payment_id LEFT JOIN customers c ON c.id = pi.customer_id
      WHERE s.bank_id = ? AND s.date BETWEEN ? AND ? ORDER BY s.date, s.id`, [bankId, from, to])
      .map((s) => { bal = round2(bal + s.income - s.expense); return { ...s, balance: bal }; });
    const closing = bal;
    if (req.query.amount) rows = rows.filter((s) => Math.abs(s.income - Number(req.query.amount)) < 0.01 || Math.abs(s.expense - Number(req.query.amount)) < 0.01);
    if (req.query.q) { const q = String(req.query.q).toLowerCase(); rows = rows.filter((s) => `${s.detail} ${s.bank_detail}`.toLowerCase().includes(q)); }
    if (req.query.unmatched === '1') rows = rows.filter((s) => s.income > 0 && !s.payment_id && !s.source);
    res.json({ bank, opening, closing, rows });
  });
  // "ดูยอดที่หาเจ้าของไม่เจอ" — incoming money not matched to any customer notice, across all banks
  r.get('/bank/unmatched', needMenu('bank.statement', 'payment.check'), (_req, res) => {
    res.json(all(`SELECT s.*, b.name AS bank FROM bank_statements s JOIN banks b ON b.id = s.bank_id
      WHERE s.income > 0 AND s.payment_id IS NULL AND s.source IS NULL ORDER BY s.date DESC LIMIT 500`));
  });
  // GetBankStatementForm: rows are parsed in the browser (column mapping per bank), saved here with duplicate detection.
  r.post('/bank/import', needMenu('bank.import'), (req, res) => {
    const bankId = Number(req.body.bank_id);
    if (!get('SELECT 1 FROM banks WHERE id = ?', [bankId])) throw new HttpError(400, 'กรุณาเลือกธนาคาร / Choose a bank');
    const rows: any[] = req.body.rows || [];
    let added = 0; let skipped = 0;
    tx(() => {
      for (const r of rows) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) { skipped++; continue; }
        const income = round2(Number(r.income || 0)); const expense = round2(Number(r.expense || 0));
        if (!income && !expense) { skipped++; continue; }
        if (get('SELECT 1 FROM bank_statements WHERE bank_id = ? AND date = ? AND income = ? AND expense = ? AND COALESCE(bank_detail, \'\') = ?',
          [bankId, r.date, income, expense, r.bank_detail || ''])) { skipped++; continue; }
        run('INSERT INTO bank_statements (bank_id, date, income, expense, detail, bank_detail, created_by) VALUES (?,?,?,?,?,?,?)',
          [bankId, r.date, income, expense, r.detail || null, r.bank_detail || null, req.user.username]);
        added++;
      }
    });
    audit(req.user.username, 'import', 'bank_statements', bankId, { added, skipped });
    res.json({ added, skipped });
  });
  r.get('/bank/total', needMenu('bank.total', 'dashboard'), (_req, res) => {
    const banks = all<any>('SELECT * FROM banks WHERE is_active = 1 ORDER BY is_thai DESC, id').map((b) => ({ ...b, balance: bankBalance(b.id) }));
    const custThb = get<any>("SELECT COALESCE(SUM(income-expense),0) AS s FROM customer_balances WHERE currency='THB'").s;
    const custCny = get<any>("SELECT COALESCE(SUM(income-expense),0) AS s FROM customer_balances WHERE currency='CNY'").s;
    res.json({
      banks,
      totalThb: round2(banks.filter((b) => b.is_thai).reduce((s, b) => s + b.balance, 0)),
      totalCny: round2(banks.filter((b) => !b.is_thai).reduce((s, b) => s + b.balance, 0)),
      customerThb: round2(custThb), customerCny: round2(custCny),
    });
  });

  // ================= Currency exchange (ExchageRateForm): daily rate + company THB→CNY exchange batches
  r.get('/exchanges', needMenu('exchange'), (req, res) => {
    const w = ['1=1']; const p: any[] = [];
    if (req.query.from) { w.push('e.date >= ?'); p.push(req.query.from); }
    if (req.query.to) { w.push('e.date <= ?'); p.push(req.query.to); }
    if (req.query.checked === '0' || req.query.checked === '1') { w.push('e.checked = ?'); p.push(Number(req.query.checked)); }
    const rows = all<any>(`SELECT e.*,
        COALESCE((SELECT SUM(amount) FROM exchange_items i WHERE i.exchange_id = e.id AND i.is_thai = 1),0) AS paid_thb,
        COALESCE((SELECT SUM(amount) FROM exchange_items i WHERE i.exchange_id = e.id AND i.is_thai = 0),0) AS got_cny
      FROM exchanges e WHERE ${w.join(' AND ')} ORDER BY e.date DESC, e.id DESC`, p);
    res.json(rows.map((e) => ({ ...e, complete: Math.abs(e.paid_thb - e.baht_amount) < 0.01 && Math.abs(e.got_cny - e.yuan_amount) < 0.01 })));
  });
  r.get('/exchanges/:id', needMenu('exchange'), (req, res) => {
    const e = get<any>('SELECT * FROM exchanges WHERE id = ?', [req.params.id]);
    if (!e) throw new HttpError(404, 'Not found');
    e.items = all('SELECT i.*, b.name AS bank FROM exchange_items i LEFT JOIN banks b ON b.id = i.bank_id WHERE exchange_id = ? ORDER BY i.is_thai DESC, i.id', [e.id]);
    res.json(e);
  });
  r.post('/exchanges', needMenu('exchange'), (req, res) => {
    const b = req.body;
    const rate = Number(b.rate); const yuan = Number(b.yuan_amount);
    if (!(rate > 0) || !(yuan > 0)) throw new HttpError(400, 'Enter rate and yuan amount');
    const { id } = run('INSERT INTO exchanges (date, rate, yuan_amount, baht_amount, created_by) VALUES (?,?,?,?,?)',
      [b.date || today(), rate, yuan, round2(yuan * rate), req.user.username]);
    res.json({ id });
  });
  r.delete('/exchanges/:id', needMenu('exchange'), (req, res) => {
    const e = get<any>('SELECT * FROM exchanges WHERE id = ?', [req.params.id]);
    if (e?.checked) throw new HttpError(409, 'Already checked');
    for (const i of all<any>('SELECT id FROM exchange_items WHERE exchange_id = ?', [req.params.id])) unpostCash('exchange_item', i.id);
    run('DELETE FROM exchanges WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });
  r.post('/exchanges/:id/items', needMenu('exchange'), (req, res) => {
    const b = req.body;
    if (!b.bank_id || !(Number(b.amount) > 0)) throw new HttpError(400, 'Choose bank and amount');
    const isThai = b.is_thai ? 1 : 0;
    const { id } = run('INSERT INTO exchange_items (exchange_id, bank_id, date, amount, bank_fee, is_thai, created_by) VALUES (?,?,?,?,?,?,?)',
      [req.params.id, b.bank_id, b.date || today(), Number(b.amount), Number(b.bank_fee || 0), isThai, req.user.username]);
    postCash('exchange_item', id, [isThai
      ? { bank_id: b.bank_id, date: b.date || today(), expense: Number(b.amount) + Number(b.bank_fee || 0), detail: 'แลกเงินไทย->เป็นเงินจีน' }
      : { bank_id: b.bank_id, date: b.date || today(), income: Number(b.amount) - Number(b.bank_fee || 0), detail: 'แลกเงินหยวนเข้ามา' }], req.user.username);
    res.json({ id });
  });
  r.delete('/exchange-items/:id', needMenu('exchange'), (req, res) => {
    unpostCash('exchange_item', Number(req.params.id));
    run('DELETE FROM exchange_items WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });
  r.post('/exchanges/check', needMenu('exchange'), (req, res) => {
    if (!canVerify(req.user, 'exchange')) throw new HttpError(403, 'คุณไม่มีสิทธิ์ตรวจสอบรายการ / 您无权验证');
    for (const id of req.body.ids || []) run("UPDATE exchanges SET checked = 1, checked_by = ?, status = 'done' WHERE id = ?", [req.user.username, id]);
    res.json({ ok: true });
  });

  // ================= Unpaid summary (UnpaidForm): who owes shipping and goods money
  r.get('/unpaid', needMenu('unpaid'), (req, res) => {
    const shipping = all<any>(`SELECT ss.*, s.code AS shipment_code, s.date AS shipment_date, c.code AS customer_code
      FROM shipment_summaries ss JOIN shipments s ON s.id = ss.shipment_id JOIN customers c ON c.id = ss.customer_id
      WHERE ss.paid = 0 ORDER BY c.code, s.date`);
    const bills = all<any>(`SELECT k.*, c.code AS customer_code, sb.bank AS supplier_bank, sb.account_name AS supplier_account
      FROM packages k JOIN customers c ON c.id = k.customer_id LEFT JOIN supplier_banks sb ON sb.id = k.supplier_bank_id
      WHERE k.is_done_paid = 0 ${req.query.supplier ? 'AND (sb.account_name LIKE ? OR sb.bank LIKE ? OR sb.account_number LIKE ?)' : ''}
      ORDER BY c.code, k.date`, req.query.supplier ? [1, 2, 3].map(() => `%${req.query.supplier}%`) : [])
      .map((k) => ({ ...k, ...packageTotals(k.id) })).filter((k) => k.remaining > 0.001);
    const byCustomer: Record<string, any> = {};
    for (const s of shipping) {
      const c = (byCustomer[s.customer_id] ||= { customer_id: s.customer_id, customer_code: s.customer_code, shipping_thb: 0, shipping_cny: 0, bills_cny: 0 });
      if (s.currency === 'CNY') c.shipping_cny = round2(c.shipping_cny + s.total); else c.shipping_thb = round2(c.shipping_thb + s.total);
    }
    for (const k of bills) {
      const c = (byCustomer[k.customer_id] ||= { customer_id: k.customer_id, customer_code: k.customer_code, shipping_thb: 0, shipping_cny: 0, bills_cny: 0 });
      c.bills_cny = round2(c.bills_cny + k.remaining);
    }
    const customers = Object.values(byCustomer).map((c: any) => ({
      ...c, balance_thb: customerBalance(c.customer_id, 'THB'), balance_cny: customerBalance(c.customer_id, 'CNY'),
    }));
    res.json({ customers, shipping, bills });
  });

  return r;
}
