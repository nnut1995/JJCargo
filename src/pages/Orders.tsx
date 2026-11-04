import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, useApi, useApp, useCan, useLang, useT, money, pick, today, monthStart } from '../lib';
import { Page, Card, Grid, Field, Table, Tabs, CustomerPick, StylePick, DateRange, Badge, useAction, useAsk } from '../ui';
import { BillList } from './Packages';
import { Check, Plus, ReceiptText, Search } from 'lucide-react';

const emptyLine = () => ({ key: Math.random(), product_id: '', style_id: null as any, quantity: 1, unit_price: 0 });

/** NewOrderForm — create or edit a purchase order for a customer (bought from a Chinese shop). */
export function OrderEdit() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { run, busy } = useAction();
  const { lang } = useLang();
  const { lookups } = useApp();
  const [o, setO] = useState<any>({ customer_id: sp.get('customer_id') ? Number(sp.get('customer_id')) : null, order_no: '', order_date: today(), payment_type: 'credit', deposit: 0, supplier_name: '', supplier_phone: '' });
  const [items, setItems] = useState<any[]>([emptyLine()]);
  useEffect(() => {
    if (!id) return;
    api(`/orders/${id}`).then((x) => { setO(x); setItems(x.items.map((i: any) => ({ ...i, key: i.id }))); });
  }, [id]);
  const total = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
  const upd = (k: any, patch: any) => setItems((xs) => xs.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const save = async (another: boolean) => {
    const body = { ...o, items: items.filter((i) => i.product_id || i.style_id) };
    const r = await run(() => (id ? api(`/orders/${id}`, { method: 'PUT', body }) : api('/orders', { body })));
    if (!r) return;
    if (another) { setItems([emptyLine()]); setO({ ...o, order_no: '', supplier_name: '', supplier_phone: '', deposit: 0 }); }
    else nav(`/orders?id=${id || r.id}`);
  };
  return (
    <Page back={id ? '/orders' : undefined} title={id ? `${t('Order', 'ออเดอร์', '订单')} ${o.order_no || '#' + id}` : t('New order', 'เพิ่มออเดอร์ใหม่', '新订单')}
      actions={<>{!id && <button disabled={busy} onClick={() => save(true)}>{t('Save & new', 'บันทึกแล้วเพิ่มต่อ', '保存并新增')}</button>}
        <button className="primary" disabled={busy} onClick={() => save(false)}>{t('Save', 'บันทึก', '保存')}</button></>}>
      <Card>
        <Grid cols={4}>
          <Field label={t('Customer', 'ลูกค้า', '客户') + ' *'}><CustomerPick value={o.customer_id} onChange={(v) => setO({ ...o, customer_id: v })} placeholder={t('Choose customer', 'เลือกลูกค้า', '选择客户')} autoFocus={!id} /></Field>
          <Field label={t('Order no. (from the shop)', 'เลขออเดอร์สินค้า', '订单号')} hint={t('Used to track the goods when packing and shipping', 'ใช้เลขนี้ติดตามสินค้าตอนแพคและขนส่ง', '打包和发货时用这个号')}><input value={o.order_no || ''} onChange={(e) => setO({ ...o, order_no: e.target.value })} /></Field>
          <Field label={t('Order date', 'วันที่', '日期')}><input type="date" value={o.order_date} onChange={(e) => setO({ ...o, order_date: e.target.value })} /></Field>
          <Field label={t('Shop / seller', 'ร้านค้า', '卖家')}><input value={o.supplier_name || ''} onChange={(e) => setO({ ...o, supplier_name: e.target.value })} /></Field>
          <Field label={t('Shop phone', 'เบอร์ร้านค้า', '卖家电话')}><input value={o.supplier_phone || ''} onChange={(e) => setO({ ...o, supplier_phone: e.target.value })} /></Field>
          <Field label={t('Payment', 'การจ่ายเงิน', '付款方式')}>
            <div className="radios">
              <label><input type="radio" checked={o.payment_type === 'credit'} onChange={() => setO({ ...o, payment_type: 'credit' })} /> Credit 信貸</label>
              <label><input type="radio" checked={o.payment_type === 'paid'} onChange={() => setO({ ...o, payment_type: 'paid' })} /> {t('Already paid', 'จ่ายแล้ว', '已付')}</label>
            </div>
          </Field>
          <Field label={t('Deposit (CNY)', 'มัดจำ', '定金')}><input type="number" step="any" value={o.deposit ?? 0} onChange={(e) => setO({ ...o, deposit: e.target.value })} /></Field>
        </Grid>
      </Card>
      <Card title={t('Lines', 'รายการสินค้า', '产品')} actions={<button onClick={() => setItems([...items, emptyLine()])}><Plus size={16} aria-hidden /> {t('Add line', 'เพิ่มรายการ', '新增项目')}</button>}>
        <Table rowKey="key" rows={items} columns={[
          { key: 'n', label: '#', render: (_r, i) => i + 1, width: 40 },
          { key: 'product_id', label: t('Product id / link', 'รหัสสินค้า', '款号'), render: (r) => <input value={r.product_id || ''} onChange={(e) => upd(r.key, { product_id: e.target.value })} /> },
          { key: 'style_id', label: t('Category', 'ประเภทสินค้า', '产品分类'), render: (r) => <StylePick value={r.style_id} onChange={(v) => upd(r.key, { style_id: v })} /> },
          { key: 'quantity', label: t('Qty', 'จำนวน', '数量'), width: 100, render: (r) => <input type="number" step="any" value={r.quantity} onChange={(e) => upd(r.key, { quantity: e.target.value })} /> },
          { key: 'unit_price', label: t('Unit price ¥', 'ราคา', '单价'), width: 120, render: (r) => <input type="number" step="any" value={r.unit_price} onChange={(e) => upd(r.key, { unit_price: e.target.value })} /> },
          { key: 'total', label: t('Total ¥', 'รวม', '总价'), money: true, render: (r) => money(Number(r.quantity || 0) * Number(r.unit_price || 0)) },
          { key: 'received_qty', label: t('Received / packed', 'รับแล้ว / แพคแล้ว', '已收货'), align: 'right', render: (r) => r.id ? `${r.received_qty || 0} / ${r.packed_qty || 0}` : '' },
          { key: 'x', label: '', render: (r) => (!r.received_qty ? <button className="link danger" onClick={() => setItems(items.filter((x) => x.key !== r.key))}>{t('Remove', 'ลบ', '删除')}</button> : null) },
        ]} />
        <div className="total-line"><span>{t('Total', 'รวม', '总价')}: ¥ {money(total)}</span><span>{t('Deposit', 'มัดจำ', '定金')}: ¥ {money(o.deposit)}</span></div>
        {lookups.styles.length === 0 && <p className="muted">{t('Tip: press + next to the category box to add a new category.', 'กดปุ่ม + ข้างช่องประเภทสินค้าเพื่อเพิ่มประเภทใหม่', '点分类旁边的 + 新增分类')}</p>}
        {void lang}
      </Card>
    </Page>
  );
}

/** Orders + supplier bills on one screen (old SearchOrderForm, SearchInvoiceForm and SearchCallForm). Order list first. */
export function OrdersHub() {
  const t = useT();
  const can = useCan();
  const [sp, setSp] = useSearchParams();
  const showOrders = can.menu('order.search');
  const showBills = can.menu('package.search');
  const tab = sp.get('tab') === 'bills' && showBills ? 'bills' : showOrders ? 'orders' : 'bills';
  const search = sp.get('q') || '';
  const setTab = (k: string) => setSp((p) => { const n = new URLSearchParams(p); if (k === 'bills') n.set('tab', 'bills'); else n.delete('tab'); n.delete('id'); return n; }, { replace: true });
  const setSearch = (v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set('q', v); else n.delete('q'); n.delete('id'); return n; }, { replace: true });
  return (
    <Page title={t('Orders & supplier bills', 'ออเดอร์ + บิลโอน', '订单 + 划款单')}
      actions={<>
        {can.menu('package.new') && <Link to="/packages/new"><button className={tab === 'bills' ? 'primary' : ''}><Plus size={16} aria-hidden /> {t('New bill', 'เปิดบิลโอนใหม่', '开划款单')}</button></Link>}
        {can.menu('order.new') && <Link to="/orders/new"><button className={tab === 'orders' ? 'primary' : ''}><Plus size={16} aria-hidden /> {t('New order', 'เพิ่มออเดอร์', '新订单')}</button></Link>}
      </>}>
      {showOrders && showBills && <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'orders', label: t('Orders', 'ออเดอร์', '订单') },
        { key: 'bills', label: t('Supplier bills', 'บิลโอนเงิน', '划款单') },
      ]} />}
      {tab === 'orders'
        ? <OrderList search={search} onSearch={setSearch} onShowBills={(no) => setSp({ tab: 'bills', q: no }, { replace: true })} />
        : <BillList search={search} onSearch={setSearch} />}
    </Page>
  );
}

/** One search box for order no., bill code, shop or product id. While it has text, all dates are searched. */
export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => { const h = setTimeout(() => { if (text.trim() !== value) onChange(text.trim()); }, 350); return () => clearTimeout(h); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <Field label={t('Search', 'ค้นหา', '搜索')} hint={text ? t('Searching all dates', 'ค้นหาทุกช่วงวันที่', '搜索全部日期') : undefined}>
      <div className="search-input">
        <Search size={16} aria-hidden />
        <input autoFocus type="search" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onChange(text.trim()); }}
          placeholder={t('Order no., bill no., shop or product id', 'เลขออเดอร์ / เลขบิล / ร้านค้า / รหัสสินค้า', '单号 / 划款单 / 卖家 / 款号')} />
      </div>
    </Field>
  );
}

function OrderList({ search, onSearch, onShowBills }: { search: string; onSearch: (v: string) => void; onShowBills: (orderNo: string) => void }) {
  const t = useT();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { lang } = useLang();
  const can = useCan();
  const [q, setQ] = useState<any>({ id: sp.get('id') || '', from: monthStart(), to: '' });
  const { data, reload } = useApi<any[]>('/orders', { ...q, search, from: search || q.id ? '' : q.from, to: search || q.id ? '' : q.to });
  const [open, setOpen] = useState<number | null>(sp.get('id') ? Number(sp.get('id')) : null);
  const detail = useApi<any>(open ? `/orders/${open}` : null);
  const { run } = useAction();
  const { ask } = useAsk();
  const del = async (id: number) => {
    if (!(await ask(t('Delete this order?', 'แน่ใจหรือเปล่าว่าต้องการลบออก?', '你确定要删除吗?'), { danger: true }))) return;
    if (await run(() => api(`/orders/${id}`, { method: 'DELETE' }), t('Deleted', 'ลบแล้ว', '已删除'))) { setOpen(null); reload(); }
  };
  return (
    <>
      <Card>
        <Grid cols={4}>
          <SearchBox value={search} onChange={onSearch} />
          <Field label={t('Customer', 'ลูกค้า', '客户')}><CustomerPick value={q.customer_id} onChange={(v) => setQ({ ...q, customer_id: v })} /></Field>
          <DateRange from={search || q.id ? '' : q.from} to={search || q.id ? '' : q.to} onChange={(from, to) => setQ({ ...q, id: '', from, to })} />
        </Grid>
      </Card>
      <Table rows={data} onRow={(r) => setOpen(open === r.id ? null : r.id)} rowClass={(r) => (r.id === open ? 'on' : '')} columns={[
        { key: 'order_no', label: t('Order no.', 'เลขออเดอร์', '订单号'), render: (r) => <b>{r.order_no || `#${r.id}`}</b> },
        { key: 'order_date', label: t('Date', 'วันที่', '日期') },
        { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') },
        { key: 'supplier_name', label: t('Shop', 'ร้านค้า', '卖家') },
        { key: 'lines', label: t('Lines', 'รายการ', '列表'), align: 'right' },
        { key: 'qty', label: t('Qty', 'จำนวน', '数量'), align: 'right' },
        { key: 'received_qty', label: t('Received', 'รับแล้ว', '收到'), align: 'right', render: (r) => { const got = Math.max(r.received_qty, r.packed_qty); return <Badge tone={got >= r.qty ? 'good' : got ? 'warn' : 'neutral'}>{got}/{r.qty}</Badge>; } },
        { key: 'missing', label: t('Not received yet', 'ยังไม่ได้รับ', '未收'), align: 'right', render: (r) => { const left = r.qty - Math.max(r.received_qty, r.packed_qty); return left > 0 ? <b className="neg">{left}</b> : ''; } },
        { key: 'total', label: t('Total ¥', 'รวม', '总价'), money: true, sum: true },
        { key: 'deposit', label: t('Deposit', 'มัดจำ', '定金'), money: true },
        { key: 'payment_type', label: t('Payment', 'การจ่าย', '付款') },
        { key: 'a', label: '', render: (r) => <span className="row" onClick={(e) => e.stopPropagation()}>
          {r.qty - Math.max(r.received_qty, r.packed_qty) > 0 && <button className="link" onClick={() => nav(`/packing/new?order=${encodeURIComponent(r.order_no || r.id)}`)}>{t('Receive more', 'รับของเพิ่ม', '继续收货')}</button>}
          <button className="link" onClick={() => nav(`/orders/${r.id}`)}>{t('Edit', 'แก้ไข', '修改')}</button>
          <button className="link danger" onClick={() => del(r.id)}>{t('Delete', 'ลบ', '删除')}</button></span> },
      ]} />
      {open && detail.data && (
        <Card title={`${t('Order', 'ออเดอร์', '订单')} ${detail.data.order_no || '#' + open} · ${detail.data.customer_code}`} className="mt">
          <Table rows={detail.data.items} columns={[
            { key: 'product_id', label: t('Product id', 'รหัสสินค้า', '款号') },
            { key: 'style', label: t('Category', 'ประเภท', '分类'), render: (r) => pick({ th: r.style_th, zh: r.style_zh, en: r.style_en }, lang) },
            { key: 'quantity', label: t('Qty', 'จำนวน', '数量'), align: 'right' },
            { key: 'unit_price', label: t('Price ¥', 'ราคา', '单价'), money: true },
            { key: 't', label: t('Total', 'รวม', '总价'), money: true, render: (r) => money(r.quantity * r.unit_price) },
            { key: 'received_qty', label: t('Billed', 'เปิดบิลแล้ว', '已开单'), align: 'right' },
            { key: 'packed_qty', label: t('Packed', 'แพคแล้ว', '打包了'), align: 'right' },
            { key: 'left', label: t('Not received yet', 'ยังไม่ได้รับ', '未收'), align: 'right', render: (r) => { const left = r.quantity - Math.max(r.received_qty, r.packed_qty); return left > 0 ? <b className="neg">{left}</b> : <Badge tone="good"><Check size={12} aria-label="done" /></Badge>; } },
          ]} />
          <div className="row" style={{ marginTop: 12 }}>
            {(can.menu('package.search') || can.menu('package.new')) && <button onClick={() => onShowBills(detail.data.order_no || String(open))}><ReceiptText size={16} aria-hidden /> {t('Supplier bills of this order', 'ดูบิลโอนของออเดอร์นี้', '查看此订单的划款单')}</button>}
            {can.menu('package.new') && <Link to={`/packages/new?customer_id=${detail.data.customer_id}`}><button><Plus size={16} aria-hidden /> {t('New bill for this customer', 'เปิดบิลโอนให้ลูกค้านี้', '为此客户开划款单')}</button></Link>}
          </div>
        </Card>
      )}
    </>
  );
}
