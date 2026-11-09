// Packing (boxes / sacks), shipment rounds, loading containers, shipping cost summaries.
import { Router } from 'express';
import { all, get, run, tx, audit } from '../db.js';
import { HttpError, needMenu } from '../auth.js';
import { SHIPMENT_STATUS_KEYS } from '../../shared/statuses.js';
import {
  addBalance, removeBalanceBySource, orderItemProgress, nextPackingCode, shipmentCustomerCharges, cubicMeters, round2, today,
  notifyStatus, type Currency,
} from '../logic.js';

const PACKING_SELECT = `SELECT p.*, c.code AS customer_code, c.firstname, s.code AS shipment_code,
  (SELECT COUNT(*) FROM packing_items i WHERE i.packing_id = p.id) AS item_count,
  (SELECT COUNT(*) FROM packing_styles st WHERE st.packing_id = p.id) AS style_count,
  (SELECT GROUP_CONCAT(DISTINCT COALESCE(o.order_no, '#' || o.id)) FROM packing_items i JOIN order_items oi ON oi.id = i.order_item_id
     JOIN orders o ON o.id = oi.order_id WHERE i.packing_id = p.id) AS order_nos
  FROM packings p JOIN customers c ON c.id = p.customer_id LEFT JOIN shipments s ON s.id = p.shipment_id`;

function packingDetail(id: number | string) {
  const p = get<any>(`${PACKING_SELECT} WHERE p.id = ? OR p.packing_code = ?`, [id, id]);
  if (!p) throw new HttpError(404, 'ไม่มีเลขกระสอบนี้ / 没有这个包号');
  p.cbm = cubicMeters(p);
  p.items = all(`SELECT pi.*, oi.order_id, o.order_no, oi.product_id, s.th AS style_th, s.zh AS style_zh, s.en AS style_en
    FROM packing_items pi JOIN order_items oi ON oi.id = pi.order_item_id JOIN orders o ON o.id = oi.order_id LEFT JOIN styles s ON s.id = oi.style_id WHERE pi.packing_id = ?`, [p.id]);
  p.styles = all(`SELECT ps.*, s.th AS style_th, s.zh AS style_zh, s.en AS style_en, u.description AS unit FROM packing_styles ps
    JOIN styles s ON s.id = ps.style_id LEFT JOIN style_units u ON u.id = s.unit_id WHERE ps.packing_id = ?`, [p.id]);
  return p;
}

function insertPacking(b: any, user: string) {
  if (!b.customer_id) throw new HttpError(400, 'กรุณาเลือกลูกค้าด้วย / 不要忘记输入顾客');
  const items: any[] = b.items || [];
  const styles: any[] = b.styles || [];
  // Contents, weight and size are all optional: staff may receive boxes first and fill details later.
  for (const it of items) {
    const oi = orderItemProgress('oi.id = ?', [it.order_item_id])[0];
    if (!oi) throw new HttpError(400, 'Unknown order line');
    if (oi.customer_id !== Number(b.customer_id)) throw new HttpError(400, '不同的客户不能包装 คนละรหัสลูกค้าไม่สามารถแพครวมกันได้');
    if (!(Number(it.quantity) > 0)) throw new HttpError(400, `${oi.order_no || '#' + oi.order_id} / ${oi.product_id || ''}: ใส่จำนวน / Enter a quantity`);
    // packing = goods physically received, so a line can be packed up to what was ordered even before its supplier bill exists
    const limit = Math.max(oi.received_qty, oi.quantity);
    if (oi.packed_qty + Number(it.quantity) > limit + 0.0001) {
      throw new HttpError(409, `${oi.order_no || 'Order ' + oi.order_id} / ${oi.product_id || ''}: แพคเกินจำนวนที่สั่ง / packing more than ordered (${limit - oi.packed_qty} left)`);
    }
  }
  const code = b.packing_code || nextPackingCode();
  if (get('SELECT 1 FROM packings WHERE packing_code = ?', [code])) throw new HttpError(409, `${code} already exists`);
  const { id } = run(`INSERT INTO packings (packing_code, shipment_id, ctn, no, customer_id, weight, cubic1, cubic2, cubic3, remark, tracking_no, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [code, b.shipment_id || null, b.ctn || null, b.no || null, b.customer_id, Number(b.weight || 0),
    Number(b.cubic1 || 0), Number(b.cubic2 || 0), Number(b.cubic3 || 0), b.remark || null, b.tracking_no || null, user]);
  for (const it of items) run('INSERT INTO packing_items (packing_id, order_item_id, quantity, tracking_no, created_by) VALUES (?,?,?,?,?)',
    [id, it.order_item_id, Number(it.quantity), it.tracking_no || null, user]);
  for (const s of styles) {
    if (!s.style_id || !(Number(s.quantity) > 0)) throw new HttpError(400, '未选择产品分类 ยังไม่ได้เลือกประเภทสินค้า');
    run('INSERT INTO packing_styles (packing_id, style_id, quantity) VALUES (?,?,?)', [id, s.style_id, Number(s.quantity)]);
  }
  return { id, code };
}

export function logisticsRouter() {
  const r = Router();

  // ================= Packing
  r.get('/packing/waiting', needMenu('packing.new'), (req, res) => {
    if (!req.query.customer_id && !req.query.order_id) return res.json([]);
    const w: string[] = []; const p: any[] = [];
    if (req.query.customer_id) { w.push('o.customer_id = ?'); p.push(req.query.customer_id); }
    if (req.query.order_id) { w.push('(CAST(oi.order_id AS TEXT) = ? OR o.order_no LIKE ?)'); p.push(String(req.query.order_id).trim(), `%${String(req.query.order_id).trim()}%`); }
    const rows = orderItemProgress(w.join(' AND '), p);
    res.json(rows.filter((x) => x.packed_qty < Math.max(x.received_qty, x.quantity)));
  });
  r.get('/packing/recent', needMenu('packing.new', 'packing.nobill'), (req, res) => {
    res.json(all(`${PACKING_SELECT} ${req.query.customer_id ? 'WHERE p.customer_id = ?' : ''} ORDER BY p.id DESC LIMIT 20`,
      req.query.customer_id ? [req.query.customer_id] : []));
  });
  function packingFilter(q: any) {
    const w = ['1=1']; const p: any[] = [];
    if (q.customer_id) { w.push('p.customer_id = ?'); p.push(q.customer_id); }
    if (q.shipment_id) { w.push('p.shipment_id = ?'); p.push(q.shipment_id); }
    if (q.sent === '1') w.push('p.off_china_date IS NOT NULL');
    if (q.sent === '0') w.push('p.off_china_date IS NULL');
    if (q.code) { w.push('p.packing_code LIKE ?'); p.push(`%${q.code}%`); }
    if (q.tracking) { w.push('(p.tracking_no LIKE ? OR EXISTS (SELECT 1 FROM packing_items i WHERE i.packing_id = p.id AND i.tracking_no LIKE ?))'); p.push(`%${q.tracking}%`, `%${q.tracking}%`); }
    if (q.order_id) { w.push('EXISTS (SELECT 1 FROM packing_items i JOIN order_items oi ON oi.id = i.order_item_id JOIN orders o ON o.id = oi.order_id WHERE i.packing_id = p.id AND (CAST(oi.order_id AS TEXT) = ? OR o.order_no LIKE ?))'); p.push(q.order_id, `%${q.order_id}%`); }
    if (q.unmeasured === '1') w.push('(COALESCE(p.weight,0) = 0 OR COALESCE(p.cubic1,0) * COALESCE(p.cubic2,0) * COALESCE(p.cubic3,0) = 0)');
    if (q.style_id) { w.push('EXISTS (SELECT 1 FROM packing_styles st WHERE st.packing_id = p.id AND st.style_id = ?)'); p.push(q.style_id); }
    return { where: w.join(' AND '), params: p };
  }
  r.get('/packing', needMenu('packing.search', 'packing.offchina', 'packing.weigh'), (req, res) => {
    const f = packingFilter(req.query);
    const rows = all<any>(`${PACKING_SELECT} WHERE ${f.where} ORDER BY p.id DESC LIMIT 2000`, f.params);
    res.json(rows.map((x) => ({ ...x, cbm: round2(cubicMeters(x) * 1000) / 1000 })));
  });
  // one line per customer for the packing-list overview (click through to the boxes)
  r.get('/packing/by-customer', needMenu('packing.search'), (req, res) => {
    const f = packingFilter(req.query);
    // filter the boxes once, then aggregate per customer (the old per-customer IN (...) re-ran the filter for every customer)
    const rows = all<any>(`WITH f AS MATERIALIZED (SELECT p.* FROM packings p WHERE ${f.where}),
      nos AS (SELECT f.customer_id, GROUP_CONCAT(DISTINCT COALESCE(o.order_no, '#' || o.id)) AS order_nos FROM f
        JOIN packing_items i ON i.packing_id = f.id JOIN order_items oi ON oi.id = i.order_item_id JOIN orders o ON o.id = oi.order_id GROUP BY f.customer_id)
      SELECT p.customer_id, c.code AS customer_code, COUNT(*) AS boxes,
        SUM(CASE WHEN p.off_china_date IS NULL THEN 1 ELSE 0 END) AS not_sent,
        SUM(CASE WHEN COALESCE(p.weight,0) = 0 THEN 1 ELSE 0 END) AS unweighed,
        ROUND(SUM(p.weight), 2) AS weight, SUM(p.cubic1 * p.cubic2 * p.cubic3) / 1000000.0 AS cbm, MAX(p.created_at) AS last_packed,
        nos.order_nos
      FROM f p JOIN customers c ON c.id = p.customer_id LEFT JOIN nos ON nos.customer_id = p.customer_id
      GROUP BY p.customer_id ORDER BY MAX(p.id) DESC LIMIT 2000`, f.params);
    res.json(rows.map((x) => ({ ...x, cbm: round2((x.cbm || 0) * 1000) / 1000 })));
  });
  r.get('/packing/:id', (req, res) => res.json(packingDetail(req.params.id)));
  r.post('/packing', needMenu('packing.new', 'packing.nobill'), (req, res) => {
    const b = req.body;
    const boxes = Math.max(1, Math.min(Number(b.boxes || 1), 200));
    const created = tx(() => {
      const out: { id: number; code: string }[] = [];
      for (let i = 0; i < boxes; i++) {
        out.push(insertPacking({ ...b, packing_code: boxes > 1 ? undefined : b.packing_code, items: i === 0 ? b.items : [], styles: b.styles,
          remark: boxes > 1 ? `${b.remark || ''} (${i + 1}/${boxes})`.trim() : b.remark }, req.user.username));
      }
      return out;
    });
    audit(req.user.username, 'create', 'packings', created[0].id, { boxes });
    res.json({ created, packings: created.map((c) => packingDetail(c.id)) });
  });
  // "ชั่งน้ำหนักทีหลัง": save weight / size for many boxes at once
  r.post('/packing/measure', needMenu('packing.weigh', 'packing.search'), (req, res) => {
    const rows: any[] = req.body.rows || [];
    const n = (v: any) => (v === '' || v == null ? 0 : Number(v));
    const saved = tx(() => rows.map((x) => {
      const p = get<any>('SELECT * FROM packings WHERE id = ?', [x.id]);
      if (!p) throw new HttpError(404, `Box ${x.id} not found`);
      const changed = ['weight', 'cubic1', 'cubic2', 'cubic3'].some((k) => k in x && n(x[k]) !== (p[k] || 0));
      if (!changed) return null;
      if (get('SELECT 1 FROM shipment_summaries WHERE shipment_id = ? AND customer_id = ?', [p.shipment_id, p.customer_id])) {
        throw new HttpError(409, `${p.packing_code}: สรุปยอดแล้ว — undo the shipping summary first`);
      }
      for (const k of ['weight', 'cubic1', 'cubic2', 'cubic3']) if (k in x && !(n(x[k]) >= 0)) throw new HttpError(400, `${p.packing_code}: ${k} ไม่ถูกต้อง`);
      run('UPDATE packings SET weight=?, cubic1=?, cubic2=?, cubic3=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?',
        [n(x.weight ?? p.weight), n(x.cubic1 ?? p.cubic1), n(x.cubic2 ?? p.cubic2), n(x.cubic3 ?? p.cubic3), req.user.username, p.id]);
      return p.id;
    }).filter(Boolean));
    audit(req.user.username, 'measure', 'packings', undefined, { ids: saved });
    res.json({ ok: true, saved: saved.length });
  });
  r.put('/packing/:id', needMenu('packing.search', 'packing.new', 'shipment.summary', 'packing.weigh'), (req, res) => {
    const p = get<any>('SELECT * FROM packings WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Not found');
    const b = { ...p, ...req.body };
    if (get('SELECT 1 FROM shipment_summaries WHERE shipment_id = ? AND customer_id = ?', [p.shipment_id, p.customer_id]) &&
      ['weight', 'cubic1', 'cubic2', 'cubic3', 'rate', 'rate_type', 'shipment_id'].some((k) => k in req.body && req.body[k] != p[k])) {
      throw new HttpError(409, 'สรุปยอดแล้ว — undo the shipping summary for this customer first');
    }
    run(`UPDATE packings SET shipment_id=?, ctn=?, no=?, weight=?, cubic1=?, cubic2=?, cubic3=?, remark=?, tracking_no=?, rate_type=?, rate=?,
      off_china_date=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`,
      [b.shipment_id || null, b.ctn || null, b.no || null, Number(b.weight || 0), Number(b.cubic1 || 0), Number(b.cubic2 || 0), Number(b.cubic3 || 0),
        b.remark || null, b.tracking_no || null, b.rate_type || null, b.rate === '' || b.rate == null ? null : Number(b.rate),
        b.shipment_id ? b.off_china_date || null : null, req.user.username, p.id]);
    audit(req.user.username, 'update', 'packings', p.id, req.body);
    res.json(packingDetail(p.id));
  });
  r.delete('/packing/:id', needMenu('packing.search'), (req, res) => {
    const p = get<any>('SELECT * FROM packings WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Not found');
    if (p.off_china_date) throw new HttpError(409, 'Box is already loaded on a container — unload it first');
    run('DELETE FROM packings WHERE id = ?', [p.id]);
    audit(req.user.username, 'delete', 'packings', p.id, p);
    res.json({ ok: true });
  });
  r.post('/packing/:id/styles', needMenu('packing.search', 'packing.new'), (req, res) => {
    if (!req.body.style_id || !(Number(req.body.quantity) > 0)) throw new HttpError(400, 'Choose a category and quantity');
    run('INSERT INTO packing_styles (packing_id, style_id, quantity) VALUES (?,?,?)', [req.params.id, req.body.style_id, Number(req.body.quantity)]);
    res.json(packingDetail(req.params.id));
  });
  r.put('/packing-styles/:id', needMenu('packing.search'), (req, res) => {
    run('UPDATE packing_styles SET style_id = ?, quantity = ? WHERE id = ?', [req.body.style_id, Number(req.body.quantity), req.params.id]);
    res.json({ ok: true });
  });
  r.delete('/packing-styles/:id', needMenu('packing.search'), (req, res) => {
    run('DELETE FROM packing_styles WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });
  r.put('/packing-items/:id', needMenu('packing.search'), (req, res) => {
    const it = get<any>('SELECT * FROM packing_items WHERE id = ?', [req.params.id]);
    if (!it) throw new HttpError(404, 'Not found');
    const oi = orderItemProgress('oi.id = ?', [it.order_item_id])[0];
    const q = Number(req.body.quantity);
    if (!(q > 0) || oi.packed_qty - it.quantity + q > Math.max(oi.received_qty, oi.quantity)) throw new HttpError(409, 'Quantity is more than ordered');
    run('UPDATE packing_items SET quantity = ?, tracking_no = ? WHERE id = ?', [q, req.body.tracking_no ?? it.tracking_no, it.id]);
    res.json({ ok: true });
  });
  r.delete('/packing-items/:id', needMenu('packing.search'), (req, res) => {
    run('DELETE FROM packing_items WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // Pack from file (BuckPackingcs + OffChina file format):
  //   pipe format  : rowid|ctn|no|PKcode|customerId|CUSTOMERCODE|weight|w|l|h|CHtracking
  //   csv / tab    : CUSTOMERCODE,weight,w,l,h,tracking,remark
  r.post('/packing/import', needMenu('packing.bulk'), (req, res) => {
    const text = String(req.body.text || '');
    const commit = !!req.body.commit;
    const rows: any[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      let r: any;
      if (line.includes('|')) {
        const f = line.split('|').map((s) => s.trim());
        r = { ctn: Number(f[1]) || null, no: Number(f[2]) || null, packing_code: f[3] || undefined, customer_code: f[5], weight: Number(f[6]) || 0,
          cubic1: Number(f[7]) || 0, cubic2: Number(f[8]) || 0, cubic3: Number(f[9]) || 0, tracking_no: f[10] || null };
      } else {
        const f = line.split(/[,\t]/).map((s) => s.trim());
        if (/^code$/i.test(f[0])) continue;
        r = { customer_code: f[0], weight: Number(f[1]) || 0, cubic1: Number(f[2]) || 0, cubic2: Number(f[3]) || 0, cubic3: Number(f[4]) || 0,
          tracking_no: f[5] || null, remark: f[6] || null };
      }
      const c = get<any>('SELECT id FROM customers WHERE code = ? AND is_deleted = 0', [r.customer_code]);
      const existing = r.packing_code ? get<any>('SELECT id FROM packings WHERE packing_code = ?', [r.packing_code]) : null;
      r.customer_id = c?.id;
      r.status = !c ? 'unknown customer' : existing ? 'update' : 'new';
      r.existing_id = existing?.id;
      rows.push(r);
    }
    if (!commit) return res.json({ rows });
    const styleId = req.body.style_id ? Number(req.body.style_id) : null;
    const result = tx(() => rows.filter((r) => r.customer_id).map((r) => {
      if (r.existing_id) {
        run('UPDATE packings SET weight=?, cubic1=?, cubic2=?, cubic3=?, ctn=COALESCE(?,ctn), no=COALESCE(?,no), tracking_no=COALESCE(?,tracking_no), shipment_id=COALESCE(?,shipment_id) WHERE id = ?',
          [r.weight, r.cubic1, r.cubic2, r.cubic3, r.ctn, r.no, r.tracking_no, req.body.shipment_id || null, r.existing_id]);
        return { id: r.existing_id, code: r.packing_code };
      }
      const styles = styleId ? [{ style_id: styleId, quantity: 1 }] : [];
      if (!styles.length) {
        // a box with no items still needs a category so it is never "empty"; fall back to first active style
        const s = get<any>('SELECT id FROM styles WHERE is_deleted = 0 ORDER BY id LIMIT 1');
        if (!s) throw new HttpError(400, 'Create at least one product category first');
        styles.push({ style_id: s.id, quantity: 1 });
      }
      return insertPacking({ ...r, shipment_id: req.body.shipment_id || null, styles }, req.user.username);
    }));
    audit(req.user.username, 'import', 'packings', undefined, { count: result.length });
    res.json({ rows, created: result });
  });

  // ================= Shipments: load boxes on a container (OffChinaFrom)
  r.get('/shipments/:id/packings', needMenu('packing.offchina', 'shipment.list', 'shipment.summary'), (req, res) => {
    res.json(all(`${PACKING_SELECT} WHERE p.shipment_id = ? ORDER BY p.ctn, p.no, p.id`, [req.params.id]));
  });
  r.post('/shipments/:id/load', needMenu('packing.offchina'), (req, res) => {
    const sid = Number(req.params.id);
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', [sid]);
    if (!s) throw new HttpError(404, 'Shipment not found');
    const code = String(req.body.code || '').trim();
    const p = get<any>('SELECT * FROM packings WHERE packing_code = ? OR CAST(id AS TEXT) = ?', [code, code]);
    if (!p) throw new HttpError(404, `找不到这个包号 / ${code} not found`);
    if (p.shipment_id && p.shipment_id !== sid && p.off_china_date) throw new HttpError(409, `${p.packing_code} is already loaded on another shipment`);
    const ctn = req.body.ctn ?? (get<any>('SELECT COALESCE(MAX(ctn),0) AS m FROM packings WHERE shipment_id = ?', [sid]).m + 1);
    const no = req.body.no ?? (get<any>('SELECT COUNT(*) AS n FROM packings WHERE shipment_id = ? AND customer_id = ?', [sid, p.customer_id]).n + (p.shipment_id === sid ? 0 : 1));
    run('UPDATE packings SET shipment_id = ?, off_china_date = ?, ctn = COALESCE(ctn, ?), no = COALESCE(no, ?), updated_by = ? WHERE id = ?',
      [sid, req.body.date || today(), ctn, no, req.user.username, p.id]);
    void notifyStatus('off_china', { packing_code: p.packing_code, shipment: s.code });
    res.json(packingDetail(p.id));
  });
  r.post('/shipments/:id/unload', needMenu('packing.offchina'), (req, res) => {
    const p = get<any>('SELECT * FROM packings WHERE id = ? AND shipment_id = ?', [req.body.packing_id, req.params.id]);
    if (!p) throw new HttpError(404, 'Not found');
    if (get('SELECT 1 FROM shipment_summaries WHERE shipment_id = ? AND customer_id = ?', [p.shipment_id, p.customer_id])) {
      throw new HttpError(409, 'สรุปยอดแล้ว — undo the shipping summary first');
    }
    run('UPDATE packings SET off_china_date = NULL, shipment_id = NULL WHERE id = ?', [p.id]);
    res.json({ ok: true });
  });
  // status steps of a round (ขึ้นตู้แล้ว → ระหว่างทาง → … → นำจัดส่งแล้ว), with history
  r.post('/shipments/:id/status', needMenu('shipment.list'), (req, res) => {
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', [req.params.id]);
    if (!s) throw new HttpError(404, 'Shipment not found');
    const status = String(req.body.status || '');
    if (!SHIPMENT_STATUS_KEYS.includes(status)) throw new HttpError(400, 'Unknown status');
    const date = req.body.date || today();
    tx(() => {
      run('UPDATE shipments SET status = ?, status_date = ? WHERE id = ?', [status, date, s.id]);
      run('INSERT INTO shipment_status_log (shipment_id, status, date, note, created_by) VALUES (?,?,?,?,?)', [s.id, status, date, req.body.note || null, req.user.username]);
      if ((status === 'arrived_th' || status === 'delivered') && !s.arrived_date) run('UPDATE shipments SET arrived_date = ? WHERE id = ?', [date, s.id]);
    });
    void notifyStatus('shipment_status', { shipment_id: s.id, shipment: s.code, status, date });
    res.json({ ok: true });
  });
  r.get('/shipments/:id/status', needMenu('shipment.list'), (req, res) => {
    res.json(all('SELECT * FROM shipment_status_log WHERE shipment_id = ? ORDER BY date DESC, id DESC', [req.params.id]));
  });
  r.post('/shipments/:id/arrived', needMenu('shipment.list'), (req, res) => {
    run('UPDATE shipments SET arrived_date = ? WHERE id = ?', [req.body.date || today(), req.params.id]);
    void notifyStatus('arrived', { shipment_id: Number(req.params.id) });
    res.json({ ok: true });
  });
  // Packing-list report by product category (ViewPackingListReport)
  r.get('/shipments/:id/report', needMenu('shipment.list', 'packing.search'), (req, res) => {
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', [req.params.id]);
    if (!s) throw new HttpError(404, 'Not found');
    const boxes = all<any>(`${PACKING_SELECT} WHERE p.shipment_id = ? ORDER BY p.ctn, p.no, p.id`, [s.id]).map((p) => ({
      ...p, cbm: cubicMeters(p),
      contents: all<any>(`SELECT s.zh, s.th, s.en, SUM(q) AS qty FROM (
          SELECT oi.style_id AS sid, pi.quantity AS q FROM packing_items pi JOIN order_items oi ON oi.id = pi.order_item_id WHERE pi.packing_id = ?
          UNION ALL SELECT style_id, quantity FROM packing_styles WHERE packing_id = ?) x LEFT JOIN styles s ON s.id = x.sid GROUP BY x.sid`, [p.id, p.id]),
    }));
    res.json({ shipment: s, boxes });
  });

  // ================= Shipping cost summary per customer (ShipmentSummaryForm)
  r.get('/shipments/:id/summary', needMenu('shipment.summary'), (req, res) => {
    const sid = Number(req.params.id);
    const currency = (req.query.currency === 'CNY' ? 'CNY' : 'THB') as Currency;
    const customers = all<any>(`SELECT c.id, c.code, c.firstname, c.nickname, COUNT(p.id) AS boxes, ROUND(SUM(p.weight),2) AS weight
      FROM packings p JOIN customers c ON c.id = p.customer_id WHERE p.shipment_id = ? GROUP BY c.id ORDER BY c.code`, [sid]);
    res.json(customers.map((c) => {
      const summary = get<any>('SELECT * FROM shipment_summaries WHERE shipment_id = ? AND customer_id = ?', [sid, c.id]);
      const ch = shipmentCustomerCharges(sid, c.id, (summary?.currency || currency) as Currency);
      return { ...c, ...ch, summary };
    }));
  });
  r.get('/shipments/:id/summary/:customerId', needMenu('shipment.summary', 'shipment.search'), (req, res) => {
    const sid = Number(req.params.id); const cid = Number(req.params.customerId);
    const summary = get<any>('SELECT * FROM shipment_summaries WHERE shipment_id = ? AND customer_id = ?', [sid, cid]);
    const currency = (summary?.currency || (req.query.currency === 'CNY' ? 'CNY' : 'THB')) as Currency;
    res.json({
      shipment: get('SELECT * FROM shipments WHERE id = ?', [sid]),
      customer: get('SELECT * FROM customers WHERE id = ?', [cid]),
      addresses: all('SELECT a.*, p.name AS province FROM customer_addresses a LEFT JOIN provinces p ON p.id = a.province_id WHERE customer_id = ? ORDER BY is_default DESC', [cid]),
      currency, summary, ...shipmentCustomerCharges(sid, cid, currency),
    });
  });
  // "สรุปยอด" — post the shipping charge to the customer's balance.
  r.post('/shipments/:id/summary/:customerId', needMenu('shipment.summary'), (req, res) => {
    const sid = Number(req.params.id); const cid = Number(req.params.customerId);
    if (get('SELECT 1 FROM shipment_summaries WHERE shipment_id = ? AND customer_id = ?', [sid, cid])) throw new HttpError(409, 'สรุปยอดแล้ว / Already summarized');
    const currency = (req.body.currency === 'CNY' ? 'CNY' : 'THB') as Currency;
    const ch = shipmentCustomerCharges(sid, cid, currency);
    const s = get<any>('SELECT * FROM shipments WHERE id = ?', [sid]);
    tx(() => {
      const balanceId = addBalance({ customer_id: cid, currency, expense: ch.total, ref_code: s.code, description: `ค่าขนส่ง 运费 ${s.code} (${ch.packings.length} boxes)`,
        source: 'shipment', source_id: sid * 100000 + cid, user: req.user.username });
      run('INSERT INTO shipment_summaries (shipment_id, customer_id, currency, total, balance_id, created_by) VALUES (?,?,?,?,?,?)',
        [sid, cid, currency, ch.total, balanceId, req.user.username]);
      // freeze the price basis on each box so later rate changes don't alter a posted bill
      for (const p of ch.packings) if (!p.rate_type) run('UPDATE packings SET rate_type = ?, rate = ? WHERE id = ?', [p.basis, p.rate, p.id]);
    });
    audit(req.user.username, 'summarize', 'shipments', sid, { customer: cid, total: ch.total });
    res.json({ ok: true, total: ch.total });
  });
  r.delete('/shipments/:id/summary/:customerId', needMenu('shipment.summary'), (req, res) => {
    const sid = Number(req.params.id); const cid = Number(req.params.customerId);
    const s = get<any>('SELECT * FROM shipment_summaries WHERE shipment_id = ? AND customer_id = ?', [sid, cid]);
    if (!s) throw new HttpError(404, 'Not summarized');
    if (s.paid) throw new HttpError(409, 'Already paid — cannot undo');
    tx(() => {
      removeBalanceBySource('shipment', sid * 100000 + cid);
      run('DELETE FROM shipment_summaries WHERE shipment_id = ? AND customer_id = ?', [sid, cid]);
    });
    res.json({ ok: true });
  });
  r.post('/shipments/:id/summary/:customerId/paid', needMenu('shipment.summary'), (req, res) => {
    run('UPDATE shipment_summaries SET paid = ? WHERE shipment_id = ? AND customer_id = ?', [req.body.paid ? 1 : 0, req.params.id, req.params.customerId]);
    res.json({ ok: true });
  });

  // ================= Search shipping charges across shipments (SearchShipmentForm)
  r.get('/shipping-charges', needMenu('shipment.search', 'unpaid'), (req, res) => {
    const w = ['1=1']; const p: any[] = [];
    if (req.query.customer_id) { w.push('ss.customer_id = ?'); p.push(req.query.customer_id); }
    if (req.query.from) { w.push('s.date >= ?'); p.push(req.query.from); }
    if (req.query.to) { w.push('s.date <= ?'); p.push(req.query.to); }
    if (req.query.paid === '0' || req.query.paid === '1') { w.push('ss.paid = ?'); p.push(Number(req.query.paid)); }
    const summarized = all<any>(`SELECT ss.*, s.code AS shipment_code, s.date AS shipment_date, c.code AS customer_code,
        (SELECT COUNT(*) FROM packings x WHERE x.shipment_id = ss.shipment_id AND x.customer_id = ss.customer_id) AS boxes
      FROM shipment_summaries ss JOIN shipments s ON s.id = ss.shipment_id JOIN customers c ON c.id = ss.customer_id
      WHERE ${w.join(' AND ')} ORDER BY s.date DESC, c.code`, p);
    let pending: any[] = [];
    if (req.query.summarized !== '1') {
      const w2 = ['p.shipment_id IS NOT NULL', 'NOT EXISTS (SELECT 1 FROM shipment_summaries ss WHERE ss.shipment_id = p.shipment_id AND ss.customer_id = p.customer_id)'];
      const p2: any[] = [];
      if (req.query.customer_id) { w2.push('p.customer_id = ?'); p2.push(req.query.customer_id); }
      if (req.query.from) { w2.push('s.date >= ?'); p2.push(req.query.from); }
      if (req.query.to) { w2.push('s.date <= ?'); p2.push(req.query.to); }
      pending = all<any>(`SELECT p.shipment_id, p.customer_id, s.code AS shipment_code, s.date AS shipment_date, c.code AS customer_code, COUNT(*) AS boxes
        FROM packings p JOIN shipments s ON s.id = p.shipment_id JOIN customers c ON c.id = p.customer_id WHERE ${w2.join(' AND ')}
        GROUP BY p.shipment_id, p.customer_id ORDER BY s.date DESC`, p2)
        .map((x) => ({ ...x, total: shipmentCustomerCharges(x.shipment_id, x.customer_id, 'THB').total, currency: 'THB', pending: true }));
    }
    res.json(req.query.summarized === '0' ? pending : [...pending, ...summarized]);
  });

  return r;
}
