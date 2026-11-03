import { useMemo, useState } from 'react';
import { api, useApi, useApp, useCan, useT, money, monthStart, today } from '../lib';
import { Page, Card, Grid, Field, Table, BankPick, DateRange, Badge, Modal, Stat, PrintModal, useAction, useAsk } from '../ui';
import { Printer, Check, Plus, RefreshCw } from 'lucide-react';
import { CrudPage } from './Crud';

/** ViewBankStatementForm */
export function BankStatements() {
  const t = useT();
  const can = useCan();
  const { lookups } = useApp();
  const [q, setQ] = useState<any>({ bank_id: lookups.banks[0]?.id || null, from: monthStart(), to: today(), q: '', amount: '', unmatched: '' });
  const { data, reload } = useApi<any>('/bank/statements', q);
  const [edit, setEdit] = useState<any>(null);
  const [print, setPrint] = useState(false);
  const { run } = useAction();
  const { ask } = useAsk();
  const save = async () => {
    const body = { ...edit, bank_id: q.bank_id, income: edit.kind === 'in' ? edit.amount : 0, expense: edit.kind === 'out' ? edit.amount : 0 };
    if (await run(() => (edit.id ? api(`/r/bank_statements/${edit.id}`, { method: 'PUT', body }) : api('/r/bank_statements', { body })))) { setEdit(null); reload(); }
  };
  const cols = [
    { key: 'date', label: t('Date', 'วันที่', '日期') },
    { key: 'detail', label: t('Detail', 'รายละเอียด', '详情') },
    { key: 'bank_detail', label: t('From bank', 'รายละเอียดจากธนาคาร', '银行详情') },
    { key: 'income', label: t('In', 'เงินเข้า', '收入'), money: true, sum: true },
    { key: 'expense', label: t('Out', 'เงินออก', '支出'), money: true, sum: true },
    { key: 'balance', label: t('Balance', 'คงเหลือ', '余额'), money: true },
    { key: 'customer_code', label: t('Matched to', 'ลูกค้า', '客户'), render: (r: any) => r.customer_code ? <Badge tone="good">{r.customer_code}</Badge> : r.source ? <Badge tone="info">{r.source}</Badge> : r.income > 0 ? <Badge tone="warn">?</Badge> : null },
    { key: 'created_by', label: t('By', 'โดย', '人') },
  ];
  return (
    <Page title={t('Bank statements', 'รายการเดินบัญชี', '银行流水')} actions={<>
      <button onClick={() => setPrint(true)}><Printer size={16} aria-hidden /> {t('Print', 'ปริ้น', '打印')}</button>
      <button className="primary" disabled={!q.bank_id} onClick={() => setEdit({ date: today(), kind: 'in', amount: '' })}><Plus size={16} aria-hidden /> {t('Add line', 'เพิ่มรายการ', '新增')}</button></>}>
      <Card>
        <Grid cols={6}>
          <Field label={t('Account', 'บัญชี', '帐户')}><BankPick value={q.bank_id} onChange={(v) => setQ({ ...q, bank_id: v })} activeOnly={false} /></Field>
          <DateRange from={q.from} to={q.to} onChange={(from, to) => setQ({ ...q, from, to })} />
          <Field label={t('Find amount', 'ค้นหาจากยอด', '金额')}><input type="number" value={q.amount} onChange={(e) => setQ({ ...q, amount: e.target.value })} /></Field>
          <Field label={t('Find text', 'ค้นหาจากรายละเอียด', '详情')}><input value={q.q} onChange={(e) => setQ({ ...q, q: e.target.value })} /></Field>
          <Field label=" "><label className="row"><input type="checkbox" checked={q.unmatched === '1'} onChange={(e) => setQ({ ...q, unmatched: e.target.checked ? '1' : '' })} /> {t('Only unmatched money in', 'เฉพาะยอดที่หาเจ้าของไม่เจอ', '只看未匹配')}</label></Field>
        </Grid>
      </Card>
      {data?.bank && (
        <div className="stats">
          <Stat label={t('Opening', 'ยอดยกมา', '期初')} value={money(data.opening)} />
          <Stat label={t('Closing', 'ยอดคงเหลือ', '期末')} value={money(data.closing)} />
          <Stat label={t('Currency', 'หน่วยเงิน', '币种')} value={data.bank.is_thai ? 'THB' : 'CNY'} />
        </div>
      )}
      <Table rows={data?.rows} columns={[...cols, { key: 'x', label: '', render: (r: any) => !r.payment_id && !r.source && can.verify('bank_statement') && <span className="row" onClick={(e) => e.stopPropagation()}>
        <button className="link" onClick={() => setEdit({ ...r, kind: r.income ? 'in' : 'out', amount: r.income || r.expense })}>{t('Edit', 'แก้ไข', '修改')}</button>
        <button className="link danger" onClick={async () => { if (await ask(t('Delete this item?', 'ต้องการลบรายการนี้?', '你确定要删除吗?'), { danger: true }) && await run(() => api(`/r/bank_statements/${r.id}`, { method: 'DELETE' }))) reload(); }}>{t('Delete', 'ลบ', '删除')}</button></span> }]} />
      {edit && (
        <Modal open title={t('Statement line', 'รายการเดินบัญชี', '银行流水')} onClose={() => setEdit(null)} footer={<button className="primary" onClick={save}>{t('Save', 'บันทึก', '保存')}</button>}>
          <Grid cols={2}>
            <Field label={t('Date', 'วันที่', '日期')}><input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label={t('Type', 'ประเภท', '类别')}>
              <div className="radios">
                <label><input type="radio" checked={edit.kind === 'in'} onChange={() => setEdit({ ...edit, kind: 'in' })} /> {t('Money in', 'เงินเข้า', '收入')}</label>
                <label><input type="radio" checked={edit.kind === 'out'} onChange={() => setEdit({ ...edit, kind: 'out' })} /> {t('Money out', 'เงินออก', '支出')}</label>
              </div>
            </Field>
            <Field label={t('Amount', 'ยอดเงิน', '总额')}><input type="number" step="any" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field>
            <Field label={t('Detail', 'รายละเอียด', '详情')}><input value={edit.detail || ''} onChange={(e) => setEdit({ ...edit, detail: e.target.value })} /></Field>
            <Field label={t('Bank detail', 'รายละเอียดจากธนาคาร', '银行详情')} wide><input value={edit.bank_detail || ''} onChange={(e) => setEdit({ ...edit, bank_detail: e.target.value })} /></Field>
          </Grid>
        </Modal>
      )}
      <PrintModal open={print} onClose={() => setPrint(false)} title={t('Bank statement', 'รายการเดินบัญชี', '银行流水')}>
        <div className="doc">
          <h2>{data?.bank?.name} {data?.bank?.account_number} · {q.from} → {q.to}</h2>
          <p>{t('Opening', 'ยอดยกมา', '期初')}: {money(data?.opening)} · {t('Closing', 'ยอดคงเหลือ', '期末')}: {money(data?.closing)}</p>
          <table><thead><tr>{cols.slice(0, 6).map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>{data?.rows.map((r: any) => <tr key={r.id}><td>{r.date}</td><td>{r.detail}</td><td>{r.bank_detail}</td><td>{money(r.income)}</td><td>{money(r.expense)}</td><td>{money(r.balance)}</td></tr>)}</tbody></table>
        </div>
      </PrintModal>
    </Page>
  );
}

// ---------- statement import (GetBankStatementForm)
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function fixYear(y: number) {
  if (y < 100) y = y > 50 ? 2500 + y : 2000 + y; // 66 → BE 2566, 23 → 2023
  if (y > 2400) y -= 543;
  return y;
}
export function parseDate(s: string): string | null {
  s = (s || '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${fixYear(+m[1])}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return `${fixYear(+m[3])}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\s*([^\s\d]+)\s*(\d{2,4})/);
  if (m) {
    const mi = TH_MONTHS.indexOf(m[2]) >= 0 ? TH_MONTHS.indexOf(m[2]) : EN_MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${fixYear(+m[3])}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}
const parseNum = (s: string) => {
  const c = (s || '').replace(/[,\s฿¥]|THB|CNY|RMB/gi, '');
  if (!c || !/^[-+(]?\d*\.?\d+\)?$/.test(c)) return null;
  const n = Number(c.replace(/[()]/g, ''));
  return c.startsWith('(') ? -n : n;
};
function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
  if (line.includes(',')) {
    const out: string[] = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim());
    // a CSV whose numbers use thousands commas inside quotes is handled above; unquoted "1,234.00" splits wrongly, so prefer tabs when possible
    return out;
  }
  return line.split(/\s{2,}/).map((x) => x.trim());
}
type Mapping = { date: number; detail: number; withdraw: number; deposit: number; amount: number };
function guessMapping(rows: string[][]): Mapping {
  const n = Math.max(...rows.map((r) => r.length));
  const score = (fn: (s: string) => boolean) => Array.from({ length: n }, (_, i) => rows.filter((r) => fn(r[i] || '')).length);
  const dateS = score((s) => !!parseDate(s));
  const numS = score((s) => parseNum(s) !== null);
  const textS = Array.from({ length: n }, (_, i) => rows.reduce((a, r) => a + ((r[i] || '').length > 0 && parseNum(r[i]) === null && !parseDate(r[i]) ? (r[i] || '').length : 0), 0));
  const date = dateS.indexOf(Math.max(...dateS));
  const numericCols = numS.map((s, i) => (s > 0 && i !== date ? i : -1)).filter((i) => i >= 0);
  const detail = textS.indexOf(Math.max(...textS));
  if (numericCols.length >= 3) {
    const last3 = numericCols.slice(-3);
    return { date, detail, withdraw: last3[0], deposit: last3[1], amount: -1 };
  }
  return { date, detail, withdraw: -1, deposit: -1, amount: numericCols[0] ?? -1 };
}

export function BankImport() {
  const t = useT();
  const [bank, setBank] = useState<any>(null);
  const [text, setText] = useState('');
  const [skip, setSkip] = useState(0);
  const [map, setMap] = useState<Mapping | null>(null);
  const [result, setResult] = useState<any>(null);
  const { run, busy } = useAction();
  const raw = useMemo(() => text.split(/\r?\n/).filter((l) => l.trim()).slice(skip).map(splitLine), [text, skip]);
  const cols = Math.max(0, ...raw.map((r) => r.length));
  const m = map || (raw.length ? guessMapping(raw) : null);
  const rows = useMemo(() => !m ? [] : raw.map((r, i) => {
    const date = parseDate(r[m.date] || '');
    let income = 0; let expense = 0;
    if (m.amount >= 0) { const a = parseNum(r[m.amount] || '') || 0; if (a >= 0) income = a; else expense = -a; }
    else { income = Math.abs(parseNum(r[m.deposit] || '') || 0); expense = Math.abs(parseNum(r[m.withdraw] || '') || 0); }
    return { i, date, income, expense, bank_detail: r[m.detail] || '', ok: !!date && (income > 0 || expense > 0) };
  }), [raw, m]);
  const colSel = (k: keyof Mapping, allowNone = false) => (
    <select value={m?.[k] ?? -1} onChange={(e) => setMap({ ...(m as Mapping), [k]: Number(e.target.value) })}>
      {allowNone && <option value={-1}>—</option>}
      {Array.from({ length: cols }, (_, i) => <option key={i} value={i}>{i + 1}: {(raw[0]?.[i] || '').slice(0, 24)}</option>)}
    </select>
  );
  const save = async () => {
    const r = await run(() => api('/bank/import', { body: { bank_id: bank, rows: rows.filter((x) => x.ok) } }), false);
    if (r) { setResult(r); setText(''); setMap(null); }
  };
  return (
    <Page title={t('Import bank statement', 'ดึงยอดธนาคาร', '拉银行余额')}>
      <Card>
        <p className="muted">{t('Copy the rows from your internet-banking statement (KBANK, SCB, KTB, BBL, TMB, UOB, ICBC, ABC… or a CSV export) and paste them below. Check the column mapping, then save. Lines already imported are skipped.',
          'คัดลอกรายการจากอินเทอร์เน็ตแบงก์กิ้งแล้ววางด้านล่าง ตรวจสอบคอลัมน์ แล้วกดบันทึก รายการที่เคยดึงแล้วจะถูกข้าม', '从网银复制流水粘贴到下面，检查列后保存，已导入的会跳过')}</p>
        <Grid cols={3}>
          <Field label={t('Account', 'บัญชี', '帐户')}><BankPick value={bank} onChange={setBank} /></Field>
          <Field label={t('Skip first lines (headers)', 'ข้ามบรรทัดแรก', '跳过前几行')}><input type="number" min={0} value={skip} onChange={(e) => { setSkip(Number(e.target.value)); setMap(null); }} /></Field>
          <Field label={t('Or load a file', 'หรือเลือกไฟล์', '或选择文件')}><input type="file" accept=".csv,.txt,.tsv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setMap(null); } }} /></Field>
          <Field label={t('Paste here', 'วางข้อมูล', '粘贴')} wide><textarea rows={8} value={text} onChange={(e) => { setText(e.target.value); setMap(null); setResult(null); }} /></Field>
        </Grid>
        {result && <p><Badge tone="good">{result.added} {t('added', 'เพิ่มแล้ว', '已添加')}</Badge> <Badge>{result.skipped} {t('skipped', 'ข้าม', '跳过')}</Badge></p>}
      </Card>
      {raw.length > 0 && m && (
        <>
          <Card title={t('Columns', 'คอลัมน์', '列')}>
            <Grid cols={5}>
              <Field label={t('Date', 'วันที่', '日期')}>{colSel('date')}</Field>
              <Field label={t('Description', 'รายละเอียด', '详情')}>{colSel('detail')}</Field>
              <Field label={t('Withdrawal', 'ถอน', '支出')}>{colSel('withdraw', true)}</Field>
              <Field label={t('Deposit', 'ฝาก', '收入')}>{colSel('deposit', true)}</Field>
              <Field label={t('Signed amount (+/−)', 'ยอด (+/−)', '金额 (+/−)')} hint={t('use instead of withdrawal/deposit', 'ใช้แทนถอน/ฝาก', '代替收支')}>{colSel('amount', true)}</Field>
            </Grid>
          </Card>
          <Card title={`${rows.filter((r) => r.ok).length} / ${rows.length} ${t('lines ready', 'รายการพร้อมบันทึก', '行准备好')}`}
            actions={<button className="primary" disabled={!bank || busy || !rows.some((r) => r.ok)} onClick={save}>{t('Save to statement', 'บันทึก', '保存')}</button>}>
            <Table rowKey="i" rows={rows} rowClass={(r) => (r.ok ? '' : 'dim')} columns={[
              { key: 'date', label: t('Date', 'วันที่', '日期'), render: (r) => r.date || <Badge tone="bad">?</Badge> },
              { key: 'bank_detail', label: t('Description', 'รายละเอียด', '详情') },
              { key: 'income', label: t('In', 'เข้า', '收入'), money: true, sum: true },
              { key: 'expense', label: t('Out', 'ออก', '支出'), money: true, sum: true },
            ]} />
          </Card>
        </>
      )}
    </Page>
  );
}

/** TotalMoneyForm */
export function BankTotal() {
  const t = useT();
  const { data, reload } = useApi<any>('/bank/total');
  const cols = [
    { key: 'name', label: t('Account', 'บัญชี', '帐户') },
    { key: 'account_number', label: t('Number', 'เลขบัญชี', '帐号') },
    { key: 'account_name', label: t('Owner', 'ชื่อบัญชี', '帐户名') },
    { key: 'is_cash', label: '', render: (r: any) => r.is_cash ? <Badge>{t('Cash', 'เงินสด', '现金')}</Badge> : null },
    { key: 'balance', label: t('Balance', 'ยอดคงเหลือ', '余额'), money: true, sum: true },
  ];
  return (
    <Page title={t('Total money', 'สรุปยอดเงินทั้งหมด', '总余额')} actions={<button onClick={reload}><RefreshCw size={16} aria-hidden /><span className="sr-only">Refresh</span></button>}>
      {data && (<>
        <div className="stats">
          <Stat label={t('All Thai accounts (THB)', 'เงินไทยทั้งหมด', '泰铢')} value={money(data.totalThb)} />
          <Stat label={t('All China accounts (CNY)', 'เงินจีนทั้งหมด', '人民币')} value={money(data.totalCny)} />
          <Stat label={t('Customers hold (THB)', 'ลูกค้าคงเหลือเงินบาท', '客户泰铢')} value={money(data.customerThb)} />
          <Stat label={t('Customers hold (CNY)', 'ลูกค้าคงเหลือเงินหยวน', '客户人民币')} value={money(data.customerCny)} />
        </div>
        <div className="split">
          <Card title={t('Thailand (THB)', 'เงินไทย', '泰国')}><Table rows={data.banks.filter((b: any) => b.is_thai)} columns={cols} /></Card>
          <Card title={t('China (CNY)', 'เงินจีน', '中国')}><Table rows={data.banks.filter((b: any) => !b.is_thai)} columns={cols} /></Card>
        </div>
      </>)}
    </Page>
  );
}

/** BankInfoForm */
export function BankAccounts() {
  const t = useT();
  return (
    <CrudPage resource="banks" title={t('Bank accounts', 'ข้อมูลบัญชีธนาคาร', '银行信息')} canDelete={false}
      fields={[
        { key: 'name', label: t('Bank name', 'ชื่อธนาคาร', '银行'), required: true },
        { key: 'nickname', label: t('Nickname', 'ชื่อย่อ', '简称') },
        { key: 'account_name', label: t('Account name', 'ชื่อบัญชี', '帐户名') },
        { key: 'account_number', label: t('Account number', 'เลขบัญชี', '帐号') },
        { key: 'opening_balance', label: t('Opening balance', 'ยอดเริ่ม', '期初余额'), type: 'number', default: 0 },
        { key: 'is_thai', label: t('Account currency', 'บัญชีไทย หรือ จีน', '帐户币种'), type: 'radio', required: true,
          options: [{ value: 1, label: t('Thai (THB)', 'บัญชีไทย (บาท)', '泰国 (泰铢)') }, { value: 0, label: t('China (CNY)', 'บัญชีจีน (หยวน)', '中国 (人民币)') }] },
        { key: 'is_cash', label: t('Cash box (no bank statement)', 'เงินสด', '现金'), type: 'bool', default: 0 },
        { key: 'customer_visible', label: t('Customers can see it', 'ให้ลูกค้าเห็น', '客户可见'), type: 'bool', default: 0 },
        { key: 'is_active', label: t('Active', 'เปิดใช้งาน', '启用'), type: 'bool', default: 1 },
      ]}
      columns={[
        { key: 'name', label: t('Bank', 'ธนาคาร', '银行') },
        { key: 'account_name', label: t('Account name', 'ชื่อบัญชี', '帐户名') },
        { key: 'account_number', label: t('Number', 'เลขบัญชี', '帐号') },
        { key: 'is_thai', label: t('Currency', 'หน่วยเงิน', '币种'), render: (r) => r.is_thai ? 'THB' : 'CNY' },
        { key: 'is_cash', label: t('Cash', 'เงินสด', '现金'), render: (r) => r.is_cash ? <Check size={16} aria-label="yes" /> : '' },
        { key: 'opening_balance', label: t('Opening', 'ยอดเริ่ม', '期初'), money: true },
        { key: 'customer_visible', label: t('Customer sees', 'ลูกค้าเห็น', '客户可见'), render: (r) => r.customer_visible ? <Check size={16} aria-label="yes" /> : '' },
        { key: 'is_active', label: t('Status', 'สถานะ', '状态'), render: (r) => r.is_active ? <Badge tone="good">{t('Active', 'ใช้งาน', '启用')}</Badge> : <Badge>{t('Closed', 'ปิดใช้งาน', '停用')}</Badge> },
      ]} />
  );
}

/** AccountTransferForm */
export function AccountTransfers() {
  const t = useT();
  return (
    <CrudPage resource="account_transfers" title={t('Transfers between accounts', 'โอนเงินระหว่างบัญชี', '帐户之间转移')} dateFilter checkKey="account_transfer"
      filters={[{ key: 'from_bank_id', label: t('From', 'จากบัญชี', '从帐户'), type: 'bank' }, { key: 'to_bank_id', label: t('To', 'ไปบัญชี', '到帐户'), type: 'bank' }]}
      fields={[
        { key: 'date', label: t('Date', 'วันที่', '日期'), type: 'date', required: true, default: today() },
        { key: 'amount', label: t('Amount', 'ยอดเงิน', '总额'), type: 'number', required: true },
        { key: 'from_bank_id', label: t('From account', 'จากบัญชี', '从帐户'), type: 'bank', required: true },
        { key: 'to_bank_id', label: t('To account', 'ไปบัญชี', '到帐户'), type: 'bank', required: true },
        { key: 'bank_fee', label: t('Bank fee', 'ค่าธรรมเนียมธนาคาร', '手续费'), type: 'number', default: 0 },
        { key: 'company_cost', label: t('Company cost', 'ค่าใช้จ่ายบริษัท', '公司成本'), type: 'number', default: 0 },
        { key: 'remark', label: t('Remark', 'หมายเหตุ', '备注'), wide: true },
      ]}
      columns={[
        { key: 'date', label: t('Date', 'วันที่', '日期') },
        { key: 'from_bank', label: t('From', 'จากบัญชี', '从') },
        { key: 'to_bank', label: t('To', 'ไปบัญชี', '到') },
        { key: 'amount', label: t('Amount', 'ยอด', '总额'), money: true, sum: true },
        { key: 'bank_fee', label: t('Fee', 'ค่าธรรมเนียม', '手续费'), money: true, sum: true },
        { key: 'remark', label: t('Remark', 'หมายเหตุ', '备注') },
        { key: 'created_by', label: t('By', 'โดย', '人') },
      ]} />
  );
}
