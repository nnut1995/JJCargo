// Generic list + add/edit/delete (+ check) page for simple tables served by /api/r/:resource.
import { useState, type ReactNode } from 'react';
import { api, useApi, useApp, useCan, useT, today } from '../lib';
import { Page, Card, Grid, Field, Table, Modal, Badge, BankPick, CustomerPick, ShipmentPick, DateRange, CheckedFilter, useAction, useToast, type Col, useAsk } from '../ui';
import { Check, Plus } from 'lucide-react';

export interface FieldDef {
  key: string;
  label: ReactNode;
  type?: 'text' | 'number' | 'date' | 'bank' | 'bankThai' | 'bankChina' | 'select' | 'radio' | 'bool' | 'textarea' | 'customer' | 'shipment';
  options?: { value: any; label: string }[];
  required?: boolean;
  default?: any;
  wide?: boolean;
}

export function FieldInput({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  switch (f.type) {
    case 'number': return <input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'date': return <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'bank': return <BankPick value={value} onChange={onChange} />;
    case 'bankThai': return <BankPick value={value} onChange={onChange} thai />;
    case 'bankChina': return <BankPick value={value} onChange={onChange} thai={false} />;
    case 'customer': return <CustomerPick value={value} onChange={onChange} placeholder="—" />;
    case 'shipment': return <ShipmentPick value={value} onChange={onChange} />;
    case 'bool': return <div className="radios"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? 1 : 0)} /></div>;
    case 'radio': return (
      <div className="radios">
        {f.options?.map((o) => <label key={String(o.value)}><input type="radio" checked={value !== undefined && value !== null && String(value) === String(o.value)} onChange={() => onChange(o.value)} /> {o.label}</label>)}
      </div>
    );
    case 'textarea': return <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'select': return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
        <option value="">—</option>
        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    default: return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function EditModal({ open, title, fields, value, onClose, onSave, busy, extra }: {
  open: boolean; title: ReactNode; fields: FieldDef[]; value: any; onClose: () => void; onSave: (v: any) => void; busy?: boolean; extra?: ReactNode;
}) {
  const t = useT();
  // mount this component only while open (parent renders it conditionally) so state starts from `value`
  const [v, setV] = useState<any>(value);
  return (
    <Modal open={open} title={title} onClose={onClose}
      footer={<><button onClick={onClose}>{t('Cancel', 'ยกเลิก', '取消')}</button><button className="primary" disabled={busy} onClick={() => onSave(v)}>{t('Save', 'บันทึก', '保存')}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
        <Grid cols={2}>
          {fields.map((f) => (
            <Field key={f.key} label={<>{f.label}{f.required ? ' *' : ''}</>} wide={f.wide || f.type === 'textarea'}>
              <FieldInput f={f} value={v?.[f.key]} onChange={(x) => setV((o: any) => ({ ...o, [f.key]: x }))} />
            </Field>
          ))}
        </Grid>
        {extra}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function CrudPage({ resource, title, columns, fields, fixed = {}, dateFilter, search, checkKey, filters, onChanged, actions, canDelete = true }: {
  resource: string; title: ReactNode; columns: Col[]; fields: FieldDef[]; fixed?: Record<string, any>; dateFilter?: boolean; search?: boolean;
  checkKey?: string; filters?: FieldDef[]; onChanged?: () => void; actions?: ReactNode; canDelete?: boolean;
}) {
  const t = useT();
  const can = useCan();
  const { reloadLookups } = useApp();
  const [q, setQ] = useState<Record<string, any>>(dateFilter ? { from: today().slice(0, 8) + '01', to: today() } : {});
  const { data, reload } = useApi<any[]>(`/r/${resource}`, { ...q, ...fixed });
  const [edit, setEdit] = useState<any>(null);
  const [sel, setSel] = useState<Set<any>>(new Set());
  const { run, busy } = useAction();
  const { ask } = useAsk();
  const toast = useToast();
  const after = async () => { await reload(); onChanged?.(); if (['banks', 'styles', 'style_units', 'shipments', 'expense_types', 'supplier_banks', 'roles'].includes(resource)) await reloadLookups(); };
  const save = async (v: any) => {
    const missing = fields.find((f) => f.required && (v[f.key] === undefined || v[f.key] === null || v[f.key] === ''));
    if (missing) { toast(`${t('Please fill', 'กรุณาระบุ', '请填写')}: ${typeof missing.label === 'string' ? missing.label : missing.key}`, 'err'); return; }
    const body = { ...v, ...fixed };
    const ok = await run(() => (v.id ? api(`/r/${resource}/${v.id}`, { method: 'PUT', body }) : api(`/r/${resource}`, { body })));
    if (ok) { setEdit(null); await after(); }
  };
  const del = async (row: any) => {
    if (!(await ask(t('Delete this item?', 'แน่ใจหรือเปล่าว่าต้องการลบออก?', '你确定要删除吗?'), { danger: true }))) return;
    if (await run(() => api(`/r/${resource}/${row.id}`, { method: 'DELETE' }), t('Deleted', 'ลบแล้ว', '已删除'))) await after();
  };
  const check = async () => {
    if (!sel.size || !(await ask(`${t('Mark selected as checked?', 'ยืนยันว่าตรวจยอดแล้ว?', '你确定已经检查 ?')} (${sel.size})`, { ok: t('Mark as checked', 'ตรวจแล้ว', '校验') }))) return;
    if (await run(() => api(`/r/${resource}/check`, { body: { ids: [...sel] } }))) { setSel(new Set()); await after(); }
  };
  const cols: Col[] = [
    ...columns,
    ...(checkKey ? [{ key: 'checked', label: t('Checked', 'ตรวจสอบ', '校验'), render: (r: any) => r.checked ? <Badge tone="good"><Check size={12} aria-hidden /> {r.checked_by}</Badge> : <Badge tone="warn">{t('Waiting', 'รอตรวจ', '待校验')}</Badge> }] : []),
    {
      key: '_act', label: '', render: (r: any) => (
        <span className="row" onClick={(e) => e.stopPropagation()}>
          {!r.checked && <button className="link" onClick={() => setEdit(r)}>{t('Edit', 'แก้ไข', '修改')}</button>}
          {canDelete && !r.checked && <button className="link danger" onClick={() => del(r)}>{t('Delete', 'ลบ', '删除')}</button>}
        </span>
      ),
    },
  ];
  const blank = Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default]));
  return (
    <Page title={title} actions={<>{actions}{checkKey && can.verify(checkKey) && <button disabled={!sel.size} onClick={check}><Check size={16} aria-hidden /> {t('Check selected', 'ตรวจแล้ว', '校验')} ({sel.size})</button>}
      <button className="primary" onClick={() => setEdit({ ...blank })}><Plus size={16} aria-hidden /> {t('Add', 'เพิ่ม', '新增')}</button></>}>
      {(dateFilter || search || checkKey || filters) && (
        <Card>
          <Grid cols={5}>
            {search && <Field label={t('Search', 'ค้นหา', '搜索')}><input value={q.q || ''} onChange={(e) => setQ({ ...q, q: e.target.value })} /></Field>}
            {dateFilter && <DateRange from={q.from} to={q.to} onChange={(from, to) => setQ({ ...q, from, to })} />}
            {filters?.map((f) => <Field key={f.key} label={f.label}><FieldInput f={f} value={q[f.key]} onChange={(v) => setQ({ ...q, [f.key]: v })} /></Field>)}
            {checkKey && <CheckedFilter value={q.checked ?? ''} onChange={(v) => setQ({ ...q, checked: v })} />}
          </Grid>
        </Card>
      )}
      <Table columns={cols} rows={data} onRow={(r) => !r.checked && setEdit(r)}
        selectable={checkKey ? (r) => !r.checked : undefined} selected={sel} onSelect={setSel} />
      {edit && <EditModal open title={edit?.id ? t('Edit', 'แก้ไข', '修改') : t('Add', 'เพิ่ม', '新增')} fields={fields} value={edit}
        onClose={() => setEdit(null)} onSave={save} busy={busy} />}
    </Page>
  );
}
