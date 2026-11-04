import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, useApi, useApp, useCan, useLang, useT, money, pick, today, monthStart } from '../lib';
import { Page, Card, Grid, Field, Table, CustomerPick, DateRange, Badge, Modal, PrintModal, Combo, useAction, useAsk, Bi } from '../ui';
import { Printer, Plus, X } from 'lucide-react';
import { SearchBox } from './Orders';

function SupplierBankPick({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const t = useT();
  const { lookups, reloadLookups } = useApp();
  const [add, setAdd] = useState<any>(null);
  const { run } = useAction();
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <div style={{ flex: 1 }}>
        <Combo items={lookups.supplierBanks} value={value} onChange={onChange} placeholder={t('Search supplier bank', 'ค้นหาธนาคาร', '找一家银行')}
          getLabel={(b) => `${b.bank} · ${b.account_name || ''} · ${b.account_number || ''}`} />
      </div>
      <button type="button" onClick={() => setAdd({ bank: 'ICBC 工行' })}>+</button>
      {add && (
        <Modal open title={t('Add supplier bank', 'เพิ่มบัญชีร้านค้า', '新增卖家银行')} onClose={() => setAdd(null)}
          footer={<button className="primary" onClick={async () => {
            const r = await run(() => api('/r/supplier_banks', { body: add }));
            if (r) { await reloadLookups(); onChange((r as any).id); setAdd(null); }
          }}>{t('Save', 'บันทึก', '保存')}</button>}>
          <Grid cols={2}>
            <Field label={t('Bank', 'ธนาคาร', '银行')}>
              <select value={add.bank} onChange={(e) => setAdd({ ...add, bank: e.target.value })}>
                {['ICBC 工行', 'ABC 农行', 'CCB 建行', 'BOC 中行', 'Alipay 支付宝', 'WeChat 微信', 'Other 其他'].map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label={t('Account name', 'ชื่อบัญชี', '帐户名')}><input value={add.account_name || ''} onChange={(e) => setAdd({ ...add, account_name: e.target.value })} /></Field>
            <Field label={t('Account number', 'เลขบัญชี', '帐号')}><input value={add.account_number || ''} onChange={(e) => setAdd({ ...add, account_number: e.target.value })} /></Field>
            <Field label={t('Phone', 'เบอร์โทร', '电话')}><input value={add.tel || ''} onChange={(e) => setAdd({ ...add, tel: e.target.value })} /></Field>
          </Grid>
        </Modal>
      )}
    </div>
  );
}

/** NewPackageForm / ReceiveForm — receive goods for order lines and open a payment bill to the shop. */
/** An order line not billed yet, as a line of a new bill (receive what is left, at the order price). */
const toLine = (r: any) => ({ order_item_id: r.id, order_id: r.order_id, order_no: r.order_no, product_id: r.product_id, style_th: r.style_th, style_zh: r.style_zh,
  quantity: r.quantity - r.received_qty, unit_price: r.unit_price, deposit: 0, max: r.quantity - r.received_qty });

export function PackageEdit() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { lang } = useLang();
  const { run, busy } = useAction();
  const [h, setH] = useState<any>({ customer_id: null, date: today(), supplier_bank_id: null, deposit: 0, code: '' });
  const [lines, setLines] = useState<any[]>([]); // chosen lines
  const [orderFilter, setOrderFilter] = useState('');
  const [sp] = useSearchParams();
  const fromOrder = id ? null : sp.get('order_id');
  const [prefilled, setPrefilled] = useState<any>(null); // the order this new bill was started from
  useEffect(() => {
    if (id) {
      api(`/packages/${id}`).then((k) => { setH(k); setLines(k.items.map((i: any) => ({ ...i, max: i.ordered_qty }))); });
      return;
    }
    api('/packages/next-code').then((r) => setH((x: any) => ({ ...x, code: r.code })));
    const cid = sp.get('customer_id');
    if (cid && !fromOrder) setH((x: any) => ({ ...x, customer_id: Number(cid) }));
    // Opened from an order: customer, shop bank, deposit and every line not billed yet are filled in.
    if (fromOrder) api<any>(`/orders/${fromOrder}`).then((o) => {
      const open = o.items.filter((i: any) => i.quantity - i.received_qty > 0);
      const firstBill = o.items.every((i: any) => !i.received_qty);
      setH((x: any) => ({ ...x, customer_id: o.customer_id, supplier_bank_id: o.last_supplier_bank_id ?? x.supplier_bank_id, deposit: firstBill ? o.deposit || 0 : 0 }));
      setLines(open.map(toLine));
      setOrderFilter(o.order_no || String(o.id));
      setPrefilled(o);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fromOrder]);
  const waiting = useApi<any[]>(h.customer_id ? '/packages/waiting' : null, { customer_id: h.customer_id, order_id: orderFilter });
  const chosenIds = new Set(lines.map((l) => l.order_item_id));
  const add = (r: any) => setLines([...lines, toLine(r)]);
  const upd = (oid: number, patch: any) => setLines((xs) => xs.map((x) => (x.order_item_id === oid ? { ...x, ...patch } : x)));
  const total = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);
  const deposits = lines.reduce((s, l) => s + Number(l.deposit || 0), 0) + Number(h.deposit || 0);
  const save = async () => {
    const body = { ...h, items: lines.map((l) => ({ id: l.id, order_item_id: l.order_item_id, quantity: l.quantity, unit_price: l.unit_price, deposit: l.deposit, receive_date: h.date })) };
    const r: any = await run(() => (id ? api(`/packages/${id}`, { method: 'PUT', body }) : api('/packages', { body })));
    if (r) nav(`/packages/${id || r.id}`);
  };
  return (
    <Page back={id ? `/packages/${id}` : '/orders?tab=bills'} title={id ? `${t('Bill', 'บิล', '划款单')} ${h.code}` : t('New supplier bill / receive goods', 'เปิดบิลโอนใหม่ / รับของ', '开划款单 / 收货')}
      actions={<button className="primary" disabled={busy || !lines.length} onClick={save}>{t('Save bill', 'บันทึก', '保存')}</button>}>
      {prefilled && (
        <div className="note info"><Bi>
          {t(`Filled in from order ${prefilled.order_no || '#' + prefilled.id}: customer, every line not billed yet${prefilled.supplier_name ? ', shop bank used last time' : ''}. Check quantities and prices before saving.`,
            `เติมข้อมูลจากออเดอร์ ${prefilled.order_no || '#' + prefilled.id} ให้แล้ว: ลูกค้า, ทุกรายการที่ยังไม่เปิดบิล${prefilled.supplier_name ? ', บัญชีร้านที่เคยโอนครั้งล่าสุด' : ''} ตรวจจำนวนและราคาก่อนบันทึก`,
            `已按订单 ${prefilled.order_no || '#' + prefilled.id} 填写：客户、未开单的项目${prefilled.supplier_name ? '、上次的卖家银行' : ''}。保存前请核对数量和价格。`)}
        </Bi></div>
      )}
      <Card>
        <Grid cols={4}>
          <Field label={t('Customer', 'ลูกค้า', '客户') + ' *'}>
            {id ? <input value={h.customer_code || ''} disabled /> : <CustomerPick value={h.customer_id} onChange={(v) => { setH({ ...h, customer_id: v }); setLines([]); setPrefilled(null); }} placeholder={t('Choose customer', 'เลือกลูกค้า', '选择客户')} autoFocus={!fromOrder} />}
          </Field>
          <Field label={t('Payment invoice no. (auto)', 'เลขที่ใบโอนเงิน (รันอัตโนมัติ)', '划款单号')} hint={t('Product order numbers come from the orders below', 'เลขออเดอร์สินค้าดูจากรายการด้านล่าง', '订单号见下方')}><input value={h.code || ''} disabled={!!id} onChange={(e) => setH({ ...h, code: e.target.value })} /></Field>
          <Field label={t('Date received', 'วันที่รับของ', '收货日期')}><input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} /></Field>
          <Field label={t('Extra deposit ¥', 'มัดจำ', '定金')}><input type="number" step="any" value={h.deposit ?? 0} onChange={(e) => setH({ ...h, deposit: e.target.value })} /></Field>
          <Field label={t('Pay to (shop bank)', 'โอนเงินให้ร้าน', '卖家银行')} wide><SupplierBankPick value={h.supplier_bank_id} onChange={(v) => setH({ ...h, supplier_bank_id: v })} /></Field>
        </Grid>
      </Card>
      {h.customer_id && (
        <Card title={t('Order lines waiting to be received', 'รายการที่ยังไม่ได้รับของ', '等待收货')}
          actions={<><input style={{ width: 160 }} placeholder={t('Order no.', 'เลขออเดอร์', '单号')} value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)} />
            <Link to={`/orders/new?customer_id=${h.customer_id}`}><button><Plus size={16} aria-hidden /> {t('New order', 'เพิ่มออเดอร์', '新订单')}</button></Link></>}>
          <Table rows={(waiting.data || []).filter((r) => !chosenIds.has(r.id))} onRow={add} maxHeight={300} columns={[
            { key: 'order_id', label: t('Order no.', 'เลขออเดอร์', '订单号'), render: (r) => <b>{r.order_no || `#${r.order_id}`}</b> },
            { key: 'order_date', label: t('Date', 'วันที่', '日期') },
            { key: 'supplier_name', label: t('Shop', 'ร้านค้า', '卖家') },
            { key: 'product_id', label: t('Product id', 'รหัสสินค้า', '款号') },
            { key: 's', label: t('Category', 'ประเภท', '分类'), render: (r) => pick({ th: r.style_th, zh: r.style_zh }, lang) },
            { key: 'quantity', label: t('Ordered', 'สั่ง', '订'), align: 'right' },
            { key: 'received_qty', label: t('Received', 'รับแล้ว', '收到'), align: 'right' },
            { key: 'unit_price', label: t('Price ¥', 'ราคา', '单价'), money: true },
            { key: 'add', label: '', render: () => <button className="link"><Plus size={16} aria-hidden /> {t('Add', 'เพิ่ม', '加')}</button> },
          ]} empty={t('Nothing left to receive for this customer', 'ไม่มีรายการรอรับของ', '没有等待收货')} />
        </Card>
      )}
      <Card title={t('In this bill', 'รายการในบิลนี้', '本单')}>
        <Table rowKey="order_item_id" rows={lines} columns={[
          { key: 'order_id', label: t('Order no.', 'เลขออเดอร์', '订单号'), render: (r) => <b>{r.order_no || `#${r.order_id}`}</b> },
          { key: 'product_id', label: t('Product id', 'รหัสสินค้า', '款号') },
          { key: 's', label: t('Category', 'ประเภท', '分类'), render: (r) => pick({ th: r.style_th, zh: r.style_zh }, lang) },
          { key: 'quantity', label: t('Receive qty', 'รับจำนวน', '收到'), width: 110, render: (r) => <input type="number" step="any" value={r.quantity} onChange={(e) => upd(r.order_item_id, { quantity: e.target.value })} /> },
          { key: 'unit_price', label: t('Price ¥', 'ราคา', '单价'), width: 110, render: (r) => <input type="number" step="any" value={r.unit_price} onChange={(e) => upd(r.order_item_id, { unit_price: e.target.value })} /> },
          { key: 'deposit', label: t('Deposit ¥', 'มัดจำ', '定金'), width: 110, render: (r) => <input type="number" step="any" value={r.deposit} onChange={(e) => upd(r.order_item_id, { deposit: e.target.value })} /> },
          { key: 'tot', label: t('Total ¥', 'รวม', '总价'), money: true, render: (r) => money(r.quantity * r.unit_price) },
          { key: 'x', label: '', render: (r) => <button className="link danger" onClick={() => setLines(lines.filter((l) => l.order_item_id !== r.order_item_id))}>{t('Remove', 'ลบ', '删除')}</button> },
        ]} empty={t('Click a line above to add it', 'คลิกรายการด้านบนเพื่อเพิ่ม', '点击上面的项目添加')} />
        <div className="total-line">
          <span>{t('Total', 'รวม', '总价')} ¥ {money(total)}</span>
          <span>{t('Deposits', 'มัดจำ', '定金')} ¥ {money(deposits)}</span>
          <span>{t('To pay', 'ยอดที่ต้องโอน', '应付')} ¥ {money(total - deposits)}</span>
        </div>
      </Card>
    </Page>
  );
}

export function BillDoc({ k }: { k: any }) {
  const t = useT();
  const { lang } = useLang();
  return (
    <div className="doc">
      <div className="doc-head">
        <div><h2>{t('Supplier bill', 'บิลโอนเงิน', '划款单')} {k.code}</h2>
          <div>{t('Customer', 'ลูกค้า', '客户')}: <b>{k.customer_code}</b> · {t('Date', 'วันที่', '日期')}: {k.date}</div></div>
        <div style={{ textAlign: 'right' }}>{k.supplier_bank}<br />{k.supplier_account}<br />{k.supplier_number}</div>
      </div>
      <table>
        <thead><tr><th>{t('Order', 'ออเดอร์', '订单')}</th><th>{t('Product', 'รหัสสินค้า', '款号')}</th><th>{t('Category', 'ประเภท', '分类')}</th><th>{t('Qty', 'จำนวน', '数量')}</th><th>{t('Price', 'ราคา', '单价')}</th><th>{t('Total', 'รวม', '总价')}</th><th>{t('Deposit', 'มัดจำ', '定金')}</th><th>{t('Deduct', 'หัก', '扣除')}</th></tr></thead>
        <tbody>{k.items.map((i: any) => <tr key={i.id}><td>{i.order_no || `#${i.order_id}`}</td><td>{i.product_id}</td><td>{pick({ th: i.style_th, zh: i.style_zh }, lang)}</td><td>{i.quantity}</td><td>{money(i.unit_price)}</td><td>{money(i.quantity * i.unit_price)}</td><td>{money(i.deposit)}</td><td>{money(i.deductions)}</td></tr>)}</tbody>
      </table>
      <div className="total-line"><span>{t('Total', 'รวม', '总价')} ¥{money(k.total)}</span><span>{t('Deposit', 'มัดจำ', '定金')} ¥{money(k.deposit)}</span><span>{t('Deductions', 'หัก', '扣除')} ¥{money(k.deductions)}</span><span>{t('To pay', 'ยอดที่ต้องโอน', '应付')} ¥{money(k.due)}</span></div>
    </div>
  );
}

export function PackageView() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const can = useCan();
  const { data: k, reload } = useApi<any>(`/packages/${id}`);
  const [print, setPrint] = useState(false);
  const [ded, setDed] = useState<any>(null);
  const { run } = useAction();
  const { ask } = useAsk();
  if (!k) return null;
  const del = async () => {
    if (!(await ask(t('Delete this bill?', 'แน่ใจหรือเปล่าว่าต้องการลบออก?', '你确定要删除吗?'), { danger: true }))) return;
    if (await run(() => api(`/packages/${k.id}`, { method: 'DELETE' }), t('Deleted', 'ลบแล้ว', '已删除'))) nav('/packages');
  };
  return (
    <Page back="/orders?tab=bills" title={<>{t('Bill', 'บิล', '划款单')} {k.code} {k.is_done_paid ? <Badge tone="good">{t('Paid', 'จ่ายแล้ว', '已付')}</Badge> : <Badge tone="warn">{t('Unpaid', 'ยังไม่จ่าย', '未付')}</Badge>}</>}
      actions={<>
        <button onClick={() => setPrint(true)}><Printer size={16} aria-hidden /> {t('Print', 'ปริ้น', '打印')}</button>
        {!k.payments.length && <button onClick={() => nav(`/packages/${k.id}/edit`)}>{t('Edit', 'แก้ไข', '修改')}</button>}
        {!k.payments.length && <button className="danger" onClick={del}>{t('Delete', 'ลบ', '删除')}</button>}
        {can.menu('invoice.payment') && !k.is_done_paid && <button className="primary" onClick={() => nav(`/invoice-payments/new?bill=${k.code}`)}>{t('Pay this bill', 'จ่ายบิลนี้', '付款')}</button>}
      </>}>
      <div className="stats">
        <div className="stat"><div className="stat-label">{t('Customer', 'ลูกค้า', '客户')}</div><div className="stat-value">{k.customer_code}</div></div>
        <div className="stat"><div className="stat-label">{t('To pay ¥', 'ยอดที่ต้องโอน', '应付')}</div><div className="stat-value">{money(k.due)}</div></div>
        <div className="stat"><div className="stat-label">{t('Paid ¥', 'จ่ายแล้ว', '已付')}</div><div className="stat-value">{money(k.paid)}</div></div>
        <div className={`stat ${k.remaining > 0 ? 'warn' : 'good'}`}><div className="stat-label">{t('Left ¥', 'คงเหลือ', '余额')}</div><div className="stat-value">{money(k.remaining)}</div></div>
        <div className={`stat ${k.customer_balance_cny < 0 ? 'bad' : ''}`}><div className="stat-label">{t('Customer CNY balance', 'Balance เงินจีน', '客户人民币余额')}</div><div className="stat-value">{money(k.customer_balance_cny)}</div></div>
      </div>
      <Card title={`${k.supplier_bank || t('No supplier bank', 'ยังไม่ระบุบัญชีร้าน', '未指定银行')} ${k.supplier_account || ''} ${k.supplier_number || ''}`}>
        <Table rows={k.items} columns={[
          { key: 'order_id', label: t('Order no.', 'เลขออเดอร์', '订单号'), render: (r) => <Link to={`/orders?id=${r.order_id}`}>{r.order_no || `#${r.order_id}`}</Link> },
          { key: 'product_id', label: t('Product id', 'รหัสสินค้า', '款号') },
          { key: 'receive_date', label: t('Received', 'รับของ', '收货') },
          { key: 'quantity', label: t('Qty', 'จำนวน', '数量'), align: 'right' },
          { key: 'unit_price', label: t('Price ¥', 'ราคา', '单价'), money: true },
          { key: 'tot', label: t('Total ¥', 'รวม', '总价'), money: true, render: (r) => money(r.quantity * r.unit_price) },
          { key: 'deposit', label: t('Deposit', 'มัดจำ', '定金'), money: true },
          { key: 'deductions', label: t('Deducted', 'หัก', '扣除'), money: true },
          { key: 'd', label: '', render: (r) => <button className="link" onClick={() => setDed({ package_item_id: r.id, type: 'deduct', amount: '', description: '' })}>{t('Deduct / note', 'หักอื่นๆ', '其他扣除')}</button> },
        ]} />
      </Card>
      <div className="split">
        <Card title={t('Deductions', 'รายการหัก', '其他扣除')}>
          <Table rows={k.statements} columns={[
            { key: 'product_id', label: t('Product', 'สินค้า', '产品') }, { key: 'type', label: t('Type', 'ประเภท', '类别') },
            { key: 'amount', label: '¥', money: true, sum: true }, { key: 'description', label: t('Note', 'หมายเหตุ', '备注') },
            { key: 'x', label: '', render: (r) => <button className="link danger" onClick={async () => { if (await run(() => api(`/package-statements/${r.id}`, { method: 'DELETE' }))) reload(); }}><X size={16} aria-hidden /><span className="sr-only">Remove</span></button> },
          ]} />
        </Card>
        <Card title={t('Payments', 'การจ่ายเงิน', '付款')}>
          <Table rows={k.payments} columns={[
            { key: 'date', label: t('Date', 'วันที่', '日期') }, { key: 'bank', label: t('From account', 'จากบัญชี', '从帐户') },
            { key: 'amount', label: '¥', money: true, sum: true }, { key: 'bank_fee', label: t('Bank fee', 'ค่าธรรมเนียม', '手续费'), money: true },
            { key: 'service_fee', label: t('Service fee', 'ค่าบริการ', '服务费'), money: true }, { key: 'created_by', label: t('By', 'โดย', '人') },
          ]} />
        </Card>
      </div>
      {ded && (
        <Modal open title={t('Deduct from line', 'หักอื่นๆ', '其他扣除')} onClose={() => setDed(null)}
          footer={<button className="primary" onClick={async () => { if (await run(() => api(`/package-items/${ded.package_item_id}/statements`, { body: ded }))) { setDed(null); reload(); } }}>{t('Save', 'บันทึก', '保存')}</button>}>
          <Grid cols={2}>
            <Field label={t('Type', 'ประเภท', '类别')}>
              <select value={ded.type} onChange={(e) => setDed({ ...ded, type: e.target.value })}>
                <option value="deduct">{t('Deduct', 'หักอื่นๆ', '其他扣除')}</option>
                <option value="refund">{t('Shop refund', 'ร้านจีนคืนเงินมา', '卖家退款')}</option>
                <option value="missing">{t('Missing goods', 'ของขาด', '缺货')}</option>
              </select>
            </Field>
            <Field label={t('Amount ¥', 'ยอด', '总额')}><input type="number" step="any" value={ded.amount} onChange={(e) => setDed({ ...ded, amount: e.target.value })} /></Field>
            <Field label={t('Note', 'หมายเหตุ', '备注')} wide><input value={ded.description} onChange={(e) => setDed({ ...ded, description: e.target.value })} /></Field>
          </Grid>
        </Modal>
      )}
      <PrintModal open={print} onClose={() => setPrint(false)} title={t('Print bill', 'ปริ้นบิล', '打印')}><BillDoc k={k} /></PrintModal>
    </Page>
  );
}

/** Supplier bill list, shown as the second tab of the Orders screen. */
export function BillList({ search, onSearch }: { search: string; onSearch: (v: string) => void }) {
  const t = useT();
  const nav = useNavigate();
  const [q, setQ] = useState<any>({ from: monthStart(), to: '', paid: '' });
  const { data } = useApi<any[]>('/packages', { ...q, search, from: search ? '' : q.from, to: search ? '' : q.to });
  return (
    <>
      <Card>
        <Grid cols={5}>
          <SearchBox value={search} onChange={onSearch} />
          <Field label={t('Customer', 'ลูกค้า', '客户')}><CustomerPick value={q.customer_id} onChange={(v) => setQ({ ...q, customer_id: v })} /></Field>
          <DateRange from={search ? '' : q.from} to={search ? '' : q.to} onChange={(from, to) => setQ({ ...q, from, to })} />
          <Field label={t('Paid?', 'สถานะ', '状态')}>
            <select value={q.paid} onChange={(e) => setQ({ ...q, paid: e.target.value })}>
              <option value="">{t('All', 'ทั้งหมด', '全部')}</option><option value="0">{t('Unpaid', 'ยังไม่จ่าย', '未付')}</option><option value="1">{t('Paid', 'จ่ายแล้ว', '已付')}</option>
            </select>
          </Field>
        </Grid>
      </Card>
      <Table rows={data} onRow={(r) => nav(`/packages/${r.id}`)} columns={[
        { key: 'code', label: t('Bill', 'บิล', '划款单') },
        { key: 'date', label: t('Date', 'วันที่', '日期') },
        { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') },
        { key: 'order_nos', label: t('Order no.', 'เลขออเดอร์', '订单号'), render: (r) => <span className="clip">{r.order_nos || ''}</span> },
        { key: 'supplier_account', label: t('Shop account', 'บัญชีร้าน', '卖家') },
        { key: 'total', label: t('Total ¥', 'รวม', '总价'), money: true, sum: true },
        { key: 'deposit', label: t('Deposit', 'มัดจำ', '定金'), money: true },
        { key: 'due', label: t('To pay', 'ยอดที่ต้องโอน', '应付'), money: true, sum: true },
        { key: 'paid', label: t('Paid', 'จ่ายแล้ว', '已付'), money: true, sum: true },
        { key: 'remaining', label: t('Left', 'คงเหลือ', '余额'), money: true, sum: true },
        { key: 'st', label: '', render: (r) => r.is_done_paid ? <Badge tone="good">{t('Paid', 'จ่ายแล้ว', '已付')}</Badge> : <Badge tone="warn">{t('Unpaid', 'ยังไม่จ่าย', '未付')}</Badge> },
        { key: 'created_by', label: t('By', 'โดย', '人') },
      ]} />
    </>
  );
}
