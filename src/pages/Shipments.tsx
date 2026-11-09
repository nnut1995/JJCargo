import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { api, useApi, useApp, useCan, useLang, useT, money, pick, today, cbm, sum } from '../lib';
import { Page, Card, Grid, Field, Table, CustomerPick, ShipmentPick, DateRange, Badge, Modal, PrintModal, useAction, useAsk, useToast, Empty, Bi } from '../ui';
import { Printer, Check, Plus, X, Pencil, ScanBarcode, FileSpreadsheet } from 'lucide-react';
import { downloadXlsx } from '../xlsx';
import { CrudPage, EditModal, type FieldDef } from './Crud';
import { SHIPMENT_STATUSES } from '../../shared/statuses';

function StatusBadge({ status, date }: { status?: string | null; date?: string | null }) {
  const { lang } = useLang();
  const t = useT();
  const s = SHIPMENT_STATUSES.find((x) => x.key === status);
  if (!s) return <Badge>{t('Packing', 'กำลังรวมของ', '集货中')}</Badge>;
  return <Badge tone={s.tone}>{pick(s, lang)}{date ? ` · ${date}` : ''}</Badge>;
}

function StatusModal({ s, onClose }: { s: any; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const { run, busy } = useAction();
  const log = useApi<any[]>(`/shipments/${s.id}/status`);
  const [v, setV] = useState<any>({ status: SHIPMENT_STATUSES[Math.min(SHIPMENT_STATUSES.findIndex((x) => x.key === s.status) + 1, SHIPMENT_STATUSES.length - 1)].key, date: today(), note: '' });
  const save = async () => { if (await run(() => api(`/shipments/${s.id}/status`, { body: v }))) onClose(); };
  return (
    <Modal open title={`${t('Round status', 'สถานะรอบขนส่ง', '发货状态')} ${s.code}`} onClose={onClose}
      footer={<><button onClick={onClose}>{t('Close', 'ปิด', '关闭')}</button><button className="primary" disabled={busy} onClick={save}>{t('Save status', 'บันทึกสถานะ', '保存')}</button></>}>
      <Grid cols={2}>
        <Field label={t('New status', 'สถานะใหม่', '新状态')}>
          <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
            {SHIPMENT_STATUSES.map((x, i) => <option key={x.key} value={x.key}>{i + 1}. {pick(x, lang)}</option>)}
          </select>
        </Field>
        <Field label={t('Date', 'วันที่', '日期')}><input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label={t('Note', 'หมายเหตุ', '备注')} wide><input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
      </Grid>
      <h3>{t('History', 'ประวัติสถานะ', '历史')}</h3>
      <Table rows={log.data} columns={[
        { key: 'date', label: t('Date', 'วันที่', '日期') },
        { key: 'status', label: t('Status', 'สถานะ', '状态'), render: (r) => <StatusBadge status={r.status} /> },
        { key: 'note', label: t('Note', 'หมายเหตุ', '备注') },
        { key: 'created_by', label: t('By', 'โดย', '人') },
      ]} />
    </Modal>
  );
}

type RoundDialog = 'load' | 'new';

/** ShipmentForm + OffChinaFrom — shipment rounds (containers / trucks) with loading boxes as a dialog. */
export function Shipments() {
  const t = useT();
  const { lang } = useLang();
  const can = useCan();
  const { reloadLookups } = useApp();
  const { run, busy } = useAction();
  const { ask } = useAsk();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState<any>({ q: '', from: '', to: '', status: '', arrived: '' });
  const { data, reload } = useApi<any[]>('/r/shipments', { q: q.q, from: q.from, to: q.to });
  const [st, setSt] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const canEdit = can.menu('shipment.list'), canLoad = can.menu('packing.offchina');
  const dialog = sp.get('open') as RoundDialog | null;
  const loadRound = sp.get('round') ? Number(sp.get('round')) : null;
  const openDialog = (d: RoundDialog | null, round?: number) => setSp((p) => {
    const n = new URLSearchParams(p);
    if (d) n.set('open', d); else n.delete('open');
    if (round) n.set('round', String(round)); else n.delete('round');
    return n;
  }, { replace: !d });
  const after = async () => { await reload(); await reloadLookups(); };
  const fields: FieldDef[] = [
    { key: 'code', label: t('Round code', 'รหัสรอบขนส่ง', '出货代码'), required: true },
    { key: 'date', label: t('Departure date', 'วันที่ออกของ', '出货日期'), type: 'date', required: true, default: today() },
    { key: 'arrived_date', label: t('Arrived in Thailand', 'วันที่ถึงไทย', '到达日期'), type: 'date' },
  ];
  const save = async (v: any) => {
    if (!v.code || !v.date) { toast(t('Please fill round code and date', 'กรุณาระบุรหัสรอบและวันที่', '请填写'), 'err'); return; }
    const ok = await run(() => (v.id ? api(`/r/shipments/${v.id}`, { method: 'PUT', body: v }) : api('/r/shipments', { body: v })));
    if (ok) { setEdit(null); if (dialog === 'new') openDialog(null); await after(); }
  };
  const del = async (r: any) => {
    if (!(await ask(t('Delete this round?', 'ต้องการลบรอบขนส่งนี้?', '你确定要删除吗?'), { danger: true }))) return;
    if (await run(() => api(`/r/shipments/${r.id}`, { method: 'DELETE' }), t('Deleted', 'ลบแล้ว', '已删除'))) await after();
  };
  const rows = (data || []).filter((r) =>
    (!q.status || (q.status === 'none' ? !r.status : r.status === q.status)) &&
    (!q.arrived || (q.arrived === '1') === (!!r.arrived_date && r.arrived_date <= today())));
  const creating = dialog === 'new' && canEdit;
  return (
    <Page title={t('Shipment rounds', 'รอบขนส่ง / ขึ้นตู้', '发货运单 / 上车')}
      actions={<>
        {canLoad && <button onClick={() => openDialog('load')}><ScanBarcode size={16} aria-hidden /> {t('Load container (scan)', 'ขึ้นตู้เมืองจีน (สแกน)', '上车 (扫描)')}</button>}
        {canEdit && <button className="primary" onClick={() => openDialog('new')}><Plus size={16} aria-hidden /> {t('New round', 'เพิ่มรอบขนส่ง', '新增发货单')}</button>}
      </>}>
      <Card>
        <Grid cols={5}>
          <Field label={t('Round code', 'รหัสรอบขนส่ง', '出货代码')}><input value={q.q} onChange={(e) => setQ({ ...q, q: e.target.value })} /></Field>
          <DateRange from={q.from} to={q.to} onChange={(from, to) => setQ({ ...q, from, to })} />
          <Field label={t('Status', 'สถานะ', '状态')}>
            <select value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value })}>
              <option value="">{t('All', 'ทั้งหมด', '全部')}</option>
              <option value="none">{t('Packing', 'กำลังรวมของ', '集货中')}</option>
              {SHIPMENT_STATUSES.map((x, i) => <option key={x.key} value={x.key}>{i + 1}. {pick(x, lang)}</option>)}
            </select>
          </Field>
          <Field label={t('Arrived in Thailand', 'ถึงไทย', '到达')}>
            <select value={q.arrived} onChange={(e) => setQ({ ...q, arrived: e.target.value })}>
              <option value="">{t('All', 'ทั้งหมด', '全部')}</option><option value="0">{t('Not yet', 'ยังไม่ถึง', '未到')}</option><option value="1">{t('Arrived', 'ถึงแล้ว', '已到')}</option>
            </select>
          </Field>
        </Grid>
      </Card>
      <Table rows={rows} onRow={canEdit ? (r) => setEdit(r) : undefined} columns={[
        { key: 'code', label: t('Round', 'รอบ', '发货单'), render: (r) => <b>{r.code}</b> },
        { key: 'date', label: t('Date', 'วันที่', '日期') },
        { key: 'packing_count', label: t('Boxes', 'กระสอบ', '包'), align: 'right', sum: true },
        { key: 'total_weight', label: 'kg', money: true, sum: true },
        { key: 'status', label: t('Status', 'สถานะ', '状态'), render: (r) => !canEdit ? <StatusBadge status={r.status} date={r.status_date} /> : <span className="row" onClick={(e) => e.stopPropagation()}>
          {/* pick a status straight from the list (dated today); the history link opens the full dialog for another date or a note */}
          <select style={{ width: 240 }} value={r.status || ''} aria-label={t('Status', 'สถานะ', '状态')}
            onChange={async (e) => { if (e.target.value && await run(() => api(`/shipments/${r.id}/status`, { body: { status: e.target.value, date: today(), note: '' } }), t('Status updated', 'อัปเดตสถานะแล้ว', '已更新'))) reload(); }}>
            {!r.status && <option value="">{t('Packing', 'กำลังรวมของ', '集货中')}</option>}
            {SHIPMENT_STATUSES.map((x, i) => <option key={x.key} value={x.key}>{i + 1}. {pick(x, lang)}</option>)}
          </select>
          {r.status_date && <span className="muted">{r.status_date}</span>}
          <button className="link" onClick={() => setSt(r)}>{t('History', 'ประวัติ', '历史')}</button></span> },
        { key: 'arrived_date', label: t('Arrival in Thailand', 'วันที่ถึงไทย', '到达日期'), render: (r) => <span className="row" onClick={(e) => e.stopPropagation()}>
          {canEdit && <input type="date" style={{ width: 150 }} value={r.arrived_date || ''} aria-label={t('Arrival date', 'วันที่ถึงไทย', '到达日期')}
            onChange={async (e) => { if (await run(() => api(`/shipments/${r.id}/arrived`, { body: { date: e.target.value } }), false)) reload(); }} />}
          {r.arrived_date && (r.arrived_date <= today()
            ? <Badge tone="good">{t('Arrived', 'ถึงแล้ว', '已到')}{canEdit ? '' : ` ${r.arrived_date}`}</Badge>
            : <Badge tone="info">{t('Expected', 'กำหนดถึง', '预计')}{canEdit ? '' : ` ${r.arrived_date}`}</Badge>)}
        </span> },
        { key: 'x', label: '', render: (r) => <span className="row" onClick={(e) => e.stopPropagation()}>
          {canLoad && <button className="link" onClick={() => openDialog('load', r.id)}><ScanBarcode size={16} aria-hidden /> {t('Load', 'ขึ้นตู้', '上车')}</button>}
          <Link to={`/shipments/${r.id}/report`}>{t('Packing list', 'รายงาน', '报告')}</Link>
          {canEdit && <button className="link" onClick={() => setEdit(r)}><Pencil size={14} aria-hidden /><span className="sr-only">Edit</span></button>}
          {canEdit && !r.packing_count && <button className="link danger" onClick={() => del(r)}>{t('Delete', 'ลบ', '删除')}</button>}
        </span> },
      ]} empty={t('No rounds', 'ไม่มีรอบขนส่ง', '没有')} />
      {st && <StatusModal s={st} onClose={() => { setSt(null); reload(); }} />}
      {(edit || creating) && <EditModal open title={edit?.id ? `${t('Edit round', 'แก้ไขรอบขนส่ง', '修改发货单')} ${edit.code}` : t('New round', 'เพิ่มรอบขนส่ง', '新增发货单')}
        fields={fields} value={edit || { date: today() }} busy={busy} onSave={save}
        onClose={() => { setEdit(null); if (creating) openDialog(null); }} />}
      {dialog === 'load' && canLoad && <LoadModal round={loadRound} onClose={() => { openDialog(null); reload(); }} />}
    </Page>
  );
}

/** Old address /shipments/load opens the load dialog on the rounds screen. */
export function LoadRedirect() {
  return <Navigate to="/shipments?open=load" replace />;
}

/** OffChinaFrom — scan boxes onto a container. */
function LoadModal({ round, onClose }: { round: number | null; onClose: () => void }) {
  const t = useT();
  const [sid, setSid] = useState<any>(round);
  const [code, setCode] = useState('');
  const [date, setDate] = useState(today());
  const [last, setLast] = useState<any>(null);
  const loaded = useApi<any[]>(sid ? `/shipments/${sid}/packings` : null);
  const { run } = useAction();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (sid) setTimeout(() => ref.current?.focus(), 0); setLast(null); }, [sid]);
  const scan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    const p = await run(() => api(`/shipments/${sid}/load`, { body: { code: code.trim(), date } }), false);
    if (p) { setLast(p); loaded.reload(); }
    setCode('');
    ref.current?.focus();
  };
  return (
    <Modal open xl onClose={onClose} title={t('Load container (off China)', 'ขึ้นตู้เมืองจีน', '上车')}
      footer={<button onClick={onClose}>{t('Close', 'ปิด', '关闭')}</button>}>
      <Grid cols={3}>
        <Field label={t('Shipment round', 'รอบขนส่ง', '发货单')}><ShipmentPick value={sid} onChange={setSid} /></Field>
        <Field label={t('Off-China date', 'วันที่ขึ้นตู้', '上车日期')}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </Grid>
      {sid ? (
        <form onSubmit={scan} style={{ marginTop: 12 }}>
          <input ref={ref} className="scan" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('Scan box code (PK…), tracking no. or CTN, then Enter', 'สแกนเลขกระสอบ (PK…) / เลขแทรค / เลข CTN แล้วกด Enter', '扫描包号 / 单号 / CTN')} />
        </form>
      ) : <p className="muted">{t('Choose a round first', 'เลือกรอบขนส่งก่อน แล้วสแกนเลขกระสอบ', '先选择发货单')}</p>}
      {last && <p><Badge tone="good"><Check size={12} aria-hidden /> {last.packing_code}</Badge> {last.customer_code} · {last.weight} kg · CTN {last.ctn}/{last.no}</p>}
      {sid && <>
        <h3><Bi>{`${t('On this round', 'ในรอบนี้', '本发货单')} · ${loaded.data?.length || 0} ${t('boxes', 'กระสอบ', '包')} · ${money(sum(loaded.data, 'weight'))} kg`}</Bi></h3>
        <Table rows={loaded.data} maxHeight={380} columns={[
          { key: 'ctn', label: 'CTN', align: 'right' }, { key: 'no', label: 'No', align: 'right' },
          { key: 'packing_code', label: t('Box', 'เลขกระสอบ', '包号') }, { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') },
          { key: 'weight', label: 'kg', money: true, sum: true }, { key: 'dims', label: 'cm', render: (r) => `${r.cubic1}×${r.cubic2}×${r.cubic3}` },
          { key: 'off_china_date', label: t('Loaded', 'ขึ้นตู้', '上车') },
          { key: 'x', label: '', render: (r) => <button className="link danger" onClick={async () => { if (await run(() => api(`/shipments/${sid}/unload`, { body: { packing_id: r.id } }))) loaded.reload(); }}>{t('Unload', 'เอาออก', '卸下')}</button> },
        ]} />
      </>}
    </Modal>
  );
}

export function ShippingBill({ d }: { d: any }) {
  const t = useT();
  const { lookups } = useApp();
  const addr = d.addresses?.[0];
  const cur = d.currency === 'CNY' ? '¥' : '฿';
  return (
    <div className="doc">
      <div className="doc-head">
        <div><h2>{lookups.settings.print_text} · {t('Shipping bill', 'ใบแจ้งค่าขนส่ง', '运费单')}</h2>
          <div>{t('Round', 'รอบ', '发货单')}: <b>{d.shipment?.code}</b> · {d.shipment?.date}</div></div>
        <div style={{ textAlign: 'right' }}><b>{d.customer?.code}</b> {d.customer?.firstname} {d.customer?.lastname}<br />{d.customer?.phone}<br />{addr ? `${addr.address} ${addr.province || ''} ${addr.postcode || ''}` : ''}</div>
      </div>
      <table>
        <thead><tr><th>CTN</th><th>{t('Box', 'เลขกระสอบ', '包号')}</th><th>kg</th><th>cm</th><th>m³</th><th>{t('Basis', 'คิดตาม', '计算')}</th><th>{t('Rate', 'เรท', '单价')}</th><th>{t('Price', 'ราคา', '价格')}</th></tr></thead>
        <tbody>
          {d.packings.map((p: any) => <tr key={p.id}><td>{p.ctn}/{p.no}</td><td>{p.packing_code}</td><td>{p.weight}</td><td>{p.cubic1}×{p.cubic2}×{p.cubic3}</td><td>{p.cbm.toFixed(4)}</td><td>{p.basis}</td><td>{money(p.rate)}</td><td>{money(p.price)}</td></tr>)}
          {d.others.map((o: any) => <tr key={`o${o.id}`}><td colSpan={7}>{o.detail}</td><td>{money(o.amount)}</td></tr>)}
        </tbody>
      </table>
      <div className="total-line"><span>{t('Shipping', 'ค่าขนส่ง', '运费')} {cur}{money(d.shipping)}</span><span>{t('Other', 'อื่นๆ', '其他')} {cur}{money(d.other)}</span><span>{t('Total', 'รวม', '总价')} {cur}{money(d.total)}</span></div>
    </div>
  );
}

/** ShipmentSummaryForm — calculate shipping per customer for a round and post it to their balance. */
export function ShipmentSummary() {
  const t = useT();
  const [sid, setSid] = useState<any>(null);
  const [currency, setCurrency] = useState<'THB' | 'CNY'>('THB');
  const list = useApi<any[]>(sid ? `/shipments/${sid}/summary` : null, { currency });
  const [cid, setCid] = useState<number | null>(null);
  const detail = useApi<any>(sid && cid ? `/shipments/${sid}/summary/${cid}` : null, { currency });
  const [rateEdit, setRateEdit] = useState<any>(null);
  const [other, setOther] = useState({ detail: '', amount: '' });
  const [print, setPrint] = useState(false);
  const { run } = useAction();
  const { ask } = useAsk();
  const reloadAll = () => { list.reload(); detail.reload(); };
  const d = detail.data;
  const posted = !!d?.summary;
  return (
    <Page title={t('Shipping cost summary', 'สรุปยอดค่าขนส่ง', '运费汇总')}>
      <Card>
        <Grid cols={3}>
          <Field label={t('Shipment round', 'รอบขนส่ง', '发货单')}><ShipmentPick value={sid} onChange={(v) => { setSid(v); setCid(null); }} /></Field>
          <Field label={t('Charge in', 'หน่วยเงิน', '币种')}>
            <div className="radios">
              <label><input type="radio" checked={currency === 'THB'} onChange={() => setCurrency('THB')} /> {t('Baht', 'บาท', '泰铢')}</label>
              <label><input type="radio" checked={currency === 'CNY'} onChange={() => setCurrency('CNY')} /> {t('Yuan', 'หยวน', '元')}</label>
            </div>
          </Field>
        </Grid>
      </Card>
      {!sid && <Card><Empty>{t('Choose a shipment round above to see its customers and charges', 'เลือกรอบขนส่งด้านบน เพื่อดูลูกค้าและค่าขนส่งในรอบนั้น', '请先选择发货单')}</Empty></Card>}
      {sid && (
        <div className="split">
          <Card title={t('Customers on this round', 'ลูกค้าในรอบนี้', '本发货单客户')}>
            <Table rows={list.data} onRow={(r) => setCid(r.id)} rowClass={(r) => (r.id === cid ? 'on' : '')} columns={[
              { key: 'code', label: t('Customer', 'ลูกค้า', '客户') },
              { key: 'boxes', label: t('Boxes', 'กระสอบ', '包'), align: 'right' },
              { key: 'weight', label: 'kg', money: true, sum: true },
              { key: 'total', label: t('Total', 'รวม', '总价'), money: true, sum: true },
              { key: 'st', label: t('Status', 'สถานะ', '状态'), render: (r) => !r.summary ? <Badge>{t('Not posted', 'ยังไม่สรุป', '未汇总')}</Badge>
                : r.summary.paid ? <Badge tone="good">{t('Paid', 'ชำระยอดแล้ว', '已付')}</Badge> : <Badge tone="warn">{t('Posted', 'สรุปยอดแล้ว', '已汇总')}</Badge> },
            ]} />
          </Card>
          {!cid && <Card><Empty>{t('Click a customer on the left to see their boxes and post the bill', 'คลิกลูกค้าทางซ้าย เพื่อดูรายการกล่องและสรุปยอด', '点击左边客户查看明细')}</Empty></Card>}
          {d && (
            <Card title={<>{d.customer.code} · {d.currency} {posted && <Badge tone="warn">{t('Posted', 'สรุปยอดแล้ว', '已汇总')}</Badge>}</>}
              actions={<>
                <button onClick={() => setPrint(true)}><Printer size={16} aria-hidden /> {t('Print', 'ปริ้น', '打印')}</button>
                {!posted && <button className="primary" onClick={async () => { if (await run(() => api(`/shipments/${sid}/summary/${cid}`, { body: { currency } }))) reloadAll(); }}>{t('Post to balance', 'สรุปยอด', '汇总')}</button>}
                {posted && !d.summary.paid && <button onClick={async () => { if (await ask(t('Undo the posted summary for this customer?', 'ยกเลิกการสรุปยอดของลูกค้ารายนี้?', '取消此客户的汇总?'), { ok: t('Undo post', 'ยกเลิกสรุปยอด', '取消汇总') }) && await run(() => api(`/shipments/${sid}/summary/${cid}`, { method: 'DELETE' }))) reloadAll(); }}>{t('Undo post', 'ยกเลิกสรุปยอด', '取消汇总')}</button>}
                {posted && <button onClick={async () => { if (await run(() => api(`/shipments/${sid}/summary/${cid}/paid`, { body: { paid: !d.summary.paid } }))) reloadAll(); }}>{d.summary.paid ? t('Mark unpaid', 'ยังไม่จ่าย', '未付') : t('Mark paid', 'จ่ายแล้ว', '已付')}</button>}
              </>}>
              <p className="muted">{t('Rule', 'คิดตาม', '计算')}: {d.rates.calc_type} · kg {money(d.currency === 'CNY' ? d.rates.kilo_yuan : d.rates.kilo)} · m³ {money(d.currency === 'CNY' ? d.rates.cubic_yuan : d.rates.cubic)}</p>
              <Table rows={d.packings} onRow={(r) => !posted && setRateEdit({ id: r.id, rate_type: r.rate_type || '', rate: r.rate_type ? r.rate : '', weight: r.weight, cubic1: r.cubic1, cubic2: r.cubic2, cubic3: r.cubic3 })} columns={[
                { key: 'packing_code', label: t('Box', 'เลขกระสอบ', '包号') },
                { key: 'weight', label: 'kg', align: 'right' },
                { key: 'cbm', label: 'm³', render: (r) => r.cbm.toFixed(4), align: 'right' },
                { key: 'basis', label: t('Basis', 'คิดตาม', '计算'), render: (r) => <>{r.basis}{r.rate_type ? <Pencil size={12} aria-label="custom rate" style={{ marginLeft: 4 }} /> : ''}</> },
                { key: 'rate', label: t('Rate', 'เรท', '单价'), money: true },
                { key: 'price', label: t('Price', 'ราคา', '价格'), money: true, sum: true },
              ]} />
              <h3>{t('Other charges', 'ค่าใช้จ่ายอื่นๆ', '其他费用')}</h3>
              <Table rows={d.others} columns={[
                { key: 'detail', label: t('Detail', 'รายละเอียด', '详情') }, { key: 'amount', label: t('Amount', 'ยอด', '总额'), money: true, sum: true },
                { key: 'x', label: '', render: (r) => !posted && <button className="link danger" onClick={async () => { if (await run(() => api(`/r/shipment_other_amounts/${r.id}`, { method: 'DELETE' }))) reloadAll(); }}><X size={16} aria-hidden /><span className="sr-only">Remove</span></button> },
              ]} />
              {!posted && (
                <div className="row" style={{ marginTop: 8 }}>
                  <input style={{ flex: 2 }} placeholder={t('Detail (e.g. delivery fee)', 'รายละเอียด เช่น ค่าส่งในไทย', '详情')} value={other.detail} onChange={(e) => setOther({ ...other, detail: e.target.value })} />
                  <input style={{ flex: 1 }} type="number" placeholder={t('Amount', 'ยอด', '总额')} value={other.amount} onChange={(e) => setOther({ ...other, amount: e.target.value })} />
                  <button onClick={async () => { if (await run(() => api('/r/shipment_other_amounts', { body: { ...other, shipment_id: sid, customer_id: cid } }))) { setOther({ detail: '', amount: '' }); reloadAll(); } }}><Plus size={16} aria-hidden /> {t('Add', 'เพิ่ม', '加')}</button>
                </div>
              )}
              <div className="total-line"><span>{t('Shipping', 'ค่าขนส่ง', '运费')} {money(d.shipping)}</span><span>{t('Other', 'อื่นๆ', '其他')} {money(d.other)}</span><span>{t('Total', 'รวม', '总价')} {money(d.total)} {d.currency}</span></div>
            </Card>
          )}
        </div>
      )}
      {rateEdit && (
        <Modal open title={t('Edit box price', 'แก้ไขค่าน้ำหนัก', '修改运费')} onClose={() => setRateEdit(null)}
          footer={<button className="primary" onClick={async () => { if (await run(() => api(`/packing/${rateEdit.id}`, { method: 'PUT', body: rateEdit }))) { setRateEdit(null); reloadAll(); } }}>{t('Save', 'บันทึก', '保存')}</button>}>
          <Grid cols={2}>
            <Field label={t('Charge by', 'คิดตาม', '计算')}>
              <select value={rateEdit.rate_type} onChange={(e) => setRateEdit({ ...rateEdit, rate_type: e.target.value })}>
                <option value="">{t("Customer's rule", 'ตามลูกค้า', '按客户')}</option>
                <option value="kilo">{t('Per kg', 'กิโล', '公斤')}</option>
                <option value="cubic">{t('Per m³', 'คิว', '立方')}</option>
                <option value="fixed">{t('Fixed price', 'ราคาเหมา', '固定价格')}</option>
              </select>
            </Field>
            <Field label={t('Rate', 'เรท', '单价')}><input type="number" step="any" value={rateEdit.rate} disabled={!rateEdit.rate_type} onChange={(e) => setRateEdit({ ...rateEdit, rate: e.target.value })} /></Field>
            <Field label="kg"><input type="number" step="any" value={rateEdit.weight} onChange={(e) => setRateEdit({ ...rateEdit, weight: e.target.value })} /></Field>
            <Field label="cm"><div className="row" style={{ flexWrap: 'nowrap' }}>
              {(['cubic1', 'cubic2', 'cubic3'] as const).map((k) => <input key={k} type="number" step="any" value={rateEdit[k]} onChange={(e) => setRateEdit({ ...rateEdit, [k]: e.target.value })} />)}
            </div></Field>
          </Grid>
          <p className="muted">m³ = {cbm({ cubic1: Number(rateEdit.cubic1), cubic2: Number(rateEdit.cubic2), cubic3: Number(rateEdit.cubic3) }).toFixed(4)}</p>
        </Modal>
      )}
      <PrintModal open={print && !!d} onClose={() => setPrint(false)} title={t('Shipping bill', 'ใบแจ้งค่าขนส่ง', '运费单')}>{d && <ShippingBill d={d} />}</PrintModal>
    </Page>
  );
}

/** SearchShipmentForm — shipping charges across rounds, paid / unpaid. */
export function ShippingCharges() {
  const t = useT();
  const [q, setQ] = useState<any>({ paid: '', summarized: '' });
  const { data } = useApi<any[]>('/shipping-charges', q);
  const [print, setPrint] = useState<any>(null);
  return (
    <Page title={t('Search shipping charges', 'ค้นหารายการค่าน้ำหนัก', '查运费')}>
      <Card>
        <Grid cols={5}>
          <Field label={t('Customer', 'ลูกค้า', '客户')}><CustomerPick value={q.customer_id} onChange={(v) => setQ({ ...q, customer_id: v })} /></Field>
          <DateRange from={q.from} to={q.to} onChange={(from, to) => setQ({ ...q, from, to })} />
          <Field label={t('Posted?', 'การสรุปยอด', '汇总')}>
            <select value={q.summarized} onChange={(e) => setQ({ ...q, summarized: e.target.value })}>
              <option value="">{t('All', 'ทั้งหมด', '全部')}</option><option value="1">{t('Posted', 'สรุปยอดแล้ว', '已汇总')}</option><option value="0">{t('Not posted', 'ยังไม่สรุป', '未汇总')}</option>
            </select>
          </Field>
          <Field label={t('Paid?', 'การจ่ายเงิน', '付款')}>
            <select value={q.paid} onChange={(e) => setQ({ ...q, paid: e.target.value })}>
              <option value="">{t('All', 'ทั้งหมด', '全部')}</option><option value="1">{t('Paid', 'จ่ายแล้ว', '已付')}</option><option value="0">{t('Unpaid', 'ยังไม่จ่าย', '未付')}</option>
            </select>
          </Field>
        </Grid>
      </Card>
      <Table rowKey="k" rows={data?.map((r) => ({ ...r, k: `${r.shipment_id}-${r.customer_id}` }))} onRow={async (r) => setPrint(await api(`/shipments/${r.shipment_id}/summary/${r.customer_id}`))} columns={[
        { key: 'shipment_code', label: t('Round', 'รอบ', '发货单') }, { key: 'shipment_date', label: t('Date', 'วันที่', '日期') },
        { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') }, { key: 'boxes', label: t('Boxes', 'กระสอบ', '包'), align: 'right' },
        { key: 'total', label: t('Total', 'รวม', '总价'), money: true, sum: true }, { key: 'currency', label: '' },
        { key: 'st', label: t('Status', 'สถานะ', '状态'), render: (r) => r.pending ? <Badge>{t('Not posted', 'ยังไม่สรุป', '未汇总')}</Badge> : r.paid ? <Badge tone="good">{t('Paid', 'จ่ายแล้ว', '已付')}</Badge> : <Badge tone="warn">{t('Unpaid', 'ยังไม่จ่าย', '未付')}</Badge> },
      ]} />
      <PrintModal open={!!print} onClose={() => setPrint(null)} title={t('Shipping bill', 'ใบแจ้งค่าขนส่ง', '运费单')}>{print && <ShippingBill d={print} />}</PrintModal>
    </Page>
  );
}

/** ViewPackingListReport — packing list of a round grouped by box with contents (for customs / the truck). */
export function ShipmentReport() {
  const t = useT();
  const { id } = useParams();
  const { lang } = useLang();
  const { data } = useApi<any>(`/shipments/${id}/report`);
  if (!data) return null;
  const none = t('Not specified', 'ไม่ระบุ', '未指定');
  // one category per sack: the one with the largest quantity in it
  const catOf = (b: any) => { const c = [...(b.contents || [])].sort((x: any, y: any) => y.qty - x.qty)[0]; return c ? pick(c, lang) || none : none; };
  const groups = new Map<string, { cat: string; sacks: number; weight: number; cbm: number }>();
  for (const b of data.boxes) {
    const cat = catOf(b);
    const g = groups.get(cat) || { cat, sacks: 0, weight: 0, cbm: 0 };
    g.sacks++; g.weight += Number(b.weight) || 0; g.cbm += b.cbm || 0;
    groups.set(cat, g);
  }
  const summary = [...groups.values()].sort((a, b) => b.sacks - a.sacks);
  const custMap = new Map<string, { code: string; boxes: any[]; weight: number; cbm: number }>();
  for (const b of data.boxes) {
    const c = custMap.get(b.customer_code) || { code: b.customer_code, boxes: [] as any[], weight: 0, cbm: 0 };
    c.boxes.push(b); c.weight += Number(b.weight) || 0; c.cbm += b.cbm || 0;
    custMap.set(b.customer_code, c);
  }
  const byCustomer = [...custMap.values()].sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const boxCodes = (c: { boxes: any[] }) => c.boxes.map((b) => b.packing_code).join(', ');
  const catsOf = (c: { boxes: any[] }) => { const m = new Map<string, number>(); c.boxes.forEach((b) => m.set(catOf(b), (m.get(catOf(b)) || 0) + 1)); return [...m].map(([k, n]) => `${k} ×${n}`).join(', '); };
  const plain = (s: string) => s.replace(/[ ⁠]/g, (c) => (c === ' ' ? ' ' : ''));
  const exportXlsx = () => downloadXlsx(`packing-list-${data.shipment.code}`, [
    { name: plain(t('Summary', 'สรุป', '汇总')), widths: [28, 12, 12, 12], rows: [
      [`Packing list ${data.shipment.code}`, data.shipment.date],
      [],
      [plain(t('Category', 'ประเภทสินค้า', '产品分类')), plain(t('Sacks', 'กระสอบ', '包')), 'kg', 'm³'],
      ...summary.map((g) => [plain(g.cat), g.sacks, Math.round(g.weight * 100) / 100, Math.round(g.cbm * 10000) / 10000]),
      [plain(t('Total', 'รวม', '合计')), data.boxes.length, Math.round(sum(data.boxes, 'weight') * 100) / 100, Math.round(sum(data.boxes, 'cbm') * 10000) / 10000],
    ] },
    { name: plain(t('By customer', 'ตามลูกค้า', '按客户')), widths: [14, 10, 12, 12, 30, 60], rows: [
      [plain(t('Customer', 'ลูกค้า', '客户')), plain(t('Sacks', 'กระสอบ', '包')), 'kg', 'm³', plain(t('Category', 'ประเภทสินค้า', '产品分类')), plain(t('Sack nos.', 'เลขกระสอบ', '包号'))],
      ...byCustomer.map((c) => [c.code, c.boxes.length, Math.round(c.weight * 100) / 100, Math.round(c.cbm * 10000) / 10000, plain(catsOf(c)), boxCodes(c)]),
    ] },
    { name: 'Packing list', widths: [7, 7, 14, 14, 10, 16, 10, 22, 40], rows: [
      ['CTN', 'No', plain(t('Box', 'เลขกระสอบ', '包号')), plain(t('Customer', 'ลูกค้า', '客户')), 'kg', 'cm', 'm³', plain(t('Category', 'ประเภทสินค้า', '产品分类')), plain(t('Contents', 'สินค้า', '产品'))],
      ...data.boxes.map((b: any) => [b.ctn, b.no, b.packing_code, b.customer_code, Number(b.weight) || 0, `${b.cubic1}×${b.cubic2}×${b.cubic3}`, Math.round(b.cbm * 10000) / 10000, plain(catOf(b)),
        plain(b.contents.map((c: any) => `${pick(c, lang) || '?'} ×${c.qty}`).join(', '))]),
    ] },
  ]);
  return (
    <Page back="/shipments" title={`${t('Packing list', 'รายงาน Packing list', '装箱单')} · ${data.shipment.code}`} actions={<>
      <button onClick={exportXlsx}><FileSpreadsheet size={16} aria-hidden /> {t('Export Excel', 'Export Excel', '导出 Excel')}</button>
      <button onClick={() => window.print()}><Printer size={16} aria-hidden /> {t('Print', 'ปริ้น', '打印')}</button></>}>
      <div className="card print-area doc">
        <h2>Packing list {data.shipment.code} · {data.shipment.date}</h2>
        <h3>{t('Summary by category', 'สรุปตามประเภทสินค้า', '按产品分类汇总')}</h3>
        <table style={{ maxWidth: 640, marginBottom: 20 }}>
          <thead><tr><th>{t('Category', 'ประเภทสินค้า', '产品分类')}</th><th style={{ textAlign: 'right' }}>{t('Sacks', 'กระสอบ', '包')}</th><th style={{ textAlign: 'right' }}>kg</th><th style={{ textAlign: 'right' }}>m³</th></tr></thead>
          <tbody>{summary.map((g) => (
            <tr key={g.cat}><td>{g.cat}</td><td style={{ textAlign: 'right' }}>{g.sacks}</td><td style={{ textAlign: 'right' }}>{money(g.weight)}</td><td style={{ textAlign: 'right' }}>{g.cbm.toFixed(4)}</td></tr>
          ))}</tbody>
          <tfoot><tr><td>{t('Total', 'รวม', '合计')}</td><td style={{ textAlign: 'right' }}>{data.boxes.length}</td><td style={{ textAlign: 'right' }}>{money(sum(data.boxes, 'weight'))}</td><td style={{ textAlign: 'right' }}>{sum(data.boxes, 'cbm').toFixed(4)}</td></tr></tfoot>
        </table>
        <h3>{t('Summary by customer', 'สรุปตามลูกค้า', '按客户汇总')}</h3>
        <table style={{ marginBottom: 20 }}>
          <thead><tr><th>{t('Customer', 'ลูกค้า', '客户')}</th><th style={{ textAlign: 'right' }}>{t('Sacks', 'กระสอบ', '包')}</th><th style={{ textAlign: 'right' }}>kg</th><th style={{ textAlign: 'right' }}>m³</th><th>{t('Category', 'ประเภทสินค้า', '产品分类')}</th><th>{t('Sack nos.', 'เลขกระสอบ', '包号')}</th></tr></thead>
          <tbody>{byCustomer.map((c) => (
            <tr key={c.code}><td><b>{c.code}</b></td><td style={{ textAlign: 'right' }}>{c.boxes.length}</td><td style={{ textAlign: 'right' }}>{money(c.weight)}</td><td style={{ textAlign: 'right' }}>{c.cbm.toFixed(4)}</td><td>{catsOf(c)}</td><td>{boxCodes(c)}</td></tr>
          ))}</tbody>
        </table>
        <h3>{t('All sacks', 'รายการกระสอบทั้งหมด', '全部包')}</h3>
        <table>
          <thead><tr><th>CTN</th><th>No</th><th>{t('Box', 'เลขกระสอบ', '包号')}</th><th>{t('Customer', 'ลูกค้า', '客户')}</th><th>kg</th><th>cm</th><th>m³</th><th>{t('Category', 'ประเภทสินค้า', '产品分类')}</th><th>{t('Contents', 'สินค้า', '产品')}</th></tr></thead>
          <tbody>{data.boxes.map((b: any) => (
            <tr key={b.id}><td>{b.ctn}</td><td>{b.no}</td><td>{b.packing_code}</td><td>{b.customer_code}</td><td>{b.weight}</td><td>{b.cubic1}×{b.cubic2}×{b.cubic3}</td><td>{b.cbm.toFixed(4)}</td>
              <td>{catOf(b)}</td><td>{b.contents.map((c: any) => `${pick(c, lang) || '?'} ×${c.qty}`).join(', ')}</td></tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={4}>{data.boxes.length} {t('boxes', 'กระสอบ', '包')}</td><td>{money(sum(data.boxes, 'weight'))}</td><td /><td>{sum(data.boxes, 'cbm').toFixed(4)}</td><td colSpan={2} /></tr></tfoot>
        </table>
      </div>
    </Page>
  );
}
