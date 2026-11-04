// Customers, balances, orders, supplier bills (packages) and bill payments.
import { Router } from 'express';
import { all, get, run, tx, audit } from '../db.js';
import { HttpError, needMenu, canVerify } from '../auth.js';
import {
  addBalance, removeBalanceBySource, postCash, unpostCash, customerBalance, orderItemProgress, packageTotals, nextPackageCode, round2, today, type Currency,
} from '../logic.js';

const CUSTOMER_FIELDS = ['code', 'firstname', 'lastname', 'nickname', 'phone', 'email', 'kilo_rate', 'cubic_rate', 'kilo_rate_yuan',
  'cubic_rate_yuan', 'calc_type', 'credit_limit', 'username', 'remark', 'parent_id', 'recommender_id'];

export function salesRouter() {
  const r = Router();

  // ================= Customers (CustomerInfo / CustomerInfoEdit)
  r.get('/customers', needMenu('customer.info', 'customer.balance', 'customer.yuan'), (req, res) => {
    const q = String(req.query.q || '');
    const by = String(req.query.by || 'all');
    const cols: Record<string, string[]> = {
      code: ['c.code'], firstname: ['c.firstname', 'c.lastname'], nickname: ['c.nickname'], phone: ['c.phone'], email: ['c.email'],
      all: ['c.code', 'c.firstname', 'c.lastname', 'c.nickname', 'c.phone', 'c.email', 'c.username'],
    };
    const use = cols[by] || cols.all;
    const where = q ? `AND (${use.map((c) => `${c} LIKE ?`).join(' OR ')})` : '';
    res.json(all(`SELECT c.*, p.code AS parent_code, rc.code AS recommender_code,
        COALESCE((SELECT SUM(income-expense) FROM customer_balances b WHERE b.customer_id = c.id AND b.currency='THB'),0) AS balance_thb,
        COALESCE((SELECT SUM(income-expense) FROM customer_balances b WHERE b.customer_id = c.id AND b.currency='CNY'),0) AS balance_cny,
        COALESCE((SELECT SUM(total) FROM shipment_summaries ss WHERE ss.customer_id = c.id AND ss.paid = 0),0) AS shipping_due
      FROM customers c LEFT JOIN customers p ON p.id = c.parent_id LEFT JOIN customers rc ON rc.id = c.recommender_id
      WHERE c.is_deleted = 0 ${where} ORDER BY c.code`, q ? use.map(() => `%${q}%`) : []));
  });
  r.get('/customers/:id', (req, res) => {
    const c = get<any>('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!c) throw new HttpError(404, 'Customer not found');
    c.addresses = all('SELECT a.*, p.name AS province FROM customer_addresses a LEFT JOIN provinces p ON p.id = a.province_id WHERE customer_id = ?', [c.id]);
    c.balance_thb = customerBalance(c.id, 'THB');
    c.balance_cny = customerBalance(c.id, 'CNY');
    // shipping charges posted but not yet marked paid (shown as its own figure on the customer screen)
    c.shipping_due = round2(get<any>('SELECT COALESCE(SUM(total),0) AS v FROM shipment_summaries WHERE customer_id = ? AND paid = 0', [c.id]).v);
    res.json(c);
  });
  const custValues = (b: any) => CUSTOMER_FIELDS.map((f) => (b[f] === '' || b[f] === undefined ? null : b[f]));
  r.post('/customers', needMenu('customer.info'), (req, res) => {
    const b = req.body;
    if (!b.code) throw new HttpError(400, 'CODE is required');
    if (get('SELECT 1 FROM customers WHERE code = ?', [b.code])) throw new HttpError(409, 'CODE นี้ซ้ำแล้วกรุณาเปลี่ยนใหม่ / CODE already exists');
    const { id } = run(`INSERT INTO customers (${CUSTOMER_FIELDS.join(',')}, edited_by) VALUES (${CUSTOMER_FIELDS.map(() => '?').join(',')}, ?)`,
      [...custValues(b), req.user.username]);
    audit(req.user.username, 'create', 'customers', id);
    res.json({ id });
  });
  r.put('/customers/:id', needMenu('customer.info'), (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    if (b.code && get('SELECT 1 FROM customers WHERE code = ? AND id <> ?', [b.code, id])) throw new HttpError(409, 'CODE นี้ซ้ำแล้วกรุณาเปลี่ยนใหม่ / CODE already exists');
    run(`UPDATE customers SET ${CUSTOMER_FIELDS.map((f) => `${f} = ?`).join(',')}, edited_by = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...custValues(b), req.user.username, id]);
    audit(req.user.username, 'update', 'customers', id);
    res.json({ ok: true });
  });
  r.delete('/customers/:id', needMenu('customer.info'), (req, res) => {
    run('UPDATE customers SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    audit(req.user.username, 'delete', 'customers', Number(req.params.id));
    res.json({ ok: true });
  });

  // ================= Customer balances THB / CNY (CustomerBalanceForm / CustomerBalanceYuanForm)
  const balMenu = (c: string) => (c === 'CNY' ? 'customer.yuan' : 'customer.balance');
  r.get('/balances/:currency', (req, res, next) => needMenu(balMenu(req.params.currency))(req, res, next), (req, res) => {
    const currency = req.params.currency as Currency;
    const cid = req.query.customer_id ? Number(req.query.customer_id) : null;
    const where = ['b.currency = ?'];
    const p: any[] = [currency];
    if (cid) { where.push('b.customer_id = ?'); p.push(cid); }
    let rows = all<any>(`SELECT b.*, c.code AS customer_code FROM customer_balances b JOIN customers c ON c.id = b.customer_id
      WHERE ${where.join(' AND ')} ORDER BY b.customer_id, b.date, b.id`, p);
    // running balance per customer
    const run_: Record<number, number> = {};
    rows = rows.map((x) => { run_[x.customer_id] = round2((run_[x.customer_id] || 0) + x.income - x.expense); return { ...x, balance: run_[x.customer_id] }; });
    if (req.query.from) rows = rows.filter((x) => x.date >= String(req.query.from));
    if (req.query.to) rows = rows.filter((x) => x.date <= String(req.query.to));
    rows.sort((a, b) => (b.date + String(b.id).padStart(9, '0')).localeCompare(a.date + String(a.id).padStart(9, '0')));
    res.json({ rows, balance: cid ? customerBalance(cid, currency) : null });
  });
  r.post('/balances/:currency', (req, res, next) => needMenu(balMenu(req.params.currency))(req, res, next), (req, res) => {
    const b = req.body;
    if (!b.customer_id) throw new HttpError(400, 'กรุณาเลือกลูกค้า / Choose a customer');
    const id = addBalance({
      customer_id: Number(b.customer_id), currency: req.params.currency as Currency, income: Number(b.income || 0), expense: Number(b.expense || 0),
      ref_code: b.ref_code, description: b.description, date: b.date, user: req.user.username,
    });
    audit(req.user.username, 'create', 'customer_balances', id, b);
    res.json({ id });
  });
  r.put('/balances/:currency/:id', (req, res, next) => needMenu(balMenu(req.params.currency))(req, res, next), (req, res) => {
    const row = get<any>('SELECT * FROM customer_balances WHERE id = ?', [req.params.id]);
    if (!row) throw new HttpError(404, 'Not found');
    if (row.source !== 'manual') throw new HttpError(409, 'This line was created by another screen — edit it there');
    const b = req.body;
    const history = `${row.edit_history || ''}${new Date().toISOString()} ${req.user.username}: ${row.income}/${row.expense} -> ${b.income}/${b.expense}\n`;
    run(`UPDATE customer_balances SET ref_code=?, description=?, date=?, income=?, expense=?, edited_by=?, edit_history=? WHERE id = ?`,
      [b.ref_code ?? null, b.description ?? null, b.date || row.date, Number(b.income || 0), Number(b.expense || 0), req.user.username, history, row.id]);
    res.json({ ok: true });
  });
  r.delete('/balances/:currency/:id', (req, res, next) => needMenu(balMenu(req.params.currency))(req, res, next), (req, res) => {
    const row = get<any>('SELECT * FROM customer_balances WHERE id = ?', [req.params.id]);
    if (!row) throw new HttpError(404, 'Not found');
    if (row.source !== 'manual') throw new HttpError(409, 'This line was created by another screen — remove it there');
    run('DELETE FROM customer_balances WHERE id = ?', [row.id]);
    audit(req.user.username, 'delete', 'customer_balances', row.id, row);
    res.json({ ok: true });
  });

  // ================= Orders (NewOrderForm / SearchOrderForm)
  r.get('/orders', needMenu('order.search', 'order.new', 'package.new'), (req, res) => {
    const w: string[] = ['1=1'];
    const p: any[] = [];
    if (req.query.customer_id) { w.push('o.customer_id = ?'); p.push(req.query.customer_id); }
    if (req.query.id) { w.push('(o.id = ? OR o.order_no LIKE ?)'); p.push(req.query.id, `%${req.query.id}%`); }
    if (req.query.from) { w.push('o.order_date >= ?'); p.push(req.query.from); }
    if (req.query.to) { w.push('o.order_date <= ?'); p.push(req.query.to); }
    if (req.query.q) { w.push('(o.supplier_name LIKE ? OR EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.product_id LIKE ?))'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    // one box for everything (replaces the old "lookup" screen): order no., shop, product id or supplier bill code
    if (req.query.search) {
      const s = String(req.query.search).trim();
      w.push(`(CAST(o.id AS TEXT) = ? OR o.order_no LIKE ? OR o.supplier_name LIKE ?
        OR EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.product_id LIKE ?)
        OR EXISTS (SELECT 1 FROM order_items x JOIN package_items pi ON pi.order_item_id = x.id JOIN packages k ON k.id = pi.package_id WHERE x.order_id = o.id AND k.code LIKE ?))`);
      p.push(s.replace(/^#/, ''), `%${s}%`, `%${s}%`, `%${s}%`, `%${s}%`);
    }
    res.json(all(`SELECT o.*, c.code AS customer_code, c.firstname, c.nickname,
        (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS lines,
        (SELECT COALESCE(SUM(quantity*unit_price),0) FROM order_items i WHERE i.order_id = o.id) AS total,
        (SELECT COALESCE(SUM(quantity),0) FROM order_items i WHERE i.order_id = o.id) AS qty,
        (SELECT COALESCE(SUM(pi.quantity),0) FROM package_items pi JOIN order_items i ON i.id = pi.order_item_id WHERE i.order_id = o.id) AS received_qty
        ,(SELECT COALESCE(SUM(pk.quantity),0) FROM packing_items pk JOIN order_items i ON i.id = pk.order_item_id WHERE i.order_id = o.id) AS packed_qty
      FROM orders o JOIN customers c ON c.id = o.customer_id WHERE ${w.join(' AND ')} ORDER BY o.id DESC LIMIT 1000`, p));
  });
  r.get('/orders/:id', (req, res) => {
    const o = get<any>('SELECT o.*, c.code AS customer_code FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [req.params.id]);
    if (!o) throw new HttpError(404, 'ไม่พบออเดอร์ / Order not found');
    o.items = orderItemProgress('oi.order_id = ?', [o.id]);
    // Shop bank used last time for this shop, so a new bill from this order can start with it.
    o.last_supplier_bank_id = o.supplier_name ? get<any>(`SELECT k.supplier_bank_id AS id FROM packages k
      JOIN package_items pi ON pi.package_id = k.id JOIN order_items oi ON oi.id = pi.order_item_id JOIN orders x ON x.id = oi.order_id
      WHERE x.supplier_name = ? AND k.supplier_bank_id IS NOT NULL ORDER BY k.date DESC, k.id DESC LIMIT 1`, [o.supplier_name])?.id ?? null : null;
    res.json(o);
  });
  function saveOrderItems(orderId: number, items: any[]) {
    const keep = new Set<number>();
    for (const it of items) {
      if (!it.product_id && !it.style_id) throw new HttpError(400, 'ระบุรหัสสินค้า / Enter a product id');
      if (!(Number(it.quantity) > 0)) throw new HttpError(400, 'ระบุจำนวน / Enter a quantity');
      if (it.id) {
        const used = get<any>('SELECT COALESCE(SUM(quantity),0) AS q FROM package_items WHERE order_item_id = ?', [it.id]).q;
        if (Number(it.quantity) < used) throw new HttpError(409, `Line ${it.product_id}: already received ${used}, quantity cannot be lower`);
        run('UPDATE order_items SET product_id=?, style_id=?, unit_price=?, quantity=? WHERE id = ? AND order_id = ?',
          [it.product_id || null, it.style_id || null, Number(it.unit_price || 0), Number(it.quantity), it.id, orderId]);
        keep.add(Number(it.id));
      } else {
        keep.add(run('INSERT INTO order_items (order_id, product_id, style_id, unit_price, quantity) VALUES (?,?,?,?,?)',
          [orderId, it.product_id || null, it.style_id || null, Number(it.unit_price || 0), Number(it.quantity)]).id);
      }
    }
    for (const old of all<any>('SELECT id FROM order_items WHERE order_id = ?', [orderId])) {
      if (keep.has(old.id)) continue;
      if (get('SELECT 1 FROM package_items WHERE order_item_id = ?', [old.id]) || get('SELECT 1 FROM packing_items WHERE order_item_id = ?', [old.id])) {
        throw new HttpError(409, 'ไม่สามารถลบได้เนื่องจากรายการนี้รับของไปแล้ว / A removed line was already received');
      }
      run('DELETE FROM order_items WHERE id = ?', [old.id]);
    }
  }
  // shop / platform order number typed by staff (e.g. Taobao order no.); must be unique when given
  function orderNo(b: any, selfId?: number) {
    const no = String(b.order_no ?? '').trim() || null;
    if (no && get('SELECT 1 FROM orders WHERE order_no = ? AND id <> ?', [no, selfId ?? 0])) throw new HttpError(409, `เลขออเดอร์ ${no} ซ้ำ / Order number already used`);
    return no;
  }
  r.post('/orders', needMenu('order.new', 'packing.new'), (req, res) => {
    const b = req.body;
    if (!b.customer_id) throw new HttpError(400, 'กรุณาเลือกลูกค้าด้วย / Choose a customer');
    if (!b.items?.length) throw new HttpError(400, 'Add at least one line');
    const id = tx(() => {
      const { id } = run(`INSERT INTO orders (customer_id, order_no, supplier_name, supplier_phone, order_date, payment_type, deposit, created_by)
        VALUES (?,?,?,?,?,?,?,?)`, [b.customer_id, orderNo(b), b.supplier_name || null, b.supplier_phone || null, b.order_date || today(),
        b.payment_type || 'credit', Number(b.deposit || 0), req.user.username]);
      saveOrderItems(id, b.items);
      return id;
    });
    audit(req.user.username, 'create', 'orders', id);
    res.json({ id });
  });
  r.put('/orders/:id', needMenu('order.new', 'order.search'), (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    tx(() => {
      run('UPDATE orders SET customer_id=?, order_no=?, supplier_name=?, supplier_phone=?, order_date=?, payment_type=?, deposit=? WHERE id = ?',
        [b.customer_id, orderNo(b, id), b.supplier_name || null, b.supplier_phone || null, b.order_date, b.payment_type || 'credit', Number(b.deposit || 0), id]);
      saveOrderItems(id, b.items || []);
    });
    audit(req.user.username, 'update', 'orders', id);
    res.json({ ok: true });
  });
  r.delete('/orders/:id', needMenu('order.search'), (req, res) => {
    const id = Number(req.params.id);
    if (get('SELECT 1 FROM package_items pi JOIN order_items oi ON oi.id = pi.order_item_id WHERE oi.order_id = ?', [id])) {
      throw new HttpError(409, 'ไม่สามารถลบได้เนื่องจากรายการนี้รับของไปแล้ว / Order already received');
    }
    if (get('SELECT 1 FROM packing_items pi JOIN order_items oi ON oi.id = pi.order_item_id WHERE oi.order_id = ?', [id])) {
      throw new HttpError(409, 'Order already packed');
    }
    run('DELETE FROM orders WHERE id = ?', [id]);
    audit(req.user.username, 'delete', 'orders', id);
    res.json({ ok: true });
  });

  // ================= Supplier bills / receive goods (NewPackageForm, ReceiveForm, SearchInvoiceForm)
  r.get('/packages/waiting', needMenu('package.new'), (req, res) => {
    const rows = orderItemProgress(req.query.customer_id ? 'o.customer_id = ?' : '1=1', req.query.customer_id ? [req.query.customer_id] : []);
    const q = String(req.query.order_id || '').trim();
    res.json(rows.filter((x) => x.received_qty < x.quantity && (!q || String(x.order_id) === q || (x.order_no || '').includes(q))));
  });
  r.get('/packages', needMenu('package.search', 'package.new', 'invoice.payment'), (req, res) => {
    const w = ['1=1']; const p: any[] = [];
    if (req.query.customer_id) { w.push('k.customer_id = ?'); p.push(req.query.customer_id); }
    if (req.query.code) { w.push('k.code LIKE ?'); p.push(`%${req.query.code}%`); }
    if (req.query.from) { w.push('k.date >= ?'); p.push(req.query.from); }
    if (req.query.to) { w.push('k.date <= ?'); p.push(req.query.to); }
    if (req.query.paid === '0' || req.query.paid === '1') { w.push('k.is_done_paid = ?'); p.push(Number(req.query.paid)); }
    if (req.query.search) {
      const s = String(req.query.search).trim();
      w.push(`(k.code LIKE ? OR EXISTS (SELECT 1 FROM package_items pi JOIN order_items oi ON oi.id = pi.order_item_id JOIN orders o ON o.id = oi.order_id
        WHERE pi.package_id = k.id AND (CAST(o.id AS TEXT) = ? OR o.order_no LIKE ? OR oi.product_id LIKE ? OR o.supplier_name LIKE ?)))`);
      p.push(`%${s}%`, s.replace(/^#/, ''), `%${s}%`, `%${s}%`, `%${s}%`);
    }
    if (req.query.order_id) { w.push('EXISTS (SELECT 1 FROM package_items pi JOIN order_items oi ON oi.id = pi.order_item_id JOIN orders o ON o.id = oi.order_id WHERE pi.package_id = k.id AND (oi.order_id = ? OR o.order_no LIKE ?))'); p.push(req.query.order_id, `%${req.query.order_id}%`); }
    const rows = all<any>(`SELECT k.*, c.code AS customer_code,
        (SELECT GROUP_CONCAT(DISTINCT COALESCE(o.order_no, '#' || o.id)) FROM package_items pi JOIN order_items oi ON oi.id = pi.order_item_id JOIN orders o ON o.id = oi.order_id WHERE pi.package_id = k.id) AS order_nos, sb.bank AS supplier_bank, sb.account_name AS supplier_account
      FROM packages k JOIN customers c ON c.id = k.customer_id LEFT JOIN supplier_banks sb ON sb.id = k.supplier_bank_id
      WHERE ${w.join(' AND ')} ORDER BY k.id DESC LIMIT 1000`, p);
    res.json(rows.map((k) => ({ ...k, ...packageTotals(k.id) })));
  });
  r.get('/packages/next-code', (_req, res) => res.json({ code: nextPackageCode() }));
  r.get('/packages/:id', (req, res) => {
    const k = get<any>(`SELECT k.*, c.code AS customer_code, c.firstname, c.lastname, c.nickname, c.phone AS customer_phone, sb.bank AS supplier_bank, sb.account_name AS supplier_account, sb.account_number AS supplier_number
      FROM packages k JOIN customers c ON c.id = k.customer_id LEFT JOIN supplier_banks sb ON sb.id = k.supplier_bank_id
      WHERE k.id = ? OR k.code = ?`, [req.params.id, req.params.id]);
    if (!k) throw new HttpError(404, 'ไม่พบบิล / Bill not found');
    k.items = all<any>(`SELECT pi.*, oi.order_id, o.order_no, o.order_date, o.supplier_name, oi.product_id, oi.quantity AS ordered_qty, s.th AS style_th, s.zh AS style_zh,
        COALESCE((SELECT SUM(amount) FROM package_item_statements st WHERE st.package_item_id = pi.id),0) AS deductions
      FROM package_items pi JOIN order_items oi ON oi.id = pi.order_item_id JOIN orders o ON o.id = oi.order_id LEFT JOIN styles s ON s.id = oi.style_id
      WHERE pi.package_id = ? ORDER BY pi.id`, [k.id]);
    k.statements = all(`SELECT st.*, oi.product_id, oi.order_id FROM package_item_statements st JOIN package_items pi ON pi.id = st.package_item_id
      JOIN order_items oi ON oi.id = pi.order_item_id WHERE pi.package_id = ? ORDER BY st.id`, [k.id]);
    k.payments = all('SELECT pp.*, b.name AS bank FROM package_payments pp LEFT JOIN banks b ON b.id = pp.bank_id WHERE package_id = ? ORDER BY pp.id', [k.id]);
    Object.assign(k, packageTotals(k.id));
    k.customer_balance_cny = customerBalance(k.customer_id, 'CNY');
    res.json(k);
  });
  function savePackageItems(packageId: number, customerId: number, items: any[]) {
    const keep = new Set<number>();
    for (const it of items) {
      const oi = orderItemProgress('oi.id = ?', [it.order_item_id])[0];
      if (!oi) throw new HttpError(400, 'Unknown order line');
      if (oi.customer_id !== Number(customerId)) throw new HttpError(400, `不同的客户 / Order ${oi.order_id} belongs to another customer`);
      const prev = it.id ? get<any>('SELECT quantity FROM package_items WHERE id = ?', [it.id])?.quantity || 0 : 0;
      if (oi.received_qty - prev + Number(it.quantity) > oi.quantity) throw new HttpError(409, `Order ${oi.order_id} / ${oi.product_id}: receiving more than ordered`);
      if (it.id) {
        run('UPDATE package_items SET quantity=?, unit_price=?, deposit=?, receive_date=? WHERE id = ? AND package_id = ?',
          [Number(it.quantity), Number(it.unit_price), Number(it.deposit || 0), it.receive_date || today(), it.id, packageId]);
        keep.add(Number(it.id));
      } else {
        keep.add(run('INSERT INTO package_items (package_id, order_item_id, quantity, unit_price, receive_date, deposit) VALUES (?,?,?,?,?,?)',
          [packageId, it.order_item_id, Number(it.quantity), Number(it.unit_price ?? oi.unit_price), it.receive_date || today(), Number(it.deposit || 0)]).id);
      }
    }
    for (const old of all<any>('SELECT id FROM package_items WHERE package_id = ?', [packageId])) {
      if (!keep.has(old.id)) run('DELETE FROM package_items WHERE id = ?', [old.id]);
    }
  }
  r.post('/packages', needMenu('package.new'), (req, res) => {
    const b = req.body;
    if (!b.customer_id) throw new HttpError(400, 'กรุณาเลือกลูกค้า / Choose a customer');
    if (!b.items?.length) throw new HttpError(400, 'ยังไม่ได้เลือกรายการ / No lines selected');
    const code = b.code || nextPackageCode();
    if (get('SELECT 1 FROM packages WHERE code = ?', [code])) throw new HttpError(409, 'Bill number already used');
    const id = tx(() => {
      const { id } = run('INSERT INTO packages (code, date, customer_id, supplier_bank_id, deposit, created_by) VALUES (?,?,?,?,?,?)',
        [code, b.date || today(), b.customer_id, b.supplier_bank_id || null, Number(b.deposit || 0), req.user.username]);
      savePackageItems(id, b.customer_id, b.items);
      return id;
    });
    audit(req.user.username, 'create', 'packages', id);
    res.json({ id, code });
  });
  r.put('/packages/:id', needMenu('package.new', 'package.search'), (req, res) => {
    const id = Number(req.params.id);
    const k = get<any>('SELECT * FROM packages WHERE id = ?', [id]);
    if (!k) throw new HttpError(404, 'Not found');
    const b = req.body;
    tx(() => {
      run('UPDATE packages SET date=?, supplier_bank_id=?, deposit=?, updated_by=? WHERE id = ?',
        [b.date || k.date, b.supplier_bank_id || null, Number(b.deposit || 0), req.user.username, id]);
      if (b.items) savePackageItems(id, k.customer_id, b.items);
    });
    audit(req.user.username, 'update', 'packages', id);
    res.json({ ok: true });
  });
  r.delete('/packages/:id', needMenu('package.search'), (req, res) => {
    const id = Number(req.params.id);
    if (get('SELECT 1 FROM package_payments WHERE package_id = ?', [id])) throw new HttpError(409, 'Bill has payments — delete them first');
    run('DELETE FROM packages WHERE id = ?', [id]);
    audit(req.user.username, 'delete', 'packages', id);
    res.json({ ok: true });
  });
  // deductions / adjustments on a bill line (InvoicePaymentRemarkFrom: "หักอื่นๆ", shop refunds etc.)
  r.post('/package-items/:id/statements', needMenu('invoice.payment', 'package.search'), (req, res) => {
    const b = req.body;
    if (!Number(b.amount)) throw new HttpError(400, 'กรุณาใส่ยอดเงิน / Enter an amount');
    const { id } = run('INSERT INTO package_item_statements (package_item_id, type, amount, description, created_by) VALUES (?,?,?,?,?)',
      [req.params.id, b.type || 'deduct', Number(b.amount), b.description || null, req.user.username]);
    res.json({ id });
  });
  r.delete('/package-statements/:id', needMenu('invoice.payment', 'package.search'), (req, res) => {
    run('DELETE FROM package_item_statements WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ================= Bill payments (InvoicePaymentForm / InvoicePaymentSearchFrom)
  // Paying the Chinese supplier from a company CNY account; the goods cost + service fee are deducted from the customer's CNY balance.
  r.post('/packages/:id/payments', needMenu('invoice.payment'), (req, res) => {
    const k = get<any>('SELECT * FROM packages WHERE id = ?', [req.params.id]);
    if (!k) throw new HttpError(404, 'Not found');
    const b = req.body;
    const amount = Number(b.amount || 0);
    if (!(amount > 0)) throw new HttpError(400, 'กรุณาใส่ยอดเงิน / Enter an amount');
    if (!b.bank_id) throw new HttpError(400, 'กรุณาเลือกธนาคาร / Choose a bank');
    const t = packageTotals(k.id);
    if (amount > t.remaining + 0.001) throw new HttpError(409, `Amount is more than what is left to pay (${t.remaining})`);
    const serviceFee = Number(b.service_fee || 0);
    const charge = amount + serviceFee;
    const bal = customerBalance(k.customer_id, 'CNY');
    const credit = get<any>('SELECT credit_limit FROM customers WHERE id = ?', [k.customer_id])?.credit_limit || 0;
    if (bal + credit < charge && !b.allow_negative) throw new HttpError(409, `ยอดเงินใน balance ไม่พอชำระ / Customer CNY balance ${bal} is not enough for ${charge}`);
    const id = tx(() => {
      const ref = `PAY-${k.code}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const finished = amount >= t.remaining - 0.001 || !!b.finished;
      const { id } = run(`INSERT INTO package_payments (package_id, amount, bank_fee, service_fee, date, bank_id, payment_ref, finished, created_by)
        VALUES (?,?,?,?,?,?,?,?,?)`, [k.id, amount, Number(b.bank_fee || 0), serviceFee, b.date || today(), b.bank_id, ref, finished ? 1 : 0, req.user.username]);
      addBalance({ customer_id: k.customer_id, currency: 'CNY', expense: charge, ref_code: k.code, description: `จ่ายบิล 付款 ${k.code}${serviceFee ? ` (+fee ${serviceFee})` : ''}`,
        date: b.date, source: 'package_payment', source_id: id, user: req.user.username });
      postCash('package_payment', id, [{ bank_id: b.bank_id, date: b.date || today(), expense: amount + Number(b.bank_fee || 0), detail: `付款 ${k.code} (${ref})` }], req.user.username);
      if (finished) run('UPDATE packages SET is_done_paid = 1 WHERE id = ?', [k.id]);
      return id;
    });
    audit(req.user.username, 'pay', 'packages', k.id, b);
    res.json({ id });
  });
  r.get('/invoice-payments', needMenu('invoice.paymentSearch', 'invoice.payment'), (req, res) => {
    const w = ['1=1']; const p: any[] = [];
    if (req.query.customer_id) { w.push('k.customer_id = ?'); p.push(req.query.customer_id); }
    if (req.query.from) { w.push('pp.date >= ?'); p.push(req.query.from); }
    if (req.query.to) { w.push('pp.date <= ?'); p.push(req.query.to); }
    if (req.query.checked === '0' || req.query.checked === '1') { w.push('pp.checked = ?'); p.push(Number(req.query.checked)); }
    res.json(all(`SELECT pp.*, k.code AS package_code, k.customer_id, c.code AS customer_code, b.name AS bank
      FROM package_payments pp JOIN packages k ON k.id = pp.package_id JOIN customers c ON c.id = k.customer_id LEFT JOIN banks b ON b.id = pp.bank_id
      WHERE ${w.join(' AND ')} ORDER BY pp.date DESC, pp.id DESC LIMIT 2000`, p));
  });
  r.post('/invoice-payments/check', needMenu('invoice.paymentSearch'), (req, res) => {
    if (!canVerify(req.user, 'invoice_payment')) throw new HttpError(403, 'คุณไม่มีสิทธิ์ตรวจสอบรายการ / 您无权验证');
    for (const id of req.body.ids || []) run('UPDATE package_payments SET checked = 1, checked_by = ? WHERE id = ?', [req.user.username, id]);
    res.json({ ok: true });
  });
  r.delete('/invoice-payments/:id', needMenu('invoice.paymentSearch'), (req, res) => {
    const pp = get<any>('SELECT * FROM package_payments WHERE id = ?', [req.params.id]);
    if (!pp) throw new HttpError(404, 'Not found');
    if (pp.checked) throw new HttpError(409, 'ไม่สามารถลบได้เนื่องจากรายการนี้ได้ตรวจสอบแล้ว / Already checked');
    tx(() => {
      removeBalanceBySource('package_payment', pp.id);
      unpostCash('package_payment', pp.id);
      run('DELETE FROM package_payments WHERE id = ?', [pp.id]);
      run('UPDATE packages SET is_done_paid = 0 WHERE id = ?', [pp.package_id]);
    });
    audit(req.user.username, 'delete', 'package_payments', pp.id, pp);
    res.json({ ok: true });
  });

  // ================= Lookup by order id / bill code / product id (SearchCallForm)
  r.get('/lookup', needMenu('package.lookup'), (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ items: [], packages: [], statements: [] });
    const items = orderItemProgress('(CAST(oi.order_id AS TEXT) = ? OR o.order_no = ? OR oi.product_id LIKE ?)', [q, q, `%${q}%`]);
    const packages = all<any>(`SELECT DISTINCT k.*, c.code AS customer_code FROM packages k JOIN customers c ON c.id = k.customer_id
      LEFT JOIN package_items pi ON pi.package_id = k.id LEFT JOIN order_items oi ON oi.id = pi.order_item_id LEFT JOIN orders o ON o.id = oi.order_id
      WHERE k.code LIKE ? OR CAST(oi.order_id AS TEXT) = ? OR o.order_no = ? OR oi.product_id LIKE ?`, [`%${q}%`, q, q, `%${q}%`]).map((k) => ({ ...k, ...packageTotals(k.id) }));
    const statements = all(`SELECT st.*, k.code AS package_code, oi.product_id FROM package_item_statements st
      JOIN package_items pi ON pi.id = st.package_item_id JOIN packages k ON k.id = pi.package_id JOIN order_items oi ON oi.id = pi.order_item_id
      JOIN orders o ON o.id = oi.order_id WHERE k.code LIKE ? OR CAST(oi.order_id AS TEXT) = ? OR o.order_no = ?`, [`%${q}%`, q, q]);
    res.json({ items, packages, statements });
  });

  return r;
}
