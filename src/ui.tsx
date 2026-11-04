import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import JsBarcode from 'jsbarcode';
import { api, useApp, useT, custName, money, pick, useLang } from './lib';

// ---------- toasts
type Toast = { id: number; text: string; kind: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = (text: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'err' ? 7000 : 3000);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Wrap an async action: shows success/error toast, returns result or undefined. */
export function useAction() {
  const toast = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, okText?: string | false): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (okText !== false) toast(okText || t('Saved', 'บันทึกเรียบร้อย', '保存成功'));
      return r;
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

// ---------- layout primitives
export function Page({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <div className="page-head">
        <h1>{title}</h1>
        <div className="actions">{actions}</div>
      </div>
      {children}
    </div>
  );
}
export function Card({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="card-head"><h2>{title}</h2><div className="actions">{actions}</div></div>}
      {children}
    </section>
  );
}
export function Field({ label, children, wide, hint }: { label: ReactNode; children: ReactNode; wide?: boolean; hint?: ReactNode }) {
  return (
    <label className={`field${wide ? ' wide' : ''}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
export function Grid({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  return <div className="grid" style={{ ['--cols' as any]: cols }}>{children}</div>;
}
export function Stat({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return <div className={`stat ${tone || ''}`}><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({ children }: { children?: ReactNode }) {
  const t = useT();
  return <div className="empty">{children || t('No data', 'ไม่มีข้อมูล', '没有数据')}</div>;
}

export function Modal({ open, title, onClose, children, wide, footer }: {
  open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h2>{title}</h2><button className="icon" onClick={onClose} aria-label="Close">×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: ReactNode }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>{t.label}</button>
      ))}
    </div>
  );
}

// ---------- table
export interface Col<T = any> {
  key: string;
  label: ReactNode;
  render?: (row: T, i: number) => ReactNode;
  align?: 'right' | 'center';
  money?: boolean;
  sum?: boolean;
  width?: number | string;
}
export function Table<T = any>({ columns, rows, onRow, rowKey = 'id', selectable, selected, onSelect, empty, rowClass, maxHeight }: {
  columns: Col<T>[]; rows?: T[]; onRow?: (r: T) => void; rowKey?: string; selectable?: (r: T) => boolean;
  selected?: Set<any>; onSelect?: (s: Set<any>) => void; empty?: ReactNode; rowClass?: (r: T) => string; maxHeight?: number;
}) {
  const list = rows || [];
  const hasSum = columns.some((c) => c.sum);
  const selRows = selectable ? list.filter(selectable) : [];
  const allOn = selRows.length > 0 && selRows.every((r: any) => selected?.has(r[rowKey]));
  const toggle = (id: any) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    onSelect?.(s);
  };
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table>
        <thead>
          <tr>
            {selectable && <th className="sel"><input type="checkbox" checked={allOn} onChange={() => onSelect?.(allOn ? new Set() : new Set(selRows.map((r: any) => r[rowKey])))} aria-label="select all" /></th>}
            {columns.map((c) => <th key={c.key} style={{ width: c.width, textAlign: c.align || (c.money ? 'right' : undefined) }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {list.map((r: any, i) => (
            <tr key={r[rowKey] ?? i} onClick={onRow ? () => onRow(r) : undefined} className={`${onRow ? 'click' : ''} ${rowClass?.(r) || ''}`}>
              {selectable && (
                <td className="sel" onClick={(e) => e.stopPropagation()}>
                  {selectable(r) && <input type="checkbox" checked={!!selected?.has(r[rowKey])} onChange={() => toggle(r[rowKey])} />}
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || (c.money ? 'right' : undefined) }} className={c.money ? 'num' : undefined}>
                  {c.render ? c.render(r, i) : c.money ? money(r[c.key]) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {!list.length && <tr><td colSpan={columns.length + (selectable ? 1 : 0)}><Empty>{empty}</Empty></td></tr>}
        </tbody>
        {hasSum && list.length > 0 && (
          <tfoot>
            <tr>
              {selectable && <td />}
              {columns.map((c, i) => (
                <td key={c.key} className="num" style={{ textAlign: c.money || c.sum ? 'right' : undefined }}>
                  {c.sum ? money(list.reduce((s, r: any) => s + (Number(r[c.key]) || 0), 0)) : i === 0 ? 'Σ' : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ---------- pickers (searchable selects)
export function Combo<T>({ items, value, onChange, getLabel, getId = (x: any) => x.id, getSearch, placeholder, allowEmpty = true, autoFocus, id }: {
  items: T[]; value: any; onChange: (id: any, item?: T) => void; getLabel: (x: T) => string; getId?: (x: T) => any;
  getSearch?: (x: T) => string; placeholder?: string; allowEmpty?: boolean; autoFocus?: boolean; id?: string;
}) {
  const current = items.find((x) => String(getId(x)) === String(value));
  const [text, setText] = useState(current ? getLabel(current) : '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  useEffect(() => { setText(current ? getLabel(current) : ''); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items.length]);
  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q || (current && getLabel(current) === text)) return items.slice(0, 200);
    return items.filter((x) => (getSearch ? getSearch(x) : getLabel(x)).toLowerCase().includes(q)).slice(0, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, items]);
  const choose = (x?: T) => {
    onChange(x ? getId(x) : null, x);
    setText(x ? getLabel(x) : '');
    setOpen(false);
  };
  return (
    <div className="combo">
      <input id={id} value={text} placeholder={placeholder} autoFocus={autoFocus} onFocus={(e) => { setOpen(true); e.target.select(); }}
        onBlur={() => setTimeout(() => { setOpen(false); if (!text && allowEmpty) choose(undefined); else setText(current ? getLabel(current) : ''); }, 150)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setHi((h) => Math.min(h + 1, filtered.length - 1)); e.preventDefault(); }
          if (e.key === 'ArrowUp') { setHi((h) => Math.max(h - 1, 0)); e.preventDefault(); }
          if (e.key === 'Enter' && open && filtered[hi]) { choose(filtered[hi]); e.preventDefault(); }
        }} />
      {open && filtered.length > 0 && (
        <ul className="combo-list">
          {filtered.map((x, i) => (
            <li key={String(getId(x))} className={i === hi ? 'hi' : ''} onMouseDown={() => choose(x)}>{getLabel(x)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
export function CustomerPick({ value, onChange, autoFocus, placeholder }: { value: any; onChange: (id: any) => void; autoFocus?: boolean; placeholder?: string }) {
  const { lookups } = useApp();
  const t = useT();
  // show the customer CODE only (demo feedback); names still match when typing
  return <Combo items={lookups.customers} value={value} onChange={onChange} getLabel={(c) => c.code} getSearch={(c) => custName(c)} autoFocus={autoFocus}
    placeholder={placeholder || t('All customers', '--ลูกค้าทั้งหมด--', '所有客户')} />;
}
export function BankPick({ value, onChange, thai, placeholder, activeOnly = true }: { value: any; onChange: (id: any) => void; thai?: boolean; placeholder?: string; activeOnly?: boolean }) {
  const { lookups } = useApp();
  const t = useT();
  const items = lookups.banks.filter((b) => (thai === undefined || !!b.is_thai === thai) && (!activeOnly || b.is_active));
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder || t('-- choose bank --', '--เลือกธนาคาร--', '选择一家银行')}</option>
      {items.map((b) => <option key={b.id} value={b.id}>{b.name}{b.account_number ? ` · ${b.account_number}` : ''}{b.is_cash ? ' (cash)' : ''} {b.is_thai ? '฿' : '¥'}</option>)}
    </select>
  );
}
export function ShipmentPick({ value, onChange, placeholder }: { value: any; onChange: (id: any) => void; placeholder?: string }) {
  const { lookups } = useApp();
  const t = useT();
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder || t('-- shipment round --', '--เลือกรอบขนส่ง--', '选择发货单')}</option>
      {lookups.shipments.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.date}</option>)}
    </select>
  );
}
export function StylePick({ value, onChange, canAdd = true }: { value: any; onChange: (id: any) => void; canAdd?: boolean }) {
  const { lookups, reloadLookups } = useApp();
  const { lang } = useLang();
  const t = useT();
  const { run, busy } = useAction();
  const [add, setAdd] = useState<any>(null);
  const save = async () => {
    if (!add.th && !add.zh && !add.en) return;
    const r: any = await run(() => api('/r/styles', { body: { ...add, active: 1 } }), t('Category added', 'เพิ่มประเภทสินค้าแล้ว', '已新增'));
    if (r) { await reloadLookups(); onChange(r.id); setAdd(null); }
  };
  const combo = <Combo items={lookups.styles} value={value} onChange={onChange} getLabel={(s) => `${pick(s, lang === 'thzh' ? 'thzh' : lang)}${s.unit ? ` (${s.unit})` : ''}`}
    placeholder={t('Product category', 'ประเภทสินค้า', '产品分类')} />;
  if (!canAdd) return combo;
  return (
    <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{combo}</div>
      <button type="button" title={t('New category', 'เพิ่มประเภทสินค้าใหม่', '新增分类')} onClick={() => setAdd({ th: '', zh: '', en: '', unit_id: lookups.units[0]?.id ?? null })}>+</button>
      {add && (
        <Modal open title={t('New product category', 'เพิ่มประเภทสินค้าใหม่', '新增产品分类')} onClose={() => setAdd(null)}
          footer={<><button onClick={() => setAdd(null)}>{t('Cancel', 'ยกเลิก', '取消')}</button><button className="primary" disabled={busy || (!add.th && !add.zh && !add.en)} onClick={save}>{t('Save', 'บันทึก', '保存')}</button></>}>
          <p className="muted">{t('Fill at least one name.', 'ใส่ชื่ออย่างน้อย 1 ภาษา', '至少填写一个名称')}</p>
          <Grid cols={2}>
            <Field label="ไทย"><input autoFocus value={add.th} onChange={(e) => setAdd({ ...add, th: e.target.value })} /></Field>
            <Field label="中文"><input value={add.zh} onChange={(e) => setAdd({ ...add, zh: e.target.value })} /></Field>
            <Field label="English"><input value={add.en} onChange={(e) => setAdd({ ...add, en: e.target.value })} /></Field>
            <Field label={t('Unit', 'หน่วย', '单位')}>
              <select value={add.unit_id ?? ''} onChange={(e) => setAdd({ ...add, unit_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>{lookups.units.map((u) => <option key={u.id} value={u.id}>{u.description}</option>)}
              </select>
            </Field>
          </Grid>
        </Modal>
      )}
    </div>
  );
}
export function DateRange({ from, to, onChange }: { from?: string; to?: string; onChange: (f: string, t: string) => void }) {
  const t = useT();
  return (
    <>
      <Field label={t('From', 'จากวันที่', '从')}><input type="date" value={from || ''} onChange={(e) => onChange(e.target.value, to || '')} /></Field>
      <Field label={t('To', 'ถึงวันที่', '到')}><input type="date" value={to || ''} onChange={(e) => onChange(from || '', e.target.value)} /></Field>
    </>
  );
}
export function CheckedFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <Field label={t('Status', 'สถานะ', '状态')}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('All', 'ทั้งหมด', '全部')}</option>
        <option value="0">{t('Not checked', 'ยังไม่ตรวจ', '未校验')}</option>
        <option value="1">{t('Checked', 'ตรวจแล้ว', '已校验')}</option>
      </select>
    </Field>
  );
}

// ---------- printing
export function Barcode({ value, height = 50 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      try { JsBarcode(ref.current, value, { height, displayValue: true, fontSize: 14, margin: 0 }); } catch { /* invalid */ }
    }
  }, [value, height]);
  return <svg ref={ref} />;
}
export function PrintModal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={title} wide
      footer={<><button onClick={onClose}>{t('Close', 'ปิด', '关闭')}</button><button className="primary" onClick={() => window.print()}>{t('Print', 'ปริ้น', '打印')}</button></>}>
      <div className="print-area">{children}</div>
    </Modal>
  );
}
export const fmt = money;
