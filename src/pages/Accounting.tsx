import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, useApi, useApp, useCan, useT, money, today, monthStart } from '../lib';
import { Page, Card, Grid, Field, Table, CustomerPick, BankPick, DateRange, CheckedFilter, Badge, Modal, Stat, Tabs, useAction } from '../ui';
import { CrudPage } from './Crud';

/** DepositWithdrawChinaForm / DepositWithdrawThaiForm */
export function Transfers() {
  const t = useT();
  const { region = 'CN' } = useParams();
  const can = useCan();
  const cn = region === 'CN';
  const [q, setQ] = useState<any>({ from: monthStart(), to: '', checked: '' });
  const { data, reload } = useApi<any[]>(`/transfers/${region}`, q);
  const [edit, setEdit] = useState<any>(null);
  const [sel, setSel] = useState<Set<any>>(new Set());
  const [bal, setBal] = useState<number | null>(null);
  const { run, busy } = useAction();
  useEffect(() => { setSel(new Set()); }, [region]);
  useEffect(() => {
    if (edit?.customer_id) api(`/customers/${edit.customer_id}`).then((c) => setBal(cn ? c.balance_cny : c.balance_thb)); else setBal(null);
  }, [edit?.customer_id, cn]);
  const save = async () => {
    const body = { ...edit, income: edit.kind === 'in' ? edit.amount : 0, expense: edit.kind === 'out' ? edit.amount : 0 };
    if (await run(() => (edit.id ? api(`/transfers/${region}/${edit.id}`, { method: 'PUT', body }) : api(`/transfers/${region}`, { body })))) { setEdit(null); reload(); }
  };
  const cur = cn ? '¥' : '฿';
  return (
    <Page title={cn ? t('Customer deposit / withdraw in China', 'ลูกค้าฝากเงิน-ถอนเงิน กวางโจว', '客户在中国 存款 - 提款') : t('Customer deposit / withdraw in Thailand', 'ลูกค้าฝาก-ถอนเงินเมืองไทย', '客户在泰国 存款 - 提款')}
      actions={<>{can.verify('transfer') && <button disabled={!sel.size} onClick={async () => { if (await run(() => api(`/transfers/${region}/check`, { body: { ids: [...sel] } }))) { setSel(new Set()); reload(); } }}>✓ {t('Check selected', 'ตรวจแล้ว', '校验')} ({sel.size})</button>}
        <button className="primary" onClick={() => setEdit({ date: today(), kind: 'in', amount: '', bank_fee: 0, service_fee: 0 })}>+ {t('Add', 'เพิ่ม', '新增')}</button></>}>
      <Card>
        <Grid cols={5}>
          <Field label={t('Customer', 'ลูกค้า', '客户')}><CustomerPick value={q.customer_id} onChange={(v) => setQ({ ...q, customer_id: v })} /></Field>
          <DateRange from={q.from} to={q.to} onChange={(from, to) => setQ({ ...q, from, to })} />
          <CheckedFilter value={q.checked} onChange={(v) => setQ({ ...q, checked: v })} />
        </Grid>
      </Card>
      <Table rows={data} onRow={(r) => !r.checked && setEdit({ ...r, kind: r.income ? 'in' : 'out', amount: r.income || r.expense })}
        selectable={(r) => !r.checked} selected={sel} onSelect={setSel} columns={[
          { key: 'date', label: t('Date', 'วันที่', '日期') },
          { key: 'customer_code', label: 'CODE' },
          { key: 'ref_code', label: t('Ref', 'อ้างอิง', '参考') },
          { key: 'income', label: `${t('Deposit', 'ฝาก', '存款')} ${cur}`, money: true, sum: true },
          { key: 'expense', label: `${t('Withdraw', 'ถอน', '提款')} ${cur}`, money: true, sum: true },
          { key: 'bank_fee', label: t('Bank fee', 'ค่าธรรมเนียม', '手续费'), money: true, sum: true },
          { key: 'service_fee', label: t('Service fee', 'ค่าบริการ', '服务费'), money: true, sum: true },
          { key: 'bank', label: t('Account', 'บัญชี', '帐户') },
          { key: 'remark', label: t('Remark', 'หมายเหตุ', '备注') },
          { key: 'checked', label: t('Checked', 'ตรวจ', '校验'), render: (r) => r.checked ? <Badge tone="good">✓ {r.checked_by}</Badge> : <Badge tone="warn">—</Badge> },
          { key: 'x', label: '', render: (r) => !r.checked && <button className="link danger" onClick={async (e) => { e.stopPropagation(); if (confirm('?') && await run(() => api(`/transfers/${region}/${r.id}`, { method: 'DELETE' }))) reload(); }}>{t('Delete', 'ลบ', '删除')}</button> },
        ]} />
      {edit && (
        <Modal open title={cn ? t('China deposit / withdraw', 'ฝาก-ถอนเงิน กวางโจว', '中国 存款 - 提款') : t('Thai deposit / withdraw', 'ฝาก-ถอนเงิน เมืองไทย', '泰国 存款 - 提款')} onClose={() => setEdit(null)}
          footer={<button className="primary" disabled={busy} onClick={save}>{t('Save', 'บันทึก', '保存')}</button>}>
          <Grid cols={2}>
            <Field label={t('Customer', 'ลูกค้า', '客户')} hint={bal !== null ? `${t('Balance', 'ยอดใช้ได้', '余额')}: ${cur}${money(bal)}` : undefined}><CustomerPick value={edit.customer_id} onChange={(v) => setEdit({ ...edit, customer_id: v })} placeholder="—" /></Field>
            <Field label={t('Date', 'วันที่', '日期')}><input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label={t('Type', 'ประเภท', '类别')}>
              <div className="radios">
                <label><input type="radio" checked={edit.kind === 'in'} onChange={() => setEdit({ ...edit, kind: 'in' })} /> {cn ? '中国来钱 ' : ''}{t('Deposit', 'ฝากเงิน', '存款')}</label>
                <label><input type="radio" checked={edit.kind === 'out'} onChange={() => setEdit({ ...edit, kind: 'out' })} /> {cn ? '中国拿钱 ' : ''}{t('Withdraw', 'ถอนเงิน', '提款')}</label>
              </div>
            </Field>
            <Field label={`${t('Amount', 'ยอดเงิน', '总额')} ${cur}`}><input type="number" step="any" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field>
            <Field label={t('Company account / cash', 'บัญชี', '帐户')}><BankPick value={edit.bank_id} onChange={(v) => setEdit({ ...edit, bank_id: v })} thai={!cn} /></Field>
            <Field label={t('Reference', 'อ้างอิง', '参考')}><input value={edit.ref_code || ''} onChange={(e) => setEdit({ ...edit, ref_code: e.target.value })} /></Field>
            <Field label={t('Bank fee (company pays)', 'ค่าธรรมเนียมธนาคาร', '手续费')}><input type="number" step="any" value={edit.bank_fee} onChange={(e) => setEdit({ ...edit, bank_fee: e.target.value })} /></Field>
            <Field label={t('Service fee (customer pays)', 'ค่าบริการ', '服务费')}><input type="number" step="any" value={edit.service_fee} onChange={(e) => setEdit({ ...edit, service_fee: e.target.value })} /></Field>
            <Field label={t('Remark', 'หมายเหตุ', '备注')} wide><input value={edit.remark || ''} onChange={(e) => setEdit({ ...edit, remark: e.target.value })} /></Field>
          </Grid>
        </Modal>
      )}
    </Page>
  );
}

/** DailyExpenseForm (Thai) / ChinaExpenseForm — with summary by type. */
export function Expenses() {
  const t = useT();
  const { region = 'TH' } = useParams();
  const { lookups } = useApp();
  const thai = region === 'TH';
  const [tab, setTab] = useState('list');
  const [r, setR] = useState({ from: monthStart(), to: today() });
  const report = useApi<any[]>(tab === 'sum' ? '/r/daily_expenses' : null, { ...r, is_thai: thai ? 1 : 0 });
  const byType = useMemo(() => {
    const m: Record<string, { type: string; count: number; amount: number; bank_fee: number }> = {};
    for (const x of report.data || []) {
      const k = x.type || '—';
      m[k] ||= { type: k, count: 0, amount: 0, bank_fee: 0 };
      m[k].count++; m[k].amount += x.amount; m[k].bank_fee += x.bank_fee || 0;
    }
    return Object.values(m);
  }, [report.data]);
  const types = lookups.expenseTypes.filter((e) => !!e.is_thai === thai).map((e) => ({ value: e.id, label: e.description }));
  const title = thai ? t('Thai expenses (THB)', 'ค่าใช้จ่ายเมืองไทย (หน่วย : บาท)', '泰国费用') : t('China expenses (CNY)', 'ค่าใช้จ่ายเมืองจีน (หน่วย : หยวน)', '中国费用');
  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'list', label: t('Expenses', 'รายการ', '列表') }, { key: 'sum', label: t('Summary by type', 'สรุปรายงานค่าใช้จ่าย', '报告') }, { key: 'types', label: t('Expense types', 'ประเภทค่าใช้จ่าย', '成本类型') }]} />
      </div>
      {tab === 'list' && (
        <CrudPage key={region} resource="daily_expenses" title={title} dateFilter checkKey="expense" fixed={{ is_thai: thai ? 1 : 0 }}
          filters={[{ key: 'type_id', label: t('Type', 'ประเภท', '类别'), type: 'select', options: types }, { key: 'bank_id', label: t('Account', 'บัญชี', '帐户'), type: thai ? 'bankThai' : 'bankChina' }]}
          fields={[
            { key: 'date', label: t('Date', 'วันที่', '日期'), type: 'date', required: true, default: today() },
            { key: 'type_id', label: t('Type', 'ประเภท', '类别'), type: 'select', options: types },
            { key: 'amount', label: t('Amount', 'ยอดเงิน', '总额'), type: 'number', required: true },
            { key: 'bank_fee', label: t('Bank fee', 'ค่าธรรมเนียม', '手续费'), type: 'number', default: 0 },
            { key: 'bank_id', label: t('Paid from', 'จ่ายจากบัญชี', '从帐户'), type: thai ? 'bankThai' : 'bankChina' },
            { key: 'remark', label: t('Remark', 'หมายเหตุ', '备注'), wide: true },
          ]}
          columns={[
            { key: 'date', label: t('Date', 'วันที่', '日期') }, { key: 'type', label: t('Type', 'ประเภท', '类别') },
            { key: 'amount', label: t('Amount', 'ยอด', '总额'), money: true, sum: true }, { key: 'bank_fee', label: t('Fee', 'ค่าธรรมเนียม', '手续费'), money: true, sum: true },
            { key: 'bank', label: t('Account', 'บัญชี', '帐户') }, { key: 'remark', label: t('Remark', 'หมายเหตุ', '备注') }, { key: 'created_by', label: t('By', 'โดย', '人') },
          ]} />
      )}
      {tab === 'sum' && (
        <Page title={title}>
          <Card><Grid cols={4}><DateRange from={r.from} to={r.to} onChange={(from, to) => setR({ from, to })} /></Grid></Card>
          <Table rowKey="type" rows={byType} columns={[
            { key: 'type', label: t('Type', 'ประเภท', '类别') }, { key: 'count', label: t('Items', 'รายการ', '数量'), align: 'right', sum: true },
            { key: 'amount', label: t('Amount', 'ยอด', '总额'), money: true, sum: true }, { key: 'bank_fee', label: t('Fees', 'ค่าธรรมเนียม', '手续费'), money: true, sum: true },
          ]} />
        </Page>
      )}
      {tab === 'types' && (
        <CrudPage key={`t${region}`} resource="expense_types" title={t('Expense types', 'ประเภทค่าใช้จ่าย', '成本类型')} fixed={{ is_thai: thai ? 1 : 0 }}
          fields={[{ key: 'description', label: t('Name', 'ชื่อ', '名称'), required: true }]}
          columns={[{ key: 'description', label: t('Name', 'ชื่อ', '名称') }]} />
      )}
    </>
  );
}

export function OtherIncome() {
  const t = useT();
  return (
    <CrudPage resource="other_incomes" title={t('Other income', 'รายรับอื่นๆ', '其他收入')} dateFilter checkKey="other_income"
      fields={[
        { key: 'date', label: t('Date', 'วันที่', '日期'), type: 'date', required: true, default: today() },
        { key: 'amount', label: t('Amount', 'ยอดเงิน', '总额'), type: 'number', required: true },
        { key: 'bank_id', label: t('Into account', 'เข้าบัญชี', '到帐户'), type: 'bank' },
        { key: 'remark', label: t('Remark', 'หมายเหตุ', '备注'), wide: true },
      ]}
      columns={[
        { key: 'date', label: t('Date', 'วันที่', '日期') }, { key: 'amount', label: t('Amount', 'ยอด', '总额'), money: true, sum: true },
        { key: 'bank', label: t('Account', 'บัญชี', '帐户') }, { key: 'remark', label: t('Remark', 'หมายเหตุ', '备注') }, { key: 'created_by', label: t('By', 'โดย', '人') },
      ]} />
  );
}

/** ExchageRateForm — daily rate list + company exchange batches (THB paid out, CNY received). */
export function Exchange() {
  const t = useT();
  const can = useCan();
  const { reloadLookups } = useApp();
  const [tab, setTab] = useState('batches');
  const [q, setQ] = useState<any>({ from: '', to: '', checked: '' });
  const list = useApi<any[]>('/exchanges', q);
  const [cur, setCur] = useState<number | null>(null);
  const detail = useApi<any>(cur ? `/exchanges/${cur}` : null);
  const [nb, setNb] = useState<any>({ date: today(), rate: '', yuan_amount: '' });
  const [item, setItem] = useState<any>(null);
  const [sel, setSel] = useState<Set<any>>(new Set());
  const { run } = useAction();
  const refresh = () => { list.reload(); detail.reload(); };
  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'batches', label: t('Exchanges', 'รายการแลกเงิน', '换钱') }, { key: 'rates', label: t('Daily rate', 'อัตราแลกเปลี่ยนต่อวัน', '每日汇率') }]} />
      </div>
      {tab === 'rates' && (
        <CrudPage resource="exchange_rates" title={t('Daily exchange rate (THB per 1 CNY)', 'อัตราแลกเปลี่ยนต่อวัน', '每日汇率')} dateFilter onChanged={reloadLookups}
          fields={[{ key: 'date', label: t('Date', 'วันที่', '日期'), type: 'date', required: true, default: today() }, { key: 'rate', label: t('Rate', 'เรท', '汇率'), type: 'number', required: true }]}
          columns={[{ key: 'date', label: t('Date', 'วันที่', '日期') }, { key: 'rate', label: t('Rate', 'เรท', '汇率'), align: 'right' }]} />
      )}
      {tab === 'batches' && (
        <Page title={t('Currency exchange', 'การแลกเปลี่ยนเงิน', '换钱')}
          actions={can.verify('exchange') && <button disabled={!sel.size} onClick={async () => { if (await run(() => api('/exchanges/check', { body: { ids: [...sel] } }))) { setSel(new Set()); refresh(); } }}>✓ {t('Check', 'ตรวจแล้ว', '校验')} ({sel.size})</button>}>
          <Card title={t('New exchange', 'แลกเงินไทย->เป็นเงินจีน', '新换钱')}>
            <Grid cols={4}>
              <Field label={t('Date', 'วันที่', '日期')}><input type="date" value={nb.date} onChange={(e) => setNb({ ...nb, date: e.target.value })} /></Field>
              <Field label={t('Rate THB / CNY', 'เรท', '汇率')}><input type="number" step="any" value={nb.rate} onChange={(e) => setNb({ ...nb, rate: e.target.value })} /></Field>
              <Field label={t('Yuan amount', 'ยอดหยวน', '人民币')} hint={nb.rate && nb.yuan_amount ? `= ฿${money(nb.rate * nb.yuan_amount)}` : undefined}><input type="number" step="any" value={nb.yuan_amount} onChange={(e) => setNb({ ...nb, yuan_amount: e.target.value })} /></Field>
              <Field label=" "><button className="primary" onClick={async () => { const r: any = await run(() => api('/exchanges', { body: nb })); if (r) { setNb({ ...nb, rate: '', yuan_amount: '' }); setCur(r.id); refresh(); } }}>+ {t('Add', 'เพิ่ม', '新增')}</button></Field>
            </Grid>
          </Card>
          <Card><Grid cols={4}><DateRange from={q.from} to={q.to} onChange={(from, to) => setQ({ ...q, from, to })} /><CheckedFilter value={q.checked} onChange={(v) => setQ({ ...q, checked: v })} /></Grid></Card>
          <div className="split">
            <Table rows={list.data} onRow={(r) => setCur(r.id)} rowClass={(r) => (r.id === cur ? 'on' : '')} selectable={(r) => !r.checked} selected={sel} onSelect={setSel} columns={[
              { key: 'date', label: t('Date', 'วันที่', '日期') }, { key: 'rate', label: t('Rate', 'เรท', '汇率'), align: 'right' },
              { key: 'yuan_amount', label: '¥', money: true, sum: true }, { key: 'baht_amount', label: '฿', money: true, sum: true },
              { key: 'st', label: t('Status', 'สถานะ', '状态'), render: (r) => r.checked ? <Badge tone="good">✓ {r.checked_by}</Badge> : r.complete ? <Badge tone="info">{t('Complete', 'ครบแล้ว', '完成')}</Badge> : <Badge tone="warn">{money(r.paid_thb)} / {money(r.got_cny)}</Badge> },
            ]} />
            {detail.data && (
              <Card title={`${detail.data.date} · ¥${money(detail.data.yuan_amount)} @ ${detail.data.rate}`}
                actions={!detail.data.checked && <>
                  <button onClick={() => setItem({ is_thai: 1, date: today(), amount: '', bank_fee: 0 })}>+ {t('Baht paid', 'เพิ่มเงินไทย', '泰铢')}</button>
                  <button onClick={() => setItem({ is_thai: 0, date: today(), amount: '', bank_fee: 0 })}>+ {t('Yuan received', 'เพิ่มเงินจีน', '人民币')}</button>
                  <button className="danger" onClick={async () => { if (confirm('?') && await run(() => api(`/exchanges/${cur}`, { method: 'DELETE' }))) { setCur(null); list.reload(); } }}>{t('Delete', 'ลบ', '删除')}</button></>}>
                <Table rows={detail.data.items} columns={[
                  { key: 'is_thai', label: '', render: (r) => r.is_thai ? '฿ ' + t('out', 'ออก', '出') : '¥ ' + t('in', 'เข้า', '入') },
                  { key: 'date', label: t('Date', 'วันที่', '日期') }, { key: 'bank', label: t('Account', 'บัญชี', '帐户') },
                  { key: 'amount', label: t('Amount', 'ยอด', '总额'), money: true }, { key: 'bank_fee', label: t('Fee', 'ค่าธรรมเนียม', '手续费'), money: true },
                  { key: 'x', label: '', render: (r) => !detail.data.checked && <button className="link danger" onClick={async () => { if (await run(() => api(`/exchange-items/${r.id}`, { method: 'DELETE' }))) refresh(); }}>×</button> },
                ]} />
              </Card>
            )}
          </div>
          {item && (
            <Modal open title={item.is_thai ? t('Baht paid out', 'จ่ายเงินไทย', '泰铢付出') : t('Yuan received', 'ได้รับเงินหยวน', '收到人民币')} onClose={() => setItem(null)}
              footer={<button className="primary" onClick={async () => { if (await run(() => api(`/exchanges/${cur}/items`, { body: item }))) { setItem(null); refresh(); } }}>{t('Save', 'บันทึก', '保存')}</button>}>
              <Grid cols={2}>
                <Field label={t('Account', 'บัญชี', '帐户')}><BankPick value={item.bank_id} onChange={(v) => setItem({ ...item, bank_id: v })} thai={!!item.is_thai} /></Field>
                <Field label={t('Date', 'วันที่', '日期')}><input type="date" value={item.date} onChange={(e) => setItem({ ...item, date: e.target.value })} /></Field>
                <Field label={t('Amount', 'ยอด', '总额')}><input type="number" step="any" value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} /></Field>
                <Field label={t('Bank fee', 'ค่าธรรมเนียม', '手续费')}><input type="number" step="any" value={item.bank_fee} onChange={(e) => setItem({ ...item, bank_fee: e.target.value })} /></Field>
              </Grid>
            </Modal>
          )}
        </Page>
      )}
    </>
  );
}

/** UnpaidForm */
export function Unpaid() {
  const t = useT();
  const [supplier, setSupplier] = useState('');
  const { data } = useApi<any>('/unpaid', { supplier });
  const [tab, setTab] = useState('cust');
  return (
    <Page title={t('Unpaid summary', 'สรุปยอดลูกค้าค้างจ่าย', '未付款汇总')}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'cust', label: t('By customer', 'ตามลูกค้า', '按客户') },
        { key: 'ship', label: t('Shipping not paid', 'ดูค่าน้ำหนักค้างจ่าย', '运费未付') },
        { key: 'bill', label: t('Bills not paid', 'ดูค่าสินค้าค้างจ่าย', '货款未付') },
      ]} />
      {tab === 'cust' && <Table rowKey="customer_id" rows={data?.customers} columns={[
        { key: 'customer_code', label: 'CODE', render: (r) => <Link to={`/customers/${r.customer_id}`}>{r.customer_code}</Link> },
        { key: 'shipping_thb', label: t('Shipping ฿', 'ค่าน้ำหนัก(บาท)', '运费 泰铢'), money: true, sum: true },
        { key: 'shipping_cny', label: t('Shipping ¥', 'ค่าน้ำหนัก(หยวน)', '运费 人民币'), money: true, sum: true },
        { key: 'bills_cny', label: t('Goods ¥', 'ค่าสินค้า(หยวน)', '货款'), money: true, sum: true },
        { key: 'balance_thb', label: t('THB balance', 'เงินไทยคงเหลือ', '泰铢余额'), money: true, render: (r) => <span className={r.balance_thb < 0 ? 'neg' : ''}>{money(r.balance_thb)}</span> },
        { key: 'balance_cny', label: t('CNY balance', 'เงินหยวนคงเหลือ', '人民币余额'), money: true, render: (r) => <span className={r.balance_cny < 0 ? 'neg' : ''}>{money(r.balance_cny)}</span> },
      ]} />}
      {tab === 'ship' && <Table rowKey="k" rows={data?.shipping.map((s: any) => ({ ...s, k: `${s.shipment_id}-${s.customer_id}` }))} columns={[
        { key: 'customer_code', label: 'CODE' }, { key: 'shipment_code', label: t('Round', 'รอบ', '发货单') }, { key: 'shipment_date', label: t('Date', 'วันที่', '日期') },
        { key: 'total', label: t('Amount', 'ยอด', '总额'), money: true, sum: true }, { key: 'currency', label: '' },
      ]} />}
      {tab === 'bill' && <>
        <Card><Field label={t('Find supplier', 'ค้นหาร้านค้า', '找卖家')}><input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field></Card>
        <Table rows={data?.bills} columns={[
          { key: 'code', label: t('Bill', 'บิล', '划款单'), render: (r) => <Link to={`/packages/${r.id}`}>{r.code}</Link> },
          { key: 'customer_code', label: 'CODE' }, { key: 'date', label: t('Date', 'วันที่', '日期') },
          { key: 'supplier_account', label: t('Shop account', 'บัญชีร้าน', '卖家') },
          { key: 'due', label: t('To pay ¥', 'ยอดที่ต้องจ่าย', '应付'), money: true, sum: true }, { key: 'paid', label: t('Paid ¥', 'จ่ายแล้ว', '已付'), money: true, sum: true },
          { key: 'remaining', label: t('Left ¥', 'คงเหลือ', '余额'), money: true, sum: true },
        ]} />
      </>}
    </Page>
  );
}

/** InvoicePaymentForm — pay a supplier bill from a company CNY account. */
export function InvoicePay() {
  const t = useT();
  const [sp] = useSearchParams();
  const [code, setCode] = useState(sp.get('bill') || '');
  const [k, setK] = useState<any>(null);
  const [p, setP] = useState<any>({ date: today(), amount: '', bank_fee: 0, service_fee: 0, bank_id: null });
  const { run, busy } = useAction();
  const load = async (c = code) => {
    const r: any = await run(() => api(`/packages/${encodeURIComponent(c.trim())}`), false);
    if (r) { setK(r); setP((x: any) => ({ ...x, amount: r.remaining })); }
  };
  useEffect(() => { if (sp.get('bill')) void load(sp.get('bill')!); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pay = async () => {
    const charge = Number(p.amount || 0) + Number(p.service_fee || 0);
    if (!confirm(`${t('Pay', 'จ่าย', '付款')} ¥${money(p.amount)} · ${t('customer is charged', 'หักลูกค้า', '从客户扣除')} ¥${money(charge)}?`)) return;
    if (await run(() => api(`/packages/${k.id}/payments`, { body: p }))) await load(k.code);
  };
  return (
    <Page title={t('Pay supplier bill', 'จ่ายบิล', '付款')}>
      <Card>
        <form className="row" onSubmit={(e) => { e.preventDefault(); void load(); }}>
          <input style={{ maxWidth: 260 }} autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('Bill code', 'เลขบิล', '划款单号')} />
          <button>{t('Find', 'ค้นหา', '搜索')}</button>
        </form>
      </Card>
      {k && (<>
        <div className="stats">
          <Stat label={t('Bill', 'บิล', '划款单')} value={k.code} />
          <Stat label={t('Customer', 'ลูกค้า', '客户')} value={k.customer_code} />
          <Stat label={t('Left to pay ¥', 'ยอดคงเหลือ', '余额')} value={money(k.remaining)} tone={k.remaining > 0 ? 'warn' : 'good'} />
          <Stat label={t('Customer CNY balance', 'Balance เงินจีน', '客户人民币余额')} value={money(k.customer_balance_cny)} tone={k.customer_balance_cny < Number(p.amount || 0) ? 'bad' : undefined} />
        </div>
        <Card title={`${t('Pay to', 'โอนเงินให้', '汇款给')}: ${k.supplier_bank || '—'} · ${k.supplier_account || ''} · ${k.supplier_number || ''}`}>
          <Table rows={k.items} columns={[
            { key: 'order_id', label: t('Order', 'ออเดอร์', '订单'), render: (r) => `#${r.order_id}` }, { key: 'product_id', label: t('Product', 'รหัสสินค้า', '款号') },
            { key: 'quantity', label: t('Qty', 'จำนวน', '数量'), align: 'right' }, { key: 'unit_price', label: '¥', money: true },
            { key: 'tot', label: t('Total', 'รวม', '总价'), money: true, render: (r) => money(r.quantity * r.unit_price) },
            { key: 'deposit', label: t('Deposit', 'มัดจำ', '定金'), money: true }, { key: 'deductions', label: t('Deducted', 'หัก', '扣除'), money: true },
          ]} />
          {k.remaining > 0 && (
            <Grid cols={5}>
              <Field label={t('From account', 'จากบัญชี', '从帐户')}><BankPick value={p.bank_id} onChange={(v) => setP({ ...p, bank_id: v })} thai={false} /></Field>
              <Field label={t('Date', 'วันที่', '日期')}><input type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
              <Field label={t('Pay out ¥', 'ยอดที่จ่ายจริง', '实际支付')}><input type="number" step="any" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} /></Field>
              <Field label={t('Bank fee ¥ (company)', 'ค่าธรรมเนียม', '手续费')}><input type="number" step="any" value={p.bank_fee} onChange={(e) => setP({ ...p, bank_fee: e.target.value })} /></Field>
              <Field label={t('Service fee ¥ (customer)', 'ค่าบริการโอน', '打包费')}><input type="number" step="any" value={p.service_fee} onChange={(e) => setP({ ...p, service_fee: e.target.value })} /></Field>
            </Grid>
          )}
          {k.remaining > 0 && <div className="total-line"><span>{t('Customer is charged', 'หักลูกค้า', '从客户扣除')} ¥{money(Number(p.amount || 0) + Number(p.service_fee || 0))}</span><button className="primary" disabled={busy} onClick={pay}>{t('Pay', 'จ่าย', '付款')}</button></div>}
        </Card>
        <Card title={t('Payments so far', 'การจ่ายเงิน', '付款')}>
          <Table rows={k.payments} columns={[
            { key: 'date', label: t('Date', 'วันที่', '日期') }, { key: 'bank', label: t('Account', 'บัญชี', '帐户') }, { key: 'amount', label: '¥', money: true, sum: true },
            { key: 'bank_fee', label: t('Bank fee', 'ค่าธรรมเนียม', '手续费'), money: true }, { key: 'service_fee', label: t('Service', 'ค่าบริการ', '服务费'), money: true },
          ]} />
        </Card>
      </>)}
    </Page>
  );
}

/** InvoicePaymentSearchFrom */
export function InvoicePayments() {
  const t = useT();
  const can = useCan();
  const [q, setQ] = useState<any>({ from: monthStart(), to: '', checked: '' });
  const { data, reload } = useApi<any[]>('/invoice-payments', q);
  const [sel, setSel] = useState<Set<any>>(new Set());
  const { run } = useAction();
  return (
    <Page title={t('Bill payments', 'ค้นหารายการจ่ายบิล', '查付款')}
      actions={can.verify('invoice_payment') && <button disabled={!sel.size} onClick={async () => { if (await run(() => api('/invoice-payments/check', { body: { ids: [...sel] } }))) { setSel(new Set()); reload(); } }}>✓ {t('Check selected', 'ตรวจแล้ว', '校验')} ({sel.size})</button>}>
      <Card>
        <Grid cols={5}>
          <Field label={t('Customer', 'ลูกค้า', '客户')}><CustomerPick value={q.customer_id} onChange={(v) => setQ({ ...q, customer_id: v })} /></Field>
          <DateRange from={q.from} to={q.to} onChange={(from, to) => setQ({ ...q, from, to })} />
          <CheckedFilter value={q.checked} onChange={(v) => setQ({ ...q, checked: v })} />
        </Grid>
      </Card>
      <Table rows={data} selectable={(r) => !r.checked} selected={sel} onSelect={setSel} columns={[
        { key: 'date', label: t('Date', 'วันที่', '日期') },
        { key: 'package_code', label: t('Bill', 'บิล', '划款单'), render: (r) => <Link to={`/packages/${r.package_id}`}>{r.package_code}</Link> },
        { key: 'customer_code', label: 'CODE' }, { key: 'bank', label: t('Account', 'บัญชี', '帐户') },
        { key: 'amount', label: '¥', money: true, sum: true }, { key: 'bank_fee', label: t('Bank fee', 'ค่าธรรมเนียม', '手续费'), money: true, sum: true },
        { key: 'service_fee', label: t('Service', 'ค่าบริการ', '服务费'), money: true, sum: true }, { key: 'payment_ref', label: 'Ref' },
        { key: 'checked', label: t('Checked', 'ตรวจ', '校验'), render: (r) => r.checked ? <Badge tone="good">✓ {r.checked_by}</Badge> : <Badge tone="warn">—</Badge> },
        { key: 'x', label: '', render: (r) => !r.checked && <button className="link danger" onClick={async () => { if (confirm('?') && await run(() => api(`/invoice-payments/${r.id}`, { method: 'DELETE' }))) reload(); }}>{t('Delete', 'ลบ', '删除')}</button> },
      ]} />
    </Page>
  );
}
