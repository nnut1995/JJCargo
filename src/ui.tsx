import { createContext, isValidElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import JsBarcode from 'jsbarcode';
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, Inbox, Plus, Printer, X, XCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, useApp, useT, custName, money, pick, useLang, BI_SEP, BI_END } from './lib';

// ---------- bilingual labels
/** Render a label from t()/pick(). In Thai + Chinese mode the Chinese half is shown quieter, so screens scan in one language. */
export function Bi({ children, stack }: { children: ReactNode; stack?: boolean }) {
  if (typeof children !== 'string' || !children.includes(BI_SEP)) return <>{children}</>;
  // split "ไทย␂中文␠ rest" into normal / quiet / normal runs
  const parts: ReactNode[] = [];
  const re = /([^\u2002\u2060]*)\u2002([^\u2060]*)\u2060?/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(children)) && m[0]) {
    parts.push(<span key={parts.length} className="bi-main">{m[1]}</span>, <span key={parts.length + 1} className="bi-sub" lang="zh">{m[2]}</span>);
    last = re.lastIndex;
  }
  if (last < children.length) parts.push(<span key="rest">{children.slice(last)}</span>);
  return <span className={`bi${stack ? ' stack' : ''}`}>{parts}</span>;
}
/** Apply <Bi> to a node that may be a plain string or a fragment of strings. */
function bi(node: ReactNode): ReactNode {
  if (typeof node === 'string') return <Bi>{node}</Bi>;
  if (Array.isArray(node)) return node.map((n, i) => (typeof n === 'string' ? <Bi key={i}>{n}</Bi> : n));
  if (isValidElement(node) && (node.type as any) === Symbol.for('react.fragment')) return node;
  return node;
}

// ---------- toasts
type Toast = { id: number; text: string; kind: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const close = (id: number) => setItems((x) => x.filter((t) => t.id !== id));
  const push = (text: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => close(id), kind === 'err' ? 8000 : 3000);
  };
  return (
    <ToastCtx.Provider value={push}>
      <ConfirmProvider>{children}</ConfirmProvider>
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'ok' ? <CheckCircle2 size={18} aria-hidden /> : <XCircle size={18} aria-hidden />}
            <span>{t.text}</span>
            <button className="toast-x" onClick={() => close(t.id)} aria-label="Close"><X size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- confirm / prompt dialogs (replace the browser's confirm() and prompt())
type Ask = { message: ReactNode; danger?: boolean; ok?: string; input?: { label: string; value?: string }; resolve: (v: any) => void };
const AskCtx = createContext<{ ask: (message: ReactNode, o?: { danger?: boolean; ok?: string }) => Promise<boolean>; askText: (message: ReactNode, label: string) => Promise<string | undefined> }>(
  { ask: async () => false, askText: async () => undefined },
);
function ConfirmProvider({ children }: { children: ReactNode }) {
  const [cur, setCur] = useState<Ask | null>(null);
  const [text, setText] = useState('');
  const t = useT();
  const api = useMemo(() => ({
    ask: (message: ReactNode, o: { danger?: boolean; ok?: string } = {}) => new Promise<boolean>((resolve) => setCur({ message, ...o, resolve })),
    askText: (message: ReactNode, label: string) => new Promise<string | undefined>((resolve) => { setText(''); setCur({ message, input: { label }, resolve }); }),
  }), []);
  const done = (v: any) => { cur?.resolve(v); setCur(null); };
  return (
    <AskCtx.Provider value={api}>
      {children}
      {cur && (
        <Modal open small title={cur.danger ? <span className="row tight"><AlertTriangle size={18} className="tone-bad" aria-hidden /> {t('Please confirm', 'ยืนยันอีกครั้ง', '请确认')}</span> : t('Please confirm', 'ยืนยันอีกครั้ง', '请确认')}
          onClose={() => done(cur.input ? undefined : false)}
          footer={<>
            <button onClick={() => done(cur.input ? undefined : false)}>{t('Cancel', 'ยกเลิก', '取消')}</button>
            <button autoFocus={!cur.input} className={cur.danger ? 'danger solid' : 'primary'} onClick={() => done(cur.input ? text : true)}>{cur.ok || (cur.danger ? t('Delete', 'ลบ', '删除') : t('Confirm', 'ยืนยัน', '确认'))}</button>
          </>}>
          <form onSubmit={(e) => { e.preventDefault(); done(cur.input ? text : true); }}>
            <div className="ask-msg">{cur.message}</div>
            {cur.input && <Field label={cur.input.label}><input autoFocus value={text} onChange={(e) => setText(e.target.value)} /></Field>}
          </form>
        </Modal>
      )}
    </AskCtx.Provider>
  );
}
/** const { ask, askText } = useAsk(); if (!(await ask('Delete?', { danger: true }))) return; */
export const useAsk = () => useContext(AskCtx);

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
/** Page frame. The header (title + actions) stays visible while the page scrolls, so Save is always in reach. */
export function Page({ title, actions, children, back, sub }: { title: ReactNode; actions?: ReactNode; children: ReactNode; back?: string; sub?: ReactNode }) {
  const t = useT();
  useEffect(() => {
    if (typeof title === 'string') document.title = `${title.split(BI_SEP)[0]} · JJ Cargo`;
  }, [title]);
  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">
          {back && <Link className="back" to={back} aria-label={t('Back', 'กลับ', '返回')}><ChevronLeft size={20} /></Link>}
          <div>
            <h1>{bi(title)}</h1>
            {sub && <div className="page-sub">{sub}</div>}
          </div>
        </div>
        <div className="actions">{actions}</div>
      </div>
      <div className="page-body">{children}</div>
    </div>
  );
}
export function Card({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="card-head"><h2>{bi(title)}</h2><div className="actions">{actions}</div></div>}
      {children}
    </section>
  );
}
export function Field({ label, children, wide, hint }: { label: ReactNode; children: ReactNode; wide?: boolean; hint?: ReactNode }) {
  // "Label *" → label + a required marker
  let req = false;
  let lab = label;
  if (typeof label === 'string' && label.endsWith(' *')) { req = true; lab = label.slice(0, -2); }
  return (
    <label className={`field${wide ? ' wide' : ''}`}>
      <span className="label">{bi(lab)}{req && <span className="req" aria-label="required">*</span>}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
export function Grid({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  return <div className="grid" style={{ ['--cols' as any]: cols }}>{children}</div>;
}
export function Stat({ label, value, tone, to, hint }: { label: ReactNode; value: ReactNode; tone?: 'good' | 'bad' | 'warn'; to?: string; hint?: ReactNode }) {
  const body = <><div className="stat-label">{bi(label)}</div><div className="stat-value">{value}</div>{hint && <div className="stat-hint">{hint}</div>}</>;
  return to ? <Link to={to} className={`stat link ${tone || ''}`}>{body}</Link> : <div className={`stat ${tone || ''}`}>{body}</div>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({ children }: { children?: ReactNode }) {
  const t = useT();
  return <div className="empty"><Inbox size={22} aria-hidden /><div>{bi(children || t('No data', 'ไม่มีข้อมูล', '没有数据'))}</div></div>;
}

export function Modal({ open, title, onClose, children, wide, xl, small, footer }: {
  open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; xl?: boolean; small?: boolean; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      // keep Tab inside the dialog
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', h);
    if (ref.current && !ref.current.contains(document.activeElement)) {
      const auto = ref.current.querySelector<HTMLElement>('[autofocus], .modal-body input, .modal-body select, .modal-body textarea');
      (auto || ref.current).focus();
    }
    document.body.classList.add('modal-open');
    return () => { window.removeEventListener('keydown', h); document.body.classList.remove('modal-open'); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className={`modal${wide ? ' wide' : ''}${xl ? ' xl' : ''}${small ? ' small' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h2>{bi(title)}</h2><button className="icon" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
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
        <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>{bi(t.label)}</button>
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
  /** decimals for the sum row (default 2) */
  digits?: number;
  width?: number | string;
}
export function Table<T = any>({ columns, rows, onRow, rowKey = 'id', selectable, selected, onSelect, empty, rowClass, maxHeight }: {
  columns: Col<T>[]; rows?: T[]; onRow?: (r: T) => void; rowKey?: string; selectable?: (r: T) => boolean;
  selected?: Set<any>; onSelect?: (s: Set<any>) => void; empty?: ReactNode; rowClass?: (r: T) => string; maxHeight?: number;
}) {
  const t = useT();
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
    <div className={`table-wrap${maxHeight ? ' capped' : ''}`} style={maxHeight ? { maxHeight } : undefined}>
      <table>
        <thead>
          <tr>
            {selectable && <th className="sel"><input type="checkbox" checked={allOn} onChange={() => onSelect?.(allOn ? new Set() : new Set(selRows.map((r: any) => r[rowKey])))} aria-label="select all" /></th>}
            {columns.map((c) => <th key={c.key} style={{ width: c.width, textAlign: c.align || (c.money ? 'right' : undefined) }}>{bi(c.label)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows === undefined && <tr className="loading-row"><td colSpan={columns.length + (selectable ? 1 : 0)}><div className="skeleton" /><div className="skeleton" /><div className="skeleton short" /></td></tr>}
          {list.map((r: any, i) => (
            <tr key={r[rowKey] ?? i}
              onClick={onRow ? () => onRow(r) : undefined}
              onKeyDown={onRow ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onRow(r); } : undefined}
              tabIndex={onRow ? 0 : undefined}
              className={`${onRow ? 'click' : ''} ${selected?.has(r[rowKey]) ? 'picked' : ''} ${rowClass?.(r) || ''}`}>
              {selectable && (
                <td className="sel" onClick={(e) => e.stopPropagation()}>
                  {selectable(r) && <input type="checkbox" checked={!!selected?.has(r[rowKey])} onChange={() => toggle(r[rowKey])} aria-label="select" />}
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || (c.money ? 'right' : undefined) }} className={c.money || c.align === 'right' ? 'num' : undefined}>
                  {c.render ? c.render(r, i) : c.money ? money(r[c.key]) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows !== undefined && !list.length && <tr><td colSpan={columns.length + (selectable ? 1 : 0)}><Empty>{empty}</Empty></td></tr>}
        </tbody>
        {hasSum && list.length > 0 && (
          <tfoot>
            <tr>
              {selectable && <td />}
              {columns.map((c, i) => (
                <td key={c.key} className="num" style={{ textAlign: c.money || c.sum || c.align === 'right' ? 'right' : undefined }}>
                  {c.sum ? money(list.reduce((s, r: any) => s + (Number(r[c.key]) || 0), 0), c.digits ?? 2) : i === 0 ? <span className="muted">{t('Total', 'รวม', '合计')}</span> : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {list.length > 0 && (selectable && selected?.size ? <div className="table-foot">{t('Selected', 'เลือกแล้ว', '已选')} <b>{selected.size}</b> / {list.length}</div> : list.length > 12 ? <div className="table-foot">{list.length} {t('rows', 'รายการ', '条')}</div> : null)}
    </div>
  );
}

// ---------- pickers (searchable selects)
export function Combo<T>({ items, value, onChange, getLabel, getId = (x: any) => x.id, getSearch, getHint, placeholder, allowEmpty = true, autoFocus, id }: {
  items: T[]; value: any; onChange: (id: any, item?: T) => void; getLabel: (x: T) => string; getId?: (x: T) => any;
  getSearch?: (x: T) => string; getHint?: (x: T) => string; placeholder?: string; allowEmpty?: boolean; autoFocus?: boolean; id?: string;
}) {
  const current = items.find((x) => String(getId(x)) === String(value));
  const [text, setText] = useState(current ? getLabel(current) : '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // The list is drawn on <body> with fixed position, so a table, card or dialog that scrolls can't clip it.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 8, above = r.top - 8;
      const up = below < 200 && above > below;
      setPos({ left: r.left, width: Math.max(r.width, 220), maxHeight: Math.min(300, (up ? above : below) - 4),
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);
  useEffect(() => { setText(current ? getLabel(current) : ''); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items.length]);
  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q || (current && getLabel(current) === text)) return items.slice(0, 200);
    return items.filter((x) => (getSearch ? getSearch(x) : getLabel(x)).toLowerCase().includes(q)).slice(0, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, items]);
  useEffect(() => { listRef.current?.children[hi]?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const choose = (x?: T) => {
    onChange(x ? getId(x) : null, x);
    setText(x ? getLabel(x) : '');
    setOpen(false);
  };
  return (
    <div className="combo" ref={boxRef}>
      <input id={id} value={text} placeholder={placeholder} autoFocus={autoFocus} role="combobox" aria-expanded={open} autoComplete="off"
        // the list opens on click, typing or ↓, not on focus, so auto-focused pickers (dialogs) don't pop open by themselves
        onFocus={(e) => e.target.select()}
        onMouseDown={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); if (!text && allowEmpty) choose(undefined); else setText(current ? getLabel(current) : ''); }, 150)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setOpen(true); setHi((h) => Math.min(h + 1, filtered.length - 1)); e.preventDefault(); }
          if (e.key === 'ArrowUp') { setHi((h) => Math.max(h - 1, 0)); e.preventDefault(); }
          if (e.key === 'Enter' && open && filtered[hi]) { choose(filtered[hi]); e.preventDefault(); }
          if (e.key === 'Escape' && open) { setOpen(false); e.stopPropagation(); }
        }} />
      {value != null && value !== '' && allowEmpty && <button type="button" tabIndex={-1} className="combo-clear" aria-label="Clear" onMouseDown={(e) => { e.preventDefault(); choose(undefined); }}><X size={14} /></button>}
      {open && pos && filtered.length > 0 && createPortal(
        <ul className="combo-list" ref={listRef} role="listbox" style={pos}>
          {filtered.map((x, i) => (
            <li key={String(getId(x))} role="option" aria-selected={i === hi} className={`${i === hi ? 'hi' : ''}${String(getId(x)) === String(value) ? ' cur' : ''}`} onMouseDown={() => choose(x)} onMouseEnter={() => setHi(i)}>
              <span>{getLabel(x)}</span>{getHint && <small>{getHint(x)}</small>}
            </li>
          ))}
        </ul>, document.body,
      )}
    </div>
  );
}
export function CustomerPick({ value, onChange, autoFocus, placeholder }: { value: any; onChange: (id: any) => void; autoFocus?: boolean; placeholder?: string }) {
  const { lookups } = useApp();
  const t = useT();
  // show the customer CODE only in the box (demo feedback); the list hints the name, and names still match when typing
  return <Combo items={lookups.customers} value={value} onChange={onChange} getLabel={(c) => c.code} getSearch={(c) => custName(c)}
    getHint={(c) => [c.firstname, c.nickname && `(${c.nickname})`].filter(Boolean).join(' ')} autoFocus={autoFocus}
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
  const combo = <Combo items={lookups.styles} value={value} onChange={onChange} getLabel={(s) => `${pick(s, lang === 'thzh' ? 'thzh' : lang).replace(BI_END, '').split(BI_SEP).join(' · ')}${s.unit ? ` (${s.unit})` : ''}`}
    placeholder={t('Product category', 'ประเภทสินค้า', '产品分类')} />;
  if (!canAdd) return combo;
  return (
    <div className="input-group">
      <div className="grow">{combo}</div>
      <button type="button" className="icon-btn" title={t('New category', 'เพิ่มประเภทสินค้าใหม่', '新增分类')} aria-label={t('New category', 'เพิ่มประเภทสินค้าใหม่', '新增分类')}
        onClick={() => setAdd({ th: '', zh: '', en: '', unit_id: lookups.units[0]?.id ?? null })}><Plus size={16} /></button>
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
/** "Checked by X" / "Waiting" marker used on every list with a verify step. */
export function CheckedBadge({ by }: { by?: string | null }) {
  const t = useT();
  return by !== undefined && by !== null && by !== '' ? <Badge tone="good"><Check size={12} aria-hidden /> {by}</Badge> : <Badge tone="warn">{t('Waiting', 'รอตรวจ', '待校验')}</Badge>;
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
      footer={<><button onClick={onClose}>{t('Close', 'ปิด', '关闭')}</button><button className="primary" onClick={() => window.print()}><Printer size={16} aria-hidden /> {t('Print', 'ปริ้น', '打印')}</button></>}>
      <div className="print-area">{children}</div>
    </Modal>
  );
}
export const fmt = money;
