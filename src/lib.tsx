// API client, i18n, shared data hooks.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// ---------- API
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, any> } = {}): Promise<T> {
  let url = `/api${path}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const res = await fetch(url, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') window.dispatchEvent(new Event('jj:logout'));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

export function useApi<T = any>(path: string | null, query?: Record<string, any>) {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const key = path ? path + JSON.stringify(query || {}) : null;
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(undefined);
    try {
      setData(await api<T>(path, { query }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

// ---------- i18n: the old app was bilingual Thai + Chinese; English added for convenience.
export type Lang = 'thzh' | 'th' | 'zh' | 'en';
const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'thzh', setLang: () => {} });
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('jj.lang') as Lang) || 'thzh'; } catch { return 'thzh'; }
  });
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('jj.lang', l); } catch { /* ignore */ }
  };
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}
export function useLang() {
  return useContext(LangCtx);
}
/** Separator between the Thai and Chinese halves of a bilingual label (renders like a normal space in plain text). */
export const BI_SEP = '\u2002';
/** Invisible marker closing the Chinese half, so text appended after a label (codes, counts) is not styled as Chinese. */
export const BI_END = '\u2060';
/** t(english, thai, chinese) */
export function useT() {
  const { lang } = useLang();
  return useCallback((en: string, th?: string, zh?: string) => {
    if (lang === 'en') return en;
    if (lang === 'th') return th || en;
    if (lang === 'zh') return zh || th || en;
    // Thai + Chinese are joined with an EN SPACE so <Bi> can show the Chinese part as a quieter second line.
    return th && zh ? `${th}${BI_SEP}${zh}${BI_END}` : th || zh || en;
  }, [lang]);
}
export function pick(o: { th?: string; zh?: string; en?: string }, lang: Lang) {
  if (lang === 'en') return o.en || o.th || '';
  if (lang === 'zh') return o.zh || o.th || '';
  if (lang === 'th') return o.th || o.en || '';
  return o.th && o.zh ? `${o.th}${BI_SEP}${o.zh}${BI_END}` : o.th || o.zh || '';
}

// ---------- session + lookups
export interface User { id: number; name: string; username: string; is_admin: number; menus: string[]; verify: string[] }
export interface Lookups {
  customers: { id: number; code: string; firstname?: string; lastname?: string; nickname?: string; calc_type?: string }[];
  banks: { id: number; name: string; nickname?: string; account_name?: string; account_number?: string; is_thai: number; is_cash: number; is_active: number }[];
  styles: { id: number; en?: string; zh?: string; th?: string; unit?: string }[];
  units: { id: number; description: string }[];
  shipments: { id: number; code: string; date: string; arrived_date?: string }[];
  expenseTypes: { id: number; description: string; is_thai: number }[];
  provinces: { id: number; name: string }[];
  statuses: { id: number; text: string }[];
  roles: { id: number; description: string }[];
  supplierBanks: { id: number; bank: string; account_name?: string; account_number?: string; tel?: string }[];
  settings: Record<string, string>;
  rate: number;
}
const AppCtx = createContext<{ user: User; lookups: Lookups; reloadLookups: () => Promise<void> }>(null as any);
export const AppProvider = AppCtx.Provider;
export function useApp() {
  return useContext(AppCtx);
}
export function useCan() {
  const { user } = useApp();
  return {
    menu: (k: string) => !!user.is_admin || user.menus.includes(k),
    verify: (k: string) => !!user.is_admin || user.verify.includes(k),
  };
}

// ---------- formatting
export const money = (n: any, d = 2) =>
  n === null || n === undefined || n === '' || isNaN(Number(n)) ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => today().slice(0, 8) + '01';
export const cbm = (p: { cubic1?: number; cubic2?: number; cubic3?: number }) => ((p.cubic1 || 0) * (p.cubic2 || 0) * (p.cubic3 || 0)) / 1_000_000;
export const custName = (c?: { code: string; firstname?: string; nickname?: string }) =>
  c ? `${c.code}${c.firstname || c.nickname ? ` · ${[c.firstname, c.nickname && `(${c.nickname})`].filter(Boolean).join(' ')}` : ''}` : '';
export const sum = (rows: any[] | undefined, k: string) => (rows || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
