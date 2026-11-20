import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api, useApi, useApp, useCan, useLang, useT, pick, cbm, money } from '../lib';
import { Page, Card, Grid, Field, Table, CustomerPick, ShipmentPick, StylePick, Badge, Modal, PrintModal, Barcode, Tabs, useAction, useAsk, useToast, Bi } from '../ui';
import { Printer, ReceiptText, Plus, X, PackagePlus, PackageOpen, FileSpreadsheet, ArrowLeft } from 'lucide-react';

// One reference per box for lists: order no. first, then tracking, then the reference id (yyyymmnnnn).
const boxRef = (r: { order_nos?: string | null; tracking_no?: string | null; reference_id?: string | null }) => r.order_nos || r.tracking_no || r.reference_id || '';
// How the box travels to Thailand (packings.transport)
function TransportPick({ value, onChange, all }: { value: string | null | undefined; onChange: (v: string) => void; all?: boolean }) {
  const t = useT();
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all ? t('All', 'ทั้งหมด', '全部') : '—'}</option>
      <option value="truck">{t('Truck', 'รถ', '陆运')}</option>
      <option value="ship">{t('Ship', 'เรือ', '海运')}</option>
      {all && <option value="none">{t('Not set', 'ยังไม่ระบุ', '未选')}</option>}
    </select>
  );
}
// Extra customers on a box, for tracking only (shipping stays with the main customer)
function OtherCustomersPick({ value, main, onChange }: { value: number[] | undefined; main: any; onChange: (ids: number[]) => void }) {
  const t = useT();
  const { lookups } = useApp();
  const ids = (value || []).filter((x) => x !== main);
  const code = (id: number) => lookups.customers.find((c) => c.id === id)?.code || `#${id}`;
  return (
    <div>
      <CustomerPick value={null} onChange={(v) => { if (v && v !== main && !ids.includes(v)) onChange([...ids, v]); }} placeholder={t('Add customer', '+ เพิ่มลูกค้ารอง', '+ 添加客户')} />
      {ids.length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {ids.map((id) => <Badge key={id}>{code(id)} <button className="link" onClick={() => onChange(ids.filter((x) => x !== id))} aria-label={`remove ${code(id)}`}><X size={12} aria-hidden /></button></Badge>)}
      </div>}
    </div>
  );
}
const useTransportText = () => { const t = useT(); return (v?: string | null) => v === 'truck' ? t('Truck', 'รถ', '陆运') : v === 'ship' ? t('Ship', 'เรือ', '海运') : ''; };
const orderLabel = (r: { order_no?: string | null; order_id?: number }) => r.order_no || `#${r.order_id}`;
const cbmText = (p: any) => cbm({ cubic1: Number(p.cubic1), cubic2: Number(p.cubic2), cubic3: Number(p.cubic3) }).toFixed(4);

export function LabelDoc({ packings }: { packings: any[] }) {
  const { lookups } = useApp();
  const { lang } = useLang();
  const text = lookups.settings.print_text;
  return (
    <div>
      {packings.map((p) => (
        <div className="label-card" key={p.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}><b>{text}</b><span>{p.shipment_code || ''}</span></div>
          <div className="code">{p.customer_code}</div>
          <Barcode value={p.packing_code} />
          <div className="meta">
            <span>{p.weight ? `${p.weight} kg` : '— kg'}</span>
            <span>{p.cubic1}×{p.cubic2}×{p.cubic3} cm</span>
            <span><b>{cbmText(p)} cbm</b></span>
            <span>{p.ctn ? `CTN ${p.ctn}/${p.no ?? ''}` : ''}</span>
            {p.transport && <span><b>{p.transport === 'truck' ? 'รถ 陆运' : 'เรือ 海运'}</b></span>}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {[...(p.items || []).map((i: any) => `${orderLabel(i)} ${i.product_id || ''} ×${i.quantity}`),
              ...(p.styles || []).map((s: any) => `${pick({ th: s.style_th, zh: s.style_zh, en: s.style_en }, lang)} ×${s.quantity}`)].join(' · ')}
          </div>
          {p.reference_id && <div style={{ fontSize: 12 }}>Ref: {p.reference_id}</div>}
          {p.tracking_no && <div style={{ fontSize: 12 }}>Track: {p.tracking_no}</div>}
          {p.remark && <div style={{ fontSize: 12 }}>{p.remark}</div>}
        </div>
      ))}
    </div>
  );
}

/** ใบรับของ — handed to the person who dropped the goods off. */
export function ReceiptDoc({ packings }: { packings: any[] }) {
  const t = useT();
  const { lang } = useLang();
  const { lookups } = useApp();
  const first = packings[0] || {};
  const now = new Date();
  return (
    <div className="doc receipt">
      <div className="doc-head">
        <div><h2>{lookups.settings.print_text} · {t('Goods receipt', 'ใบรับสินค้า', '收货单')}</h2>
          <div>{t('Date', 'วันที่', '日期')}: {now.toLocaleDateString('en-CA')} {now.toTimeString().slice(0, 5)}</div></div>
        <div style={{ textAlign: 'right' }}>{t('Customer', 'รหัสลูกค้า', '客户')}<div className="code" style={{ fontSize: 28, fontWeight: 700 }}>{first.customer_code}</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>{t('Box', 'เลขกล่อง', '包号')}</th><th>{t('Contents', 'สินค้า', '产品')}</th><th>kg</th><th>{t('Remark', 'หมายเหตุ', '备注')}</th></tr></thead>
        <tbody>{packings.map((p, i) => (
          <tr key={p.id}><td>{i + 1}</td><td>{p.packing_code}</td>
            <td>{[...(p.items || []).map((x: any) => `${orderLabel(x)} ×${x.quantity}`), ...(p.styles || []).map((s: any) => `${pick({ th: s.style_th, zh: s.style_zh, en: s.style_en }, lang)} ×${s.quantity}`)].join(', ')}</td>
            <td>{p.weight || ''}</td><td>{p.remark || ''}{p.tracking_no ? ` · ${p.tracking_no}` : ''}</td></tr>
        ))}</tbody>
      </table>
      <div className="total-line"><span>{t('Total boxes', 'รวมจำนวน', '总包数')}: <b>{packings.length}</b> {t('boxes', 'กล่อง', '包')}</span></div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 40 }}>
        <span>{t('Sender', 'ผู้ส่ง', '送货人')} ____________________</span><span>{t('Received by', 'ผู้รับ', '收货人')} ____________________</span>
      </div>
    </div>
  );
}

/** Print labels and/or a goods receipt for a set of boxes. */
export function PackPrint({ packings, onClose, start = 'labels' }: { packings: any[] | null; onClose: () => void; start?: 'labels' | 'receipt' }) {
  const t = useT();
  const [tab, setTab] = useState<string>(start);
  useEffect(() => setTab(start), [packings, start]);
  return (
    <PrintModal open={!!packings} onClose={onClose} title={t('Print', 'ปริ้น', '打印')}>
      <div className="no-print"><Tabs value={tab} onChange={setTab} tabs={[
        { key: 'labels', label: `${t('Box labels', 'ป้ายติดกล่อง', '标签')} (${packings?.length || 0})` },
        { key: 'receipt', label: t('Goods receipt', 'ใบรับของ', '收货单') },
      ]} /></div>
      {packings && (tab === 'labels' ? <LabelDoc packings={packings} /> : <ReceiptDoc packings={packings} />)}
    </PrintModal>
  );
}

function Measure({ v, set }: { v: any; set: (x: any) => void }) {
  const t = useT();
  return (
    <>
      <Field label={t('Weight kg (optional)', 'น้ำหนัก (กก.) ไม่บังคับ', '重量')}><input type="number" step="any" value={v.weight ?? ''} onChange={(e) => set({ ...v, weight: e.target.value })} /></Field>
      <Field label={t('Width cm', 'กว้าง', '宽')}><input type="number" step="any" value={v.cubic1 ?? ''} onChange={(e) => set({ ...v, cubic1: e.target.value })} /></Field>
      <Field label={t('Length cm', 'ยาว', '长')}><input type="number" step="any" value={v.cubic2 ?? ''} onChange={(e) => set({ ...v, cubic2: e.target.value })} /></Field>
      <Field label={t('Height cm', 'สูง', '高')}><input type="number" step="any" value={v.cubic3 ?? ''} onChange={(e) => set({ ...v, cubic3: e.target.value })} /></Field>
    </>
  );
}

/** NewPackingListForm (pack with order) and ReceiveNoBillForm (pack without order), shown as a dialog on the packing list. */
function PackNewModal({ mode, order, onClose, onSaved }: { mode: 'order' | 'nobill'; order?: string; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const { lookups } = useApp();
  const { run, busy } = useAction();
  const blank = { customer_id: null as any, shipment_id: null as any, weight: '', cubic1: '', cubic2: '', cubic3: '', remark: '', tracking_no: '', boxes: 1, ctn: '', no: '' };
  const [h, setH] = useState<any>(blank);
  const [items, setItems] = useState<any[]>([]);
  const [styles, setStyles] = useState<any[]>([]);
  const [orderId, setOrderId] = useState(order || '');
  const [newStyle, setNewStyle] = useState<any>({ style_id: null, quantity: 1 });
  const [print, setPrint] = useState<{ packings: any[]; start: 'labels' | 'receipt' } | null>(null);
  const [last, setLast] = useState<any[]>([]);
  const waiting = useApi<any[]>(mode === 'order' && (h.customer_id || orderId) ? '/packing/waiting' : null, { customer_id: h.customer_id, order_id: orderId });
  const chosen = new Set(items.map((i) => i.order_item_id));
  useEffect(() => { setItems([]); }, [h.customer_id]);
  const leftOf = (r: any) => Math.max(r.received_qty, r.quantity) - r.packed_qty;
  const addItem = (r: any) => {
    if (h.customer_id && r.customer_id !== h.customer_id) return;
    if (!h.customer_id) setH((x: any) => ({ ...x, customer_id: r.customer_id }));
    setItems((xs) => [...xs, { order_item_id: r.id, order_id: r.order_id, order_no: r.order_no, product_id: r.product_id, left: leftOf(r), quantity: leftOf(r),
      style: pick({ th: r.style_th, zh: r.style_zh, en: r.style_en }, lang) }]);
  };
  const addStyle = () => {
    if (!newStyle.style_id || !(Number(newStyle.quantity) > 0)) return;
    setStyles([...styles, { ...newStyle, key: Math.random() }]);
    setNewStyle({ style_id: null, quantity: 1 });
  };
  const save = async () => {
    const r: any = await run(() => api('/packing', { body: { ...h, tracking_no: mode === 'nobill' ? h.tracking_no : '', items: mode === 'order' ? items : [], styles: styles.map((s) => ({ style_id: s.style_id, quantity: s.quantity })) } }),
      t('Saved', 'บันทึกแล้ว', '已保存'));
    if (!r) return;
    setLast(r.packings);
    if (lookups.settings.print_after_pack === '1') setPrint({ packings: r.packings, start: mode === 'nobill' ? 'receipt' : 'labels' });
    setItems([]); setStyles([]); setH({ ...blank, customer_id: h.customer_id, transport: h.transport });
    waiting.reload(); onSaved();
  };
  const styleName = (id: number) => { const s = lookups.styles.find((x) => x.id === id); return s ? pick(s, lang) : id; };
  const saveRef = useRef(save);
  saveRef.current = save;
  const canSave = !busy && !!h.customer_id;
  useEffect(() => {
    if (print) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'F1') { e.preventDefault(); if (canSave) void saveRef.current(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [canSave, print]);
  const noMeasure = !Number(h.weight) || !(Number(h.cubic1) * Number(h.cubic2) * Number(h.cubic3));
  return (
    <>
      {/* hidden (state kept) while the print dialog is up, so the two dialogs never stack */}
      <Modal open={!print} xl onClose={onClose}
        title={mode === 'order' ? t('Pack & weigh', 'แพคของ + ชั่งน้ำหนัก', '打包+称重') : t('Receive without bill', 'รับของไม่มีบิล', '没有订单收货')}
        footer={<>
          {last.length > 0 && <span className="muted" style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {t('Last saved', 'บันทึกล่าสุด', '刚保存')}: <b>{last.map((p) => p.packing_code).join(', ')}</b>
            <button className="link" onClick={() => setPrint({ packings: last, start: 'labels' })}><Printer size={16} aria-hidden /> {t('Labels', 'ปริ้นป้าย', '打印标签')}</button>
            <button className="link" onClick={() => setPrint({ packings: last, start: 'receipt' })}><ReceiptText size={16} aria-hidden /> {t('Receipt', 'ใบรับของ', '收货单')}</button>
          </span>}
          <button onClick={onClose}>{t('Close', 'ปิด', '关闭')}</button>
          <button className="primary" disabled={!canSave} onClick={save} title={t('Shortcut: F1', 'กด F1 เพื่อบันทึกได้', '快捷键 F1')}>{t('Save', 'บันทึก', '保存')} <kbd className="on-primary">F1</kbd></button>
        </>}>
        <Grid cols={4}>
          <Field label={t('Customer code', 'รหัสลูกค้า', '客户代码') + ' *'}><CustomerPick value={h.customer_id} onChange={(v) => setH({ ...h, customer_id: v })} placeholder={t('Customer code', 'รหัสลูกค้า', '客户代码')} autoFocus /></Field>
          {mode === 'order' && <Field label={t('…or find by order no.', 'หรือค้นจากเลขออเดอร์', '或订单号')}><input value={orderId} onChange={(e) => setOrderId(e.target.value)} /></Field>}
          {mode === 'nobill' && <Field label={t('Number of boxes', 'จำนวนกล่อง / กระสอบ', '包数')} hint={t('One label each', 'สร้างหลายกล่องพร้อมกัน ป้ายละ 1 ใบ', '每包一张标签')}><input type="number" min={1} value={h.boxes} onChange={(e) => setH({ ...h, boxes: e.target.value })} /></Field>}
          {mode === 'nobill' && <Field label={t('Tracking no. (optional)', 'เลขแทรค (ไม่บังคับ)', '别的单号')}><input value={h.tracking_no} onChange={(e) => setH({ ...h, tracking_no: e.target.value })} /></Field>}
          <Field label={t('Transport', 'ส่งทาง รถ / เรือ', '运输方式')}><TransportPick value={h.transport} onChange={(v) => setH({ ...h, transport: v })} /></Field>
          <Field label={t('Other customers (tracking only)', 'ลูกค้ารอง (ไว้ติดตาม ไม่คิดเงิน)', '其他客户（仅跟踪）')}><OtherCustomersPick value={h.other_customer_ids} main={h.customer_id} onChange={(v) => setH({ ...h, other_customer_ids: v })} /></Field>
          <Measure v={h} set={setH} />
          {lookups.settings.input_ctn_and_no === '1' && <>
            <Field label="CTN"><input type="number" value={h.ctn} onChange={(e) => setH({ ...h, ctn: e.target.value })} /></Field>
            <Field label="No."><input type="number" value={h.no} onChange={(e) => setH({ ...h, no: e.target.value })} /></Field>
          </>}
          <Field label={t('Remark', 'หมายเหตุ', '备注')} wide><input value={h.remark} onChange={(e) => setH({ ...h, remark: e.target.value })} /></Field>
        </Grid>
        <div className="muted" style={{ marginTop: 8 }}>
          {t('CBM', 'คิว', '立方')}: {cbmText(h)} m³
          {noMeasure && <> · {t('Weight and size can be filled in later under “Weigh boxes later”.', 'ยังไม่ชั่ง/วัดก็บันทึกได้ แล้วค่อยไปใส่ทีหลังที่เมนู “ชั่งน้ำหนัก / วัดขนาดทีหลัง”', '可以稍后补录重量尺寸')}</>}
        </div>
        {mode === 'order' && (
          <div className="split" style={{ marginTop: 16 }}>
            <div>
              <h3><Bi>{t('Order lines waiting to pack', 'รายการรอแพค (คลิกเพื่อใส่กล่อง)', '等待打包')}</Bi></h3>
              <Table maxHeight={300} rows={(waiting.data || []).filter((r) => !chosen.has(r.id))} onRow={addItem} columns={[
                { key: 'order_no', label: t('Order no.', 'เลขออเดอร์', '订单号'), render: (r) => <b>{orderLabel(r)}</b> },
                { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') },
                { key: 'product_id', label: t('Product', 'รหัสสินค้า', '款号') },
                { key: 'quantity', label: t('Ordered', 'สั่ง', '订'), align: 'right' },
                { key: 'packed_qty', label: t('Packed', 'แพคแล้ว', '已打包'), align: 'right' },
                { key: 'left', label: t('To pack', 'เหลือแพค', '待打包'), align: 'right', render: (r) => <b>{leftOf(r)}</b> },
              ]} empty={h.customer_id || orderId ? t('Nothing waiting to pack', 'ไม่มีรายการรอแพค', '没有') : t('Choose a customer or type an order no.', 'เลือกลูกค้า หรือพิมพ์เลขออเดอร์', '先选择客户')} />
            </div>
            <div>
              <h3><Bi>{t('In this box', 'ในกล่อง / กระสอบนี้', '本包')}</Bi></h3>
              <Table rowKey="order_item_id" rows={items} columns={[
                { key: 'order_no', label: t('Order no.', 'เลขออเดอร์', '订单号'), render: (r) => <b>{orderLabel(r)}</b> },
                { key: 'product_id', label: t('Product', 'รหัสสินค้า', '款号') },
                { key: 'quantity', label: t('Qty', 'จำนวน', '数量'), width: 110, render: (r) => <input type="number" step="any" min={0} max={r.left} value={r.quantity} onChange={(e) => setItems(items.map((x) => x.order_item_id === r.order_item_id ? { ...x, quantity: e.target.value } : x))} /> },
                { key: 'left', label: t('of', 'จาก', '共'), align: 'right' },
                { key: 'x', label: '', render: (r) => <button className="link danger" onClick={() => setItems(items.filter((x) => x.order_item_id !== r.order_item_id))}><X size={16} aria-hidden /><span className="sr-only">Remove</span></button> },
              ]} empty={t('Click a line on the left', 'คลิกรายการด้านซ้าย', '点击左边')} />
            </div>
          </div>
        )}
        {/* pack & weigh: contents come from the order lines only; receive-without-bill picks categories */}
        {mode === 'nobill' && <>
        <h3 style={{ marginTop: 16 }}><Bi>{t('Contents (optional)', 'สินค้าในกล่อง (ไม่บังคับ ใส่ทีหลังได้)', '产品')}</Bi></h3>
        <div className="row" style={{ marginBottom: 10 }}>
          <div style={{ minWidth: 260, flex: 1 }}><StylePick value={newStyle.style_id} onChange={(v) => setNewStyle({ ...newStyle, style_id: v })} /></div>
          <input type="number" style={{ width: 100 }} value={newStyle.quantity} onChange={(e) => setNewStyle({ ...newStyle, quantity: e.target.value })} />
          <button onClick={addStyle}><Plus size={16} aria-hidden /> {t('Add', 'เพิ่ม', '加')}</button>
        </div>
        {styles.length > 0 && <Table rowKey="key" rows={styles} columns={[
          { key: 'style_id', label: t('Category', 'ประเภทสินค้า', '产品分类'), render: (r) => styleName(r.style_id) },
          { key: 'quantity', label: t('Qty', 'จำนวน', '数量'), align: 'right' },
          { key: 'x', label: '', render: (r) => <button className="link danger" onClick={() => setStyles(styles.filter((s) => s.key !== r.key))}><X size={16} aria-hidden /><span className="sr-only">Remove</span></button> },
        ]} />}
        </>}
      </Modal>
      <PackPrint packings={print?.packings || null} start={print?.start} onClose={() => setPrint(null)} />
    </>
  );
}

/** ชั่งน้ำหนัก / วัดขนาดทีหลัง — fill weight and size for many boxes in one grid. */
export function PackWeigh() {
  const t = useT();
  const [q, setQ] = useState<any>({ unmeasured: '1', sent: '0', sort: 'old' }); // oldest first: weigh what has waited longest
  const { data, reload } = useApi<any[]>('/packing', q);
  const [edits, setEdits] = useState<Record<number, any>>({});
  const [sel, setSel] = useState<Set<any>>(new Set());
  const [print, setPrint] = useState<any[] | null>(null);
  const [bulk, setBulk] = useState<any>({ weight: '', cubic1: '', cubic2: '', cubic3: '' });
  const { run, busy } = useAction();
  const rows = (data || []).map((r) => ({ ...r, ...edits[r.id] }));
  // bulk: copy the filled-in fields to every ticked box (saved together with the normal Save)
  const bulkFields = Object.entries(bulk).filter(([, v]) => v !== '' && v !== null);
  const applyBulk = () => {
    if (!sel.size || !bulkFields.length) return;
    setEdits((e) => { const n = { ...e }; sel.forEach((id) => { n[id] = { ...n[id], ...Object.fromEntries(bulkFields) }; }); return n; });
  };
  const dirty = Object.keys(edits).length;
  const set = (id: number, k: string, v: string) => setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
  const save = async () => {
    const body = { rows: Object.entries(edits).map(([id, v]) => ({ id: Number(id), ...v })) };
    if (!await run(() => api('/packing/measure', { body }))) return;
    setEdits({}); reload();
    // labels for the boxes just weighed, so the new kg / size can go on the box straight away
    setPrint(await Promise.all(body.rows.map((r) => api(`/packing/${r.id}`))));
  };
  // Enter jumps to the same field on the next box, like a spreadsheet
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-m]'));
    const i = all.indexOf(e.currentTarget);
    (all[i + 1])?.focus();
    (all[i + 1])?.select();
  };
  const cell = (k: string) => (r: any) => <input data-m type="number" step="any" min={0} style={{ width: 90 }} value={r[k] || ''} onKeyDown={onKey} onChange={(e) => set(r.id, k, e.target.value)} />;
  const printSel = async () => setPrint(await Promise.all([...sel].map((id) => api(`/packing/${id}`))));
  return (
    <Page title={t('Weigh boxes later', 'ชั่งน้ำหนัก / วัดขนาดทีหลัง', '补录重量尺寸')}
      actions={<>
        <button disabled={!sel.size} onClick={printSel}><Printer size={16} aria-hidden /> {t('Print labels', 'ปริ้นป้าย', '打印')} ({sel.size})</button>
        <button className="primary" disabled={!dirty || busy} onClick={save}>{t('Save', 'บันทึก', '保存')} ({dirty})</button></>}>
      <Card>
        <Grid cols={4}>
          <Field label={t('Customer code', 'รหัสลูกค้า', '客户')}><CustomerPick value={q.customer_id} onChange={(v) => setQ({ ...q, customer_id: v })} /></Field>
          <Field label={t('Shipment round', 'รอบขนส่ง', '发货单')}><ShipmentPick value={q.shipment_id} onChange={(v) => setQ({ ...q, shipment_id: v })} placeholder={t('All rounds', '--ทุกรอบขนส่ง--', '所有的发货单')} /></Field>
          <Field label={t('Order / tracking / box no. / ref', 'เลขออเดอร์ / แทรค / เลขกล่อง / ref', '订单号 / 单号 / 包号 / 参考号')}><input value={q.ref || ''} onChange={(e) => setQ({ ...q, ref: e.target.value })} /></Field>
          <Field label={t('Show', 'แสดง', '显示')}>
            <select value={q.unmeasured} onChange={(e) => setQ({ ...q, unmeasured: e.target.value })}>
              <option value="1">{t('Missing weight or size', 'เฉพาะที่ยังไม่ชั่ง/วัด', '未称重')}</option><option value="">{t('All boxes', 'ทั้งหมด', '全部')}</option>
            </select>
          </Field>
        </Grid>
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <b style={{ alignSelf: 'center' }}>{t('Same for ticked boxes', 'ใส่ค่าเดียวกันให้ที่ติ๊ก', '批量填写')}:</b>
          {(['weight', 'cubic1', 'cubic2', 'cubic3'] as const).map((k) => (
            <input key={k} type="number" step="any" min={0} style={{ width: 110 }} value={bulk[k]} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })}
              placeholder={k === 'weight' ? 'kg' : k === 'cubic1' ? t('W cm', 'กว้าง', '宽') : k === 'cubic2' ? t('L cm', 'ยาว', '长') : t('H cm', 'สูง', '高')} aria-label={k} />
          ))}
          <button disabled={!sel.size || !bulkFields.length} onClick={applyBulk}>{t('Apply to ticked', 'ใส่ให้ที่ติ๊ก', '应用到已选')} ({sel.size})</button>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>{t('Type the numbers and press Enter to move down, or tick boxes and fill them all at once above. Press Save once at the end.', 'พิมพ์ตัวเลขแล้วกด Enter เพื่อไปช่องถัดไป หรือติ๊กหลายกล่องแล้วใส่ค่าเดียวกันด้านบน เสร็จแล้วกดบันทึกครั้งเดียว', '输入后按 Enter 跳到下一格，或勾选后批量填写，最后保存')}</p>
      </Card>
      <Table rows={rows} selectable={() => true} selected={sel} onSelect={setSel} rowClass={(r) => (edits[r.id] ? 'on' : '')} columns={[
        { key: 'packing_code', label: t('Box no.', 'เลขกล่อง', '包号'), render: (r) => <b>{r.packing_code}</b> },
        { key: 'ref', label: t('Order / tracking / ref', 'เลขออเดอร์ / แทรค / ref', '订单号 / 单号 / 参考号'), render: (r) => <span className="clip">{boxRef(r)}</span> },
        { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') },
        { key: 'weight', label: 'kg', render: cell('weight') },
        { key: 'cubic1', label: t('W cm', 'กว้าง', '宽'), render: cell('cubic1') },
        { key: 'cubic2', label: t('L cm', 'ยาว', '长'), render: cell('cubic2') },
        { key: 'cubic3', label: t('H cm', 'สูง', '高'), render: cell('cubic3') },
        { key: 'cbm', label: t('CBM', 'คิว', '立方'), align: 'right', render: (r) => cbmText(r) },
        { key: 'created_at', label: t('Received', 'รับเมื่อ', '收货'), render: (r) => r.created_at?.slice(0, 16) },
      ]} empty={t('All boxes have weight and size', 'ทุกกล่องชั่ง/วัดครบแล้ว', '全部已称重')} />
      <PackPrint packings={print} onClose={() => setPrint(null)} />
    </Page>
  );
}

function PackingEditModal({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const { data: p, reload, setData } = useApi<any>(`/packing/${id}`);
  const { run, busy } = useAction();
  const { ask } = useAsk();
  const [ns, setNs] = useState<any>({ style_id: null, quantity: 1 });
  if (!p) return null;
  const save = async () => { if (await run(() => api(`/packing/${id}`, { method: 'PUT', body: p }))) { onSaved(); onClose(); } };
  return (
    <Modal open wide title={<>{t('Edit packing', 'แก้ไข Packing', '修改')} {p.packing_code} · {p.customer_code}</>} onClose={onClose}
      footer={<><button onClick={onClose}>{t('Cancel', 'ยกเลิก', '取消')}</button><button className="primary" disabled={busy} onClick={save}>{t('Save', 'บันทึก', '保存')}</button></>}>
      <Grid cols={4}>
        <Field label="CTN"><input type="number" value={p.ctn ?? ''} onChange={(e) => setData({ ...p, ctn: e.target.value })} /></Field>
        <Field label="No."><input type="number" value={p.no ?? ''} onChange={(e) => setData({ ...p, no: e.target.value })} /></Field>
        <Field label={t('Tracking', 'เลขแทรค', '单号')}><input value={p.tracking_no ?? ''} onChange={(e) => setData({ ...p, tracking_no: e.target.value })} /></Field>
        <Field label={t('Transport', 'ส่งทาง รถ / เรือ', '运输方式')}><TransportPick value={p.transport} onChange={(v) => setData({ ...p, transport: v })} /></Field>
        <Field label={t('Other customers (tracking only)', 'ลูกค้ารอง (ไว้ติดตาม ไม่คิดเงิน)', '其他客户（仅跟踪）')}><OtherCustomersPick value={p.other_customer_ids} main={p.customer_id} onChange={(v) => setData({ ...p, other_customer_ids: v })} /></Field>
        <Measure v={p} set={setData} />
        <Field label={t('Remark', 'หมายเหตุ', '备注')} wide><input value={p.remark ?? ''} onChange={(e) => setData({ ...p, remark: e.target.value })} /></Field>
      </Grid>
      <h3>{t('Items from orders', 'สินค้าจากออเดอร์', '订单产品')}</h3>
      <Table rows={p.items} columns={[
        { key: 'order_no', label: t('Order no.', 'เลขออเดอร์', '订单号'), render: (r) => orderLabel(r) },
        { key: 'product_id', label: t('Product', 'รหัสสินค้า', '款号') },
        { key: 'quantity', label: t('Qty', 'จำนวน', '数量'), width: 100, render: (r) => <input type="number" defaultValue={r.quantity} onBlur={async (e) => { if (Number(e.target.value) !== r.quantity && await run(() => api(`/packing-items/${r.id}`, { method: 'PUT', body: { quantity: e.target.value } }))) reload(); }} /> },
        { key: 'x', label: '', render: (r) => <button className="link danger" onClick={async () => { if (await ask(t('Delete this item?', 'ต้องการลบรายการนี้?', '你确定要删除吗?'), { danger: true }) && await run(() => api(`/packing-items/${r.id}`, { method: 'DELETE' }))) reload(); }}><X size={16} aria-hidden /><span className="sr-only">Remove</span></button> },
      ]} />
      <h3>{t('Categories (no bill)', 'ประเภทสินค้า', '产品分类')}</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <div style={{ minWidth: 240, flex: 1 }}><StylePick value={ns.style_id} onChange={(v) => setNs({ ...ns, style_id: v })} /></div>
        <input type="number" style={{ width: 90 }} value={ns.quantity} onChange={(e) => setNs({ ...ns, quantity: e.target.value })} />
        <button onClick={async () => { if (await run(() => api(`/packing/${id}/styles`, { body: ns }))) { setNs({ style_id: null, quantity: 1 }); reload(); } }}>+</button>
      </div>
      <Table rows={p.styles} columns={[
        { key: 's', label: t('Category', 'ประเภท', '分类'), render: (r) => pick({ th: r.style_th, zh: r.style_zh, en: r.style_en }, lang) },
        { key: 'quantity', label: t('Qty', 'จำนวน', '数量'), width: 100, render: (r) => <input type="number" defaultValue={r.quantity} onBlur={async (e) => { if (Number(e.target.value) !== r.quantity && await run(() => api(`/packing-styles/${r.id}`, { method: 'PUT', body: { style_id: r.style_id, quantity: e.target.value } }))) reload(); }} /> },
        { key: 'x', label: '', render: (r) => <button className="link danger" onClick={async () => { if (await run(() => api(`/packing-styles/${r.id}`, { method: 'DELETE' }))) reload(); }}><X size={16} aria-hidden /><span className="sr-only">Remove</span></button> },
      ]} />
    </Modal>
  );
}

type PackDialog = 'new' | 'nobill' | 'file';

/** Packing list (main packing screen): every box with filters, plus dialogs to pack, receive without bill and pack from file. */
export function PackingList() {
  const t = useT();
  const transportText = useTransportText();
  const can = useCan();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState<any>({ sent: '0', unmeasured: '', customer_id: sp.get('customer') ? Number(sp.get('customer')) : null });
  // no customer and no search text: one line per customer; click a customer to see their boxes
  const grouped = !q.customer_id && !String(q.ref || '').trim();
  const [cust, setCust] = useState<{ id: number; code: string } | null>(null); // customer opened in the dialog
  const { data, reload: reloadBoxes } = useApi<any[]>(grouped && !cust ? null : '/packing', cust ? { ...q, customer_id: cust.id } : q);
  const groups = useApi<any[]>(grouped ? '/packing/by-customer' : null, q);
  const reload = () => { if (grouped) groups.reload(); if (!grouped || cust) reloadBoxes(); };
  const [edit, setEdit] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<any>>(new Set());
  const [print, setPrint] = useState<{ packings: any[]; start: 'labels' | 'receipt' } | null>(null);
  const { run } = useAction();
  const { ask } = useAsk();
  const dialog = sp.get('open') as PackDialog | null;
  const openDialog = (d: PackDialog | null) => setSp((p) => { const n = new URLSearchParams(p); if (d) n.set('open', d); else { n.delete('open'); n.delete('order'); } return n; }, { replace: !d });
  const closeDialog = () => openDialog(null);
  const canNew = can.menu('packing.new'), canNobill = can.menu('packing.nobill'), canFile = can.menu('packing.bulk'), canEdit = can.menu('packing.search');
  const printSel = async (start: 'labels' | 'receipt') => setPrint({ packings: await Promise.all([...sel].map((id) => api(`/packing/${id}`))), start });
  const set = (k: string, v: any) => { setQ({ ...q, [k]: v }); setSel(new Set()); };
  const boxesView = <>
      <div className="row" style={{ margin: '0 0 10px', alignItems: 'center' }}>
        {!grouped && q.customer_id && <button onClick={() => set('customer_id', null)}><ArrowLeft size={16} aria-hidden /> {t('All customers', 'ทุกลูกค้า', '所有客户')}</button>}
        <span className="muted">{data ? `${data.length} ${t('boxes', 'กล่อง', '包')}` : ''}{sel.size ? ` · ${t('selected', 'เลือก', '已选')} ${sel.size}` : ''}</span>
        <span style={{ flex: 1 }} />
        <button disabled={!sel.size} onClick={() => printSel('labels')}><Printer size={16} aria-hidden /> {t('Print labels', 'ปริ้นป้าย', '打印标签')} ({sel.size})</button>
        <button disabled={!sel.size} onClick={() => printSel('receipt')}><ReceiptText size={16} aria-hidden /> {t('Goods receipt', 'ใบรับของ', '收货单')} ({sel.size})</button>
      </div>
      <Table rows={data} onRow={canEdit ? (r) => setEdit(r.id) : undefined} selectable={() => true} selected={sel} onSelect={setSel} columns={[
        { key: 'packing_code', label: t('Box no.', 'เลขกล่อง', '包号'), render: (r) => <b>{r.packing_code}</b> },
        { key: 'ref', label: t('Order / tracking / ref', 'เลขออเดอร์ / แทรค / ref', '订单号 / 单号 / 参考号'), render: (r) => <span className="clip">{boxRef(r)}</span> },
        { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户'), render: (r) => <>
          {cust && r.customer_id !== cust.id ? <Badge>{t('secondary', 'ลูกค้ารอง', '次要')} · {t('main', 'หลัก', '主')} {r.customer_code}</Badge> : <b>{r.customer_code}</b>}
          {r.other_customers && <div className="muted" style={{ fontSize: 12 }}>+ {r.other_customers}</div>}
        </> },
        { key: 'transport', label: t('Transport', 'รถ/เรือ', '运输'), render: (r) => transportText(r.transport) },
        { key: 'ctn', label: 'CTN', render: (r) => r.ctn ? `${r.ctn}/${r.no ?? ''}` : '' },
        { key: 'weight', label: 'kg', align: 'right', sum: true, render: (r) => Number(r.weight) ? money(r.weight) : <Badge tone="warn">{t('not weighed', 'ยังไม่ชั่ง', '未称')}</Badge> },
        { key: 'dims', label: 'cm', render: (r) => `${r.cubic1}×${r.cubic2}×${r.cubic3}` },
        { key: 'cbm', label: t('CBM', 'คิว', '立方'), align: 'right', sum: true, digits: 4, render: (r) => cbmText(r) },
        { key: 'created_at', label: t('Packed', 'แพคเมื่อ', '打包'), render: (r) => r.created_at?.slice(0, 16) },
        { key: 'st', label: t('Status', 'สถานะ', '状态'), render: (r) => r.off_china_date ? <Badge tone="good">{t('On container', 'ขึ้นตู้แล้ว', '已发')} {r.off_china_date}</Badge> : <Badge>{t('Not shipped', 'ยังไม่ส่ง', '未发货')}</Badge> },
        { key: 'x', label: '', render: (r) => <span onClick={(e) => e.stopPropagation()} className="row">
          <button className="link" onClick={async () => setPrint({ packings: [await api(`/packing/${r.id}`)], start: 'labels' })}><Printer size={16} aria-hidden /><span className="sr-only">Print</span></button>
          {canEdit && !r.off_china_date && <button className="link danger" onClick={async () => { if (await ask(t('Delete this box?', 'ต้องการลบกล่องนี้?', '你确定要删除吗?'), { danger: true }) && await run(() => api(`/packing/${r.id}`, { method: 'DELETE' }))) reload(); }}>{t('Delete', 'ลบ', '删除')}</button>}
        </span> },
      ]} empty={t('No boxes', 'ไม่มีรายการ', '没有')} />
  </>;
  return (
    <Page title={t('Packing list', 'แพคของ / PackingList', '打包 / PackingList')}
      actions={<>
        {canFile && <button onClick={() => openDialog('file')}><FileSpreadsheet size={16} aria-hidden /> {t('Pack from file', 'แพคจากไฟล์', '从文件打包')}</button>}
        {canNobill && <button onClick={() => openDialog('nobill')}><PackageOpen size={16} aria-hidden /> {t('Receive without bill', 'รับของไม่มีบิล', '没有订单收货')}</button>}
        {canNew && <button className="primary" onClick={() => openDialog('new')}><PackagePlus size={16} aria-hidden /> {t('Pack & weigh', 'แพคของ + ชั่งน้ำหนัก', '打包+称重')}</button>}
      </>}>
      <Card>
        <Grid cols={4}>
          <Field label={t('Customer code', 'รหัสลูกค้า', '客户')}><CustomerPick value={q.customer_id} onChange={(v) => set('customer_id', v)} /></Field>
          <Field label={t('Shipment round', 'รอบขนส่ง', '发货单')}><ShipmentPick value={q.shipment_id} onChange={(v) => set('shipment_id', v)} placeholder={t('All rounds', '--ทุกรอบขนส่ง--', '所有的发货单')} /></Field>
          <Field label={t('Order / tracking / box no. / ref', 'เลขออเดอร์ / แทรค / เลขกล่อง / ref', '订单号 / 单号 / 包号 / 参考号')}><input value={q.ref || ''} onChange={(e) => set('ref', e.target.value)} /></Field>
          <Field label={t('Transport', 'ส่งทาง รถ / เรือ', '运输方式')}><TransportPick all value={q.transport} onChange={(v) => set('transport', v)} /></Field>
          <Field label={t('Status', 'สถานะ', '状态')}>
            <select value={q.sent} onChange={(e) => set('sent', e.target.value)}>
              <option value="0">{t('Not loaded yet', 'ยังไม่ขึ้นตู้', '未发货')}</option><option value="1">{t('On container', 'ขึ้นตู้แล้ว', '已发')}</option>
              <option value="">{t('All', 'ทั้งหมด', '全部')}</option>
            </select>
          </Field>
          <Field label={t('Weight / size', 'น้ำหนัก / ขนาด', '重量尺寸')}>
            <select value={q.unmeasured} onChange={(e) => set('unmeasured', e.target.value)}>
              <option value="">{t('All', 'ทั้งหมด', '全部')}</option><option value="1">{t('Not weighed yet', 'ยังไม่ชั่ง/วัด', '未称重')}</option>
            </select>
          </Field>
        </Grid>
      </Card>
      {grouped ? <>
        <div className="row" style={{ margin: '0 0 10px', alignItems: 'center' }}>
          <span className="muted">{groups.data ? `${groups.data.length} ${t('customers', 'ลูกค้า', '客户')} · ${groups.data.reduce((n, g) => n + g.boxes, 0)} ${t('boxes', 'กล่อง', '包')}` : ''}</span>
        </div>
        <Table rows={groups.data} onRow={(g) => { setSel(new Set()); setCust({ id: g.customer_id, code: g.customer_code }); }} columns={[
          { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户'), render: (g) => <b>{g.customer_code}</b> },
          { key: 'boxes', label: t('Boxes', 'จำนวนกล่อง', '包数'), align: 'right', sum: true, digits: 0 },
          { key: 'not_sent', label: t('Not loaded', 'ยังไม่ขึ้นตู้', '未发货'), align: 'right', sum: true, digits: 0 },
          { key: 'unweighed', label: t('Not weighed', 'ยังไม่ชั่ง', '未称'), align: 'right', sum: true, digits: 0, render: (g) => g.unweighed ? <Badge tone="warn">{g.unweighed}</Badge> : 0 },
          { key: 'weight', label: 'kg', align: 'right', sum: true, render: (g) => money(g.weight || 0) },
          { key: 'cbm', label: t('CBM', 'คิว', '立方'), align: 'right', sum: true, digits: 4, render: (g) => Number(g.cbm || 0).toFixed(4) },
          { key: 'order_nos', label: t('Order no.', 'เลขออเดอร์', '订单号'), render: (g) => <span className="clip">{g.order_nos || ''}</span> },
          { key: 'last_packed', label: t('Last packed', 'แพคล่าสุด', '最近打包'), render: (g) => g.last_packed?.slice(0, 16) },
        ]} empty={t('No boxes', 'ไม่มีรายการ', '没有')} />
        <Modal open={!!cust && !edit && !print} xl title={<>{cust?.code} · {t('Boxes', 'รายการกล่อง', '包裹')}</>} onClose={() => { setCust(null); setSel(new Set()); }}
          footer={<button onClick={() => { setCust(null); setSel(new Set()); }}>{t('Close', 'ปิด', '关闭')}</button>}>
          {boxesView}
        </Modal>
      </> : boxesView}
      {edit && <PackingEditModal id={edit} onClose={() => setEdit(null)} onSaved={reload} />}
      <PackPrint packings={print?.packings || null} start={print?.start} onClose={() => setPrint(null)} />
      {(dialog === 'new' && canNew) && <PackNewModal mode="order" order={sp.get('order') || ''} onClose={closeDialog} onSaved={reload} />}
      {(dialog === 'nobill' && canNobill) && <PackNewModal mode="nobill" onClose={closeDialog} onSaved={reload} />}
      {(dialog === 'file' && canFile) && <PackingImportModal onClose={closeDialog} onSaved={reload} />}
    </Page>
  );
}

/** Old addresses (/packing/new, /packing/nobill, /packing/import) open the matching dialog on the packing list. */
export function PackingRedirect({ open }: { open: PackDialog }) {
  const [sp] = useSearchParams();
  const n = new URLSearchParams(sp);
  n.set('open', open);
  return <Navigate to={`/packing?${n}`} replace />;
}

/** BuckPackingcs — paste rows from a forwarder's file and create / update boxes in bulk. */
function PackingImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [text, setText] = useState('');
  const [style, setStyle] = useState<any>(null);
  const [transport, setTransport] = useState('');
  const [rows, setRows] = useState<any[] | null>(null);
  const { run, busy } = useAction();
  const preview = async () => { const r: any = await run(() => api('/packing/import', { body: { text } }), false); if (r) setRows(r.rows); };
  const commit = async () => {
    const r: any = await run(() => api('/packing/import', { body: { text, commit: true, style_id: style, transport } }));
    if (r) { setRows(null); setText(''); toast(`${r.created.length} ${t('boxes saved', 'กระสอบบันทึกแล้ว', '包已保存')}`); onSaved(); onClose(); }
  };
  return (
    <Modal open wide onClose={onClose} title={t('Pack from file', 'แพคจากไฟล์', '从文件打包')}
      footer={<>
        <button onClick={onClose}>{t('Cancel', 'ยกเลิก', '取消')}</button>
        <button onClick={preview} disabled={!text.trim() || busy}>{t('Preview', 'ตรวจข้อมูลก่อนบันทึก', '预览')}</button>
        <button className="primary" onClick={commit} disabled={!rows || busy}>{t('Save boxes', 'บันทึก', '保存')}</button>
      </>}>
      <p className="muted" style={{ marginTop: 0 }}>{t('Paste rows or load a .txt/.csv file. Two formats are understood:', 'วางข้อมูลหรือเลือกไฟล์ รองรับ 2 แบบ', '粘贴或选择文件，支持两种格式')}</p>
      <pre className="muted" style={{ whiteSpace: 'pre-wrap' }}>{'1) rowid|ctn|no|PK0001|custId|CODE|weight|width|length|height|CHtracking   (old JJCargo ShipmentN.txt)\n2) CODE,weight,width,length,height,tracking,remark   (CSV or tab separated)'}</pre>
      <Grid cols={3}>
        <Field label={t('Category for new boxes', 'ประเภทสินค้าสำหรับกระสอบใหม่', '新包的产品分类')}><StylePick value={style} onChange={setStyle} /></Field>
        <Field label={t('Transport', 'ส่งทาง รถ / เรือ', '运输方式')}><TransportPick value={transport} onChange={setTransport} /></Field>
        <Field label={t('File', 'ไฟล์', '文件')}><input type="file" accept=".txt,.csv,.tsv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setRows(null); } }} /></Field>
        <Field label={t('Rows', 'ข้อมูล', '数据')} wide><textarea rows={8} value={text} onChange={(e) => { setText(e.target.value); setRows(null); }} /></Field>
      </Grid>
      {rows && (
        <div style={{ marginTop: 16 }}>
          <Table rowKey="_i" maxHeight={320} rows={rows.map((r, i) => ({ ...r, _i: i }))} columns={[
            { key: 'packing_code', label: t('Box', 'เลขกระสอบ', '包号'), render: (r) => r.packing_code || <i className="muted">{t('new', 'ใหม่', '新')}</i> },
            { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') },
            { key: 'weight', label: 'kg', money: true, sum: true },
            { key: 'dims', label: 'cm', render: (r) => `${r.cubic1}×${r.cubic2}×${r.cubic3}` },
            { key: 'tracking_no', label: t('Tracking', 'เลขแทรค', '单号') },
            { key: 'status', label: t('Result', 'ผล', '结果'), render: (r) => <Badge tone={r.status === 'new' ? 'good' : r.status === 'update' ? 'info' : 'bad'}>{r.status}</Badge> },
          ]} />
        </div>
      )}
    </Modal>
  );
}
