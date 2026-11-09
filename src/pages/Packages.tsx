import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, useApi, useApp, useCan, useLang, useT, money, pick, today, monthStart } from '../lib';
import { Page, Card, Grid, Field, Table, CustomerPick, DateRange, Badge, Modal, PrintModal, Combo, useAction, useAsk, Bi } from '../ui';
import { Pencil, Printer, Plus, X } from 'lucide-react';
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
      {value && <button type="button" onClick={() => setAdd({ ...lookups.supplierBanks.find((b) => b.id === Number(value)) })}><Pencil size={16} aria-hidden /><span className="sr-only">{t('Edit supplier bank', 'แก้ไขบัญชีร้านค้า', '修改卖家银行')}</span></button>}
      <button type="button" onClick={() => setAdd({ bank: 'ICBC 工行' })}>+</button>
      {add && (
        <Modal open title={add.id ? t('Edit supplier bank', 'แก้ไขบัญชีร้านค้า', '修改卖家银行') : t('Add supplier bank', 'เพิ่มบัญชีร้านค้า', '新增卖家银行')} onClose={() => setAdd(null)}
          footer={<button className="primary" onClick={async () => {
            const r = await run(() => (add.id ? api(`/r/supplier_banks/${add.id}`, { method: 'PUT', body: add }) : api('/r/supplier_banks', { body: add })));
            if (r) { await reloadLookups(); onChange(add.id || (r as any).id); setAdd(null); }
          }}>{t('Save', 'บันทึก', '保存')}</button>}>
          <Grid cols={2}>
            <Field label={t('Bank', 'ธนาคาร', '银行')}>
              <select value={add.bank} onChange={(e) => setAdd({ ...add, bank: e.target.value })}>
                {[...new Set([add.bank, 'ICBC 工行', 'ABC 农行', 'CCB 建行', 'BOC 中行', 'Alipay 支付宝', 'WeChat 微信', 'Other 其他'])].map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label={t('Branch', 'สาขาธนาคาร', '支行')}><input value={add.branch || ''} onChange={(e) => setAdd({ ...add, branch: e.target.value })} /></Field>
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
      const open = o.complete ? [] : o.items.filter((i: any) => i.quantity - i.received_qty > 0);
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
    // A new bill opens with its print view ready.
    if (r) nav(id ? `/packages/${id}` : `/packages/${r.id}?printed=new`);
  };
  return (
    <Page back={id ? `/packages/${id}` : '/orders?tab=bills'} title={id ? `${t('Bill', 'บิล', '划款单')} ${h.code}` : t('New supplier bill / receive goods', 'เปิดบิลโอนใหม่ / รับของ', '开划款单 / 收货')}
      actions={<button className="primary" disabled={busy || !lines.length} onClick={save}>{t('Save bill', 'บันทึก', '保存')}</button>}>
      {prefilled?.complete && (
        <div className="note warn"><Bi>
          {t(`Order ${prefilled.order_no || '#' + prefilled.id} is complete (everything received), so it can't get a new bill.`,
            `ออเดอร์ ${prefilled.order_no || '#' + prefilled.id} ครบแล้ว (รับของครบทุกรายการ) เปิดบิลโอนเพิ่มไม่ได้`,
            `订单 ${prefilled.order_no || '#' + prefilled.id} 已完成（全部收到），不能再开划款单。`)}
        </Bi></div>
      )}
      {prefilled && !prefilled.complete && (
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

/** Printed supplier bill, laid out like the paper 货运单 the shops use: title, customer / bill no., lines, bank + totals, signatures. */
export function BillDoc({ k }: { k: any }) {
  const t = useT();
  const { lookups } = useApp();
  const shops = [...new Set(k.items.map((i: any) => i.supplier_name).filter(Boolean))].join(', ');
  const qty = k.items.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);
  const L = (_en: string, th: string, zh: string) => <span className="bd-l">{zh}<small>{th}</small></span>;
  return (
    <div className="doc bill-doc">
      <header className="bd-title">
        <div className="bd-company">{lookups.settings.print_text || 'JJ Cargo'}</div>
        <div className="bd-kind">划款单 <span>บิลโอนเงิน</span></div>
      </header>
      <div className="bd-head">
        <dl>
          <div><dt>{L('Customer', 'ลูกค้า', '客户')}</dt><dd><b className="bd-cust">{k.customer_code}</b></dd></div>
          {shops && <div><dt>{L('Shop', 'ร้านค้า', '档口')}</dt><dd>{shops}</dd></div>}
        </dl>
        <dl className="bd-right">
          <div><dt>{L('No.', 'เลขที่', '单号')}</dt><dd><b>{k.code}</b></dd></div>
          <div><dt>{L('Date', 'วันที่', '时间')}</dt><dd>{k.date}</dd></div>
        </dl>
      </div>
      <table className="bd-lines">
        <thead><tr>
          <th>{L('Received', 'วันที่รับ', '收货')}</th><th>{L('Order no.', 'เลขออเดอร์', '订单单号')}</th><th>{L('Product', 'รหัสสินค้า', '款号')}</th>
          <th className="num">{L('Qty', 'จำนวน', '数量')}</th><th className="num">{L('Price', 'ราคา', '单价')}</th><th className="num">{L('Amount', 'รวม', '总额')}</th>
        </tr></thead>
        <tbody>{k.items.map((i: any) => (
          <tr key={i.id}><td>{i.receive_date || k.date}</td><td>{i.order_no || `#${i.order_id}`}</td><td>{i.product_id || '-'}</td>
            <td className="num">{money(i.quantity)}</td><td className="num">{money(i.unit_price, 3)}</td><td className="num">{money(i.quantity * i.unit_price)}</td></tr>
        ))}</tbody>
        <tfoot><tr><td colSpan={3}>{L('Total qty', 'รวมจำนวน', '合计数量')}</td><td className="num">{money(qty)}</td><td /><td className="num">{money(k.total)}</td></tr></tfoot>
      </table>
      <div className="bd-bottom">
        <ol className="bd-bank">
          <li><span>{L('Bank', 'ธนาคาร', '开户银行')}</span><b>{k.supplier_bank || '-'}</b></li>
          <li><span>{L('Account name', 'ชื่อบัญชี', '开户人')}</span><b>{k.supplier_account || '-'}</b></li>
          <li><span>{L('Account / card no.', 'เลขบัญชี', '账户/卡号')}</span><b className="mono">{k.supplier_number || '-'}</b></li>
          <li><span>{L('Branch', 'สาขาธนาคาร', '支行')}</span><b>{k.supplier_branch || '-'}</b></li>
          <li><span>{L('Phone', 'เบอร์โทร', '电话')}</span><b>{k.supplier_tel || '-'}</b></li>
        </ol>
        <dl className="bd-totals">
          <div><dt>{L('Total', 'รวม', '共计')}</dt><dd>{money(k.total)}</dd></div>
          <div><dt>{L('Deposit', 'มัดจำ', '预付定金')}</dt><dd>{money(k.deposit)}</dd></div>
          {Number(k.deductions) ? <div><dt>{L('Deductions', 'หัก', '扣除')}</dt><dd>{money(k.deductions)}</dd></div> : null}
          <div className="bd-due"><dt>{L('To pay', 'ยอดที่ต้องโอน', '余额')}</dt><dd>¥ {money(k.due)}</dd></div>
        </dl>
      </div>
      <p className="bd-note">** 本公司只代客户收货，概不负责货款 <span>บริษัทเป็นตัวแทนลูกค้าในการรับสินค้าเท่านั้น ไม่มีส่วนรับผิดชอบเรื่องการชำระเงิน</span></p>
      <footer className="bd-foot">
        <div>{lookups.settings.print_phone && <>{L('Phone', 'โทร', '电话')} <b>{lookups.settings.print_phone}</b></>}</div>
        <div className="bd-sign"><span>{L('Supplier signature', 'ลายเซ็นร้านค้า', '供应商代表签名')}</span><i /></div>
        <div className="bd-sign"><span>{L('Handled by', 'ผู้ทำรายการ', '经手人')}</span><b>{k.created_by || ''}</b></div>
      </footer>
    </div>
  );
}

export function PackageView() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const can = useCan();
  const { data: k, reload } = useApi<any>(`/packages/${id}`);
  const [sp, setSp] = useSearchParams();
  const [print, setPrint] = useState(sp.get('printed') === 'new'); // just saved: open the print view straight away
  const closePrint = () => { setPrint(false); if (sp.has('printed')) setSp({}, { replace: true }); };
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
      <PrintModal open={print} onClose={closePrint} title={t('Print bill', 'ปริ้นบิล', '打印')}><BillDoc k={k} /></PrintModal>
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
