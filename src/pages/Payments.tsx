import { useState } from 'react';
import { api, useApi, useApp, useCan, useT, money, today, monthStart } from '../lib';
import { Page, Card, Grid, Field, Table, CustomerPick, BankPick, ShipmentPick, DateRange, Badge, Modal, useAction, useAsk } from '../ui';
import { Check, Plus, RefreshCw } from 'lucide-react';

export function usePaymentLabels() {
  const t = useT();
  return {
    type: (k: string) => ({
      topup: t('Top up THB balance', 'เติมเงินเข้า balance เงินไทย', '充值泰铢'),
      topup_cny: t('Top up CNY balance', 'เติมเงินเข้า balance เงินจีน', '充值人民币'),
      shipping: t('Pay shipping', 'ค่าขนส่ง', '运费'),
      goods: t('Pay for goods (CNY)', 'ค่าสินค้า (หยวน)', '货款'),
    } as Record<string, string>)[k] || k,
    from: (k: string) => ({
      bank: t('Bank transfer', 'โอนเงินเข้าธนาคาร', '银行转账'),
      balance: t('From THB balance', 'หักจาก balance เงินไทย', '从泰铢余额'),
      yuan: t('THB balance → CNY', 'หักจาก balance เงินไทย → หยวน', '泰铢余额 → 人民币'),
    } as Record<string, string>)[k] || k,
    status: (id: number) => id === 2 ? <Badge tone="good">{t('Approved', 'ผ่าน', '通过')}</Badge> : id === 3 ? <Badge tone="bad">{t('Rejected', 'ไม่ผ่าน', '不通过')}</Badge> : <Badge tone="warn">{t('Waiting', 'รอตรวจสอบ', '待核对')}</Badge>,
  };
}

export function PaymentForm({ value, onClose, onSaved }: { value: any; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const L = usePaymentLabels();
  const { lookups } = useApp();
  const [p, setP] = useState<any>(value);
  const { run, busy } = useAction();
  const set = (k: string) => (e: any) => setP({ ...p, [k]: e.target.value });
  const toCny = p.type === 'topup_cny' || p.type === 'goods';
  const save = async () => { if (await run(() => (p.id ? api(`/payments/${p.id}`, { method: 'PUT', body: p }) : api('/payments', { body: p })))) { onSaved(); onClose(); } };
  return (
    <Modal open title={p.id ? t('Edit payment notice', 'แก้ไขรายการแจ้งยอด', '修改付款通知') : t('New payment notice', 'เพิ่มรายการแจ้งโอน', '新增付款通知')} onClose={onClose}
      footer={<><button onClick={onClose}>{t('Cancel', 'ยกเลิก', '取消')}</button><button className="primary" disabled={busy} onClick={save}>{t('Save', 'บันทึก', '保存')}</button></>}>
      <Grid cols={2}>
        <Field label={t('Customer', 'ลูกค้า', '客户') + ' *'}><CustomerPick value={p.customer_id} onChange={(v) => setP({ ...p, customer_id: v })} placeholder="—" /></Field>
        <Field label={t('For', 'เพื่อชำระ', '用于')}>
          <select value={p.type} onChange={set('type')}>{['topup', 'topup_cny', 'shipping', 'goods'].map((k) => <option key={k} value={k}>{L.type(k)}</option>)}</select>
        </Field>
        <Field label={t('Paid by', 'ช่องทาง', '方式')}>
          <select value={p.pay_from} onChange={set('pay_from')}>{['bank', 'balance', 'yuan'].map((k) => <option key={k} value={k}>{L.from(k)}</option>)}</select>
        </Field>
        {p.pay_from === 'bank' && <Field label={t('Into company account', 'เข้าบัญชี', '到帐户')}><BankPick value={p.bank_id} onChange={(v) => setP({ ...p, bank_id: v })} thai /></Field>}
        <Field label={t('Amount (THB)', 'ยอดเงิน (บาท)', '总额 (泰铢)') + ' *'}><input type="number" step="any" value={p.amount_check ?? ''} onChange={set('amount_check')} /></Field>
        <Field label={t('Transfer date', 'วันที่โอน', '转账日期')}><input type="date" value={p.payment_date || ''} onChange={set('payment_date')} /></Field>
        {p.type === 'shipping' && <Field label={t('Shipment round', 'รอบขนส่ง', '发货单')}><ShipmentPick value={p.shipment_id} onChange={(v) => setP({ ...p, shipment_id: v })} /></Field>}
        {(toCny || p.pay_from === 'yuan') && <>
          <Field label={t('Exchange rate', 'เรทแลกเงิน', '汇率')} hint={`${t('latest', 'ล่าสุด', '最新')}: ${lookups.rate || '—'}`}><input type="number" step="any" value={p.exchange_rate ?? ''} onChange={set('exchange_rate')} /></Field>
          <Field label={t('Exchange fee (THB)', 'ค่าแลกเงิน', '换钱费')}><input type="number" step="any" value={p.exchange_fee ?? ''} onChange={set('exchange_fee')} /></Field>
          {Number(p.exchange_rate) > 0 && <Field label="≈ CNY"><b>¥ {money((Number(p.amount_check || 0) - Number(p.exchange_fee || 0)) / Number(p.exchange_rate))}</b></Field>}
        </>}
        <Field label={t('Reference', 'เลขอ้างอิง', '参考')}><input value={p.reference || ''} onChange={set('reference')} /></Field>
        <Field label={t('Detail', 'รายละเอียด', '详情')} wide><input value={p.description || ''} onChange={set('description')} /></Field>
        <Field label={t('Remark', 'หมายเหตุ', '备注')} wide><input value={p.remark || ''} onChange={set('remark')} /></Field>
      </Grid>
    </Modal>
  );
}

/** ThaiPaymentInfoForm — customers' "I transferred money" notices. */
export function Payments() {
  const t = useT();
  const L = usePaymentLabels();
  const { lookups } = useApp();
  const [q, setQ] = useState<any>({ from: monthStart(), to: '', status_id: '' });
  const { data, reload } = useApi<any[]>('/payments', q);
  const [edit, setEdit] = useState<any>(null);
  const { run } = useAction();
  const { ask } = useAsk();
  return (
    <Page title={t('Payment notices', 'รายการแจ้งโอน', '付款通知')}
      actions={<button className="primary" onClick={() => setEdit({ type: 'topup', pay_from: 'bank', payment_date: today(), exchange_rate: lookups.rate || '' })}><Plus size={16} aria-hidden /> {t('New notice', 'เพิ่มรายการแจ้งโอน', '新增')}</button>}>
      <Card>
        <Grid cols={4}>
          <Field label={t('Customer', 'ลูกค้า', '客户')}><CustomerPick value={q.customer_id} onChange={(v) => setQ({ ...q, customer_id: v })} /></Field>
          <DateRange from={q.from} to={q.to} onChange={(from, to) => setQ({ ...q, from, to })} />
          <Field label={t('Status', 'สถานะ', '状态')}>
            <select value={q.status_id} onChange={(e) => setQ({ ...q, status_id: e.target.value })}>
              <option value="">{t('All', 'ทั้งหมด', '全部')}</option><option value="1">{t('Waiting', 'รอตรวจสอบ', '待核对')}</option><option value="2">{t('Approved', 'ผ่าน', '通过')}</option><option value="3">{t('Rejected', 'ไม่ผ่าน', '不通过')}</option>
            </select>
          </Field>
        </Grid>
      </Card>
      <Table rows={data} onRow={(r) => r.status_id !== 2 && setEdit(r)} columns={[
        { key: 'id', label: '#' },
        { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') },
        { key: 'payment_date', label: t('Transfer date', 'เวลาชำระ', '付款日期') },
        { key: 'type', label: t('For', 'เพื่อชำระ', '用于'), render: (r) => <>{L.type(r.type)}{r.shipment_code ? ` · ${r.shipment_code}` : ''}</> },
        { key: 'pay_from', label: t('Paid by', 'ช่องทาง', '方式'), render: (r) => r.pay_from === 'bank' ? r.bank : L.from(r.pay_from) },
        { key: 'amount_check', label: t('Amount', 'ยอดแจ้ง', '金额'), money: true, sum: true },
        { key: 'amount_paid', label: t('Approved', 'ยอดจริง', '实收'), money: true, sum: true },
        { key: 'exchange_rate', label: t('Rate', 'เรท', '汇率') },
        { key: 'status_id', label: t('Status', 'สถานะ', '状态'), render: (r) => L.status(r.status_id) },
        { key: 'checked_by', label: t('Checked by', 'ตรวจโดย', '校验人') },
        { key: 'x', label: '', render: (r) => r.status_id !== 2 && <button className="link danger" onClick={async (e) => { e.stopPropagation(); if (await ask(t('Delete this item?', 'ต้องการลบรายการนี้?', '你确定要删除吗?'), { danger: true }) && await run(() => api(`/payments/${r.id}`, { method: 'DELETE' }))) reload(); }}>{t('Delete', 'ลบ', '删除')}</button> },
      ]} />
      {edit && <PaymentForm value={edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </Page>
  );
}

/** CheckPaymentForm — match notices with bank lines and approve. */
export function CheckPayments() {
  const t = useT();
  const L = usePaymentLabels();
  const can = useCan();
  const { lookups } = useApp();
  const { data, reload } = useApi<any[]>('/payments/check');
  const unmatched = useApi<any[]>('/bank/unmatched');
  const [ap, setAp] = useState<any>(null);
  const [add, setAdd] = useState<any>(null);
  const { run, busy } = useAction();
  const { ask, askText } = useAsk();
  const refresh = () => { reload(); unmatched.reload(); };
  const approve = async () => {
    if (await run(() => api(`/payments/${ap.id}/approve`, { body: ap }), t('Approved', 'ตรวจเรียบร้อย', '通过'))) { setAp(null); refresh(); }
  };
  const quickAll = async () => {
    const ready = (data || []).filter((p) => p.pay_from === 'bank' && p.candidates.length === 1 && p.type !== 'topup_cny' && p.type !== 'goods');
    if (!ready.length || !(await ask(`${t('Approve', 'อนุมัติ', '通过')} ${ready.length} ${t('notices?', 'รายการ?', '条?')}`, { ok: t('Approve', 'อนุมัติ', '通过') }))) return;
    for (const p of ready) await run(() => api(`/payments/${p.id}/approve`, { body: { statement_id: p.candidates[0].id } }), false);
    refresh();
  };
  return (
    <Page title={t('Check customer payments', 'ตรวจสอบยอดโอนเงินลูกค้า', '核对付款')}
      actions={<>
        <button onClick={refresh}><RefreshCw size={16} aria-hidden /><span className="sr-only">Refresh</span></button>
        {can.verify('payment') && <button onClick={quickAll}>{t('Approve all exact matches', 'ตรวจยอดทั้งหมด (ตรงกันพอดี)', '全部核对')}</button>}
        <button className="primary" onClick={() => setAdd({ type: 'topup', pay_from: 'bank', payment_date: today(), exchange_rate: lookups.rate || '' })}><Plus size={16} aria-hidden /> {t('Add notice', 'เพิ่มรายการแจ้งโอน', '新增')}</button>
      </>}>
      {!can.verify('payment') && <p className="muted">{t('You can view but not approve. Ask an admin for the "Customer payments" check permission.', 'คุณไม่มีสิทธิ์ตรวจสอบรายการ', '您无权验证')}</p>}
      <Card title={`${t('Waiting', 'รอตรวจสอบ', '待核对')} (${data?.length ?? 0})`}>
        <Table rows={data} columns={[
          { key: 'id', label: '#' },
          { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') },
          { key: 'payment_date', label: t('Date', 'วันที่', '日期') },
          { key: 'type', label: t('For', 'เพื่อชำระ', '用于'), render: (r) => <>{L.type(r.type)}{r.shipment_code ? ` · ${r.shipment_code}` : ''}{r.shipment_due ? ` (${money(r.shipment_due.total)})` : ''}</> },
          { key: 'bank', label: t('Account', 'บัญชี', '帐户'), render: (r) => r.pay_from === 'bank' ? r.bank : L.from(r.pay_from) },
          { key: 'amount_check', label: t('Amount', 'ยอด', '金额'), money: true, sum: true },
          { key: 'balance_thb', label: t('THB bal.', 'เงินไทย', '泰铢'), money: true },
          { key: 'm', label: t('Bank match', 'ยอดธนาคาร', '银行'), render: (r) => r.pay_from !== 'bank' ? '—' : r.candidates.length
            ? <Badge tone={r.candidates.length === 1 ? 'good' : 'warn'}>{r.candidates.length === 1 ? <><Check size={12} aria-hidden /> {r.candidates[0].date}</> : `${r.candidates.length} ${t('possible', 'รายการ', '可能')}`}</Badge>
            : <Badge tone="bad">{t('Not found', 'หาไม่เจอ', '找不到')}</Badge> },
          { key: 'a', label: '', render: (r) => can.verify('payment') && <span className="row">
            <button className="small primary" onClick={() => setAp({ ...r, statement_id: r.candidates[0]?.id || null, amount_paid: r.amount_check, exchange_rate: r.exchange_rate || lookups.rate || '', exchange_fee: r.exchange_fee || 0 })}>{t('Check', 'ตรวจ', '核对')}</button>
            <button className="small danger" onClick={async () => { const remark = await askText(t('Reject this payment notice?', 'ไม่ผ่านรายการแจ้งโอนนี้?', '不通过此付款通知?'), t('Reason (shown in history)', 'เหตุผล', '原因')); if (remark !== undefined && await run(() => api(`/payments/${r.id}/reject`, { body: { remark } }))) refresh(); }}>{t('Reject', 'ไม่ผ่าน', '不通过')}</button>
          </span> },
        ]} empty={t('Nothing waiting', 'ไม่มีรายการรอตรวจ', '没有待核对')} />
      </Card>
      <Card title={t('Money in the bank with no owner yet', 'ดูยอดที่หาเจ้าของไม่เจอ', '找不到主人的款项')}>
        <Table rows={unmatched.data} maxHeight={320} columns={[
          { key: 'date', label: t('Date', 'วันที่', '日期') }, { key: 'bank', label: t('Account', 'บัญชี', '帐户') },
          { key: 'income', label: t('In', 'เข้า', '收入'), money: true, sum: true }, { key: 'bank_detail', label: t('Bank detail', 'รายละเอียดจากธนาคาร', '银行详情') },
          { key: 'detail', label: t('Note', 'หมายเหตุ', '备注') },
        ]} />
      </Card>
      {ap && (
        <Modal open wide title={`${t('Check', 'ตรวจสอบ', '核对')} #${ap.id} · ${ap.customer_code} · ${L.type(ap.type)}`} onClose={() => setAp(null)}
          footer={<><button onClick={() => setAp(null)}>{t('Cancel', 'ยกเลิก', '取消')}</button><button className="primary" disabled={busy} onClick={approve}><Check size={16} aria-hidden /> {t('Approve', 'ผ่าน', '通过')}</button></>}>
          <Grid cols={4}>
            <Field label={t('Amount received (THB)', 'ยอดเงินจริง', '实收')}><input type="number" step="any" value={ap.amount_paid} onChange={(e) => setAp({ ...ap, amount_paid: e.target.value })} /></Field>
            <Field label={t('Date', 'วันที่', '日期')}><input type="date" value={ap.payment_date || today()} onChange={(e) => setAp({ ...ap, payment_date: e.target.value })} /></Field>
            {(ap.type === 'topup_cny' || ap.type === 'goods' || ap.pay_from === 'yuan') && <>
              <Field label={t('Rate', 'เรท', '汇率')}><input type="number" step="any" value={ap.exchange_rate} onChange={(e) => setAp({ ...ap, exchange_rate: e.target.value })} /></Field>
              <Field label={t('Fee', 'ค่าแลกเงิน', '换钱费')}><input type="number" step="any" value={ap.exchange_fee} onChange={(e) => setAp({ ...ap, exchange_fee: e.target.value })} /></Field>
            </>}
          </Grid>
          {ap.pay_from === 'bank' && (<>
            <h3>{t('Pick the bank line', 'เลือกรายการเดินบัญชี', '选择银行流水')}</h3>
            <Table rows={ap.candidates} onRow={(s) => setAp({ ...ap, statement_id: s.id })} rowClass={(s) => (s.id === ap.statement_id ? 'on' : '')} columns={[
              { key: 'sel', label: '', render: (s) => <input type="radio" readOnly checked={s.id === ap.statement_id} /> },
              { key: 'date', label: t('Date', 'วันที่', '日期') }, { key: 'bank', label: t('Account', 'บัญชี', '帐户') },
              { key: 'income', label: t('In', 'เข้า', '收入'), money: true }, { key: 'bank_detail', label: t('Bank detail', 'รายละเอียด', '详情') },
            ]} empty={t('No bank line with this amount ±3 days. Import the statement first, or approve without a bank line.', 'ไม่พบยอดในธนาคาร กรุณาดึงยอดธนาคารก่อน', '找不到银行流水')} />
            <label className="row" style={{ marginTop: 8 }}><input type="checkbox" checked={!!ap.force} onChange={(e) => setAp({ ...ap, force: e.target.checked, statement_id: e.target.checked ? null : ap.statement_id })} /> {t('Approve without a bank line', 'อนุมัติโดยไม่ผูกกับรายการธนาคาร', '无银行流水通过')}</label>
          </>)}
        </Modal>
      )}
      {add && <PaymentForm value={add} onClose={() => setAdd(null)} onSaved={refresh} />}
    </Page>
  );
}
