// App shell: sidebar, top bar, "go to" search (Ctrl+K), recent screens.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight, BadgeCheck, Banknote, Boxes, Building2, ChevronDown, ClipboardCheck, ClipboardList, Coins, Container, CornerDownLeft, FileInput,
  FileSearch, FileSpreadsheet, FileText, HandCoins, Landmark, LayoutDashboard, ListChecks, LogOut, Menu, PackageCheck, PackageOpen, PackagePlus,
  Receipt, ReceiptText, Ruler, Scale, ScrollText, Search, Settings, ShieldCheck, ShoppingCart, Tags, Truck, UserCog, Users, Wallet, X,
  type LucideIcon,
} from 'lucide-react';
import { MENU, type MenuItem } from '../shared/menus';
import { pick, useLang, useT, BI_SEP, type Lang, type User } from './lib';
import { Bi } from './ui';

export const GROUP_ICON: Record<string, LucideIcon> = {
  main: LayoutDashboard, order: ShoppingCart, packing: Truck, customer: Users, account: Wallet, admin: Settings,
};
export const ITEM_ICON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  'order.new': ShoppingCart, 'order.search': ClipboardList, 'package.new': ReceiptText, 'package.search': FileText, 'package.lookup': FileSearch,
  'packing.new': PackagePlus, 'packing.nobill': PackageOpen, 'packing.weigh': Ruler, 'packing.bulk': FileSpreadsheet, 'packing.search': Boxes,
  'shipment.list': Container, 'packing.offchina': Truck, 'shipment.summary': Receipt, 'shipment.search': Scale, style: Tags,
  'customer.info': Users, 'customer.balance': Banknote, 'customer.yuan': Coins, 'customer.payment': HandCoins,
  'payment.check': ClipboardCheck, 'bank.statement': ScrollText, 'bank.import': FileInput, 'bank.total': Landmark,
  'transfer.china': ArrowLeftRight, 'transfer.thai': ArrowLeftRight, 'account.transfer': ArrowLeftRight, 'invoice.payment': Wallet,
  'invoice.paymentSearch': ListChecks, 'expense.thai': Receipt, 'expense.china': Receipt, 'income.other': Coins, exchange: ArrowLeftRight, unpaid: BadgeCheck,
  'bank.info': Building2, employees: UserCog, permission: ShieldCheck, verify: PackageCheck, settings: Settings,
};

const END_PATHS = new Set(['/', '/orders', '/packages', '/payments', '/packing', '/shipments']);
/** The menu item a URL belongs to (longest matching path), so detail pages light up their parent. */
export function activeItem(pathname: string, items: MenuItem[]) {
  let best: MenuItem | undefined;
  for (const i of items) {
    const hit = pathname === i.path || (i.path !== '/' && pathname.startsWith(i.path + '/'));
    if (hit && (!best || i.path.length > best.path.length)) best = i;
  }
  return best;
}

/** Menu groups as the sidebar shows them: no navAs screens; a host screen shows if it or any folded screen is allowed. */
export function sidebarGroups(allowed: MenuItem[]) {
  const ok = new Set(allowed.map((i) => i.key));
  allowed.forEach((i) => i.navAs && ok.add(i.navAs));
  return MENU.map((g) => ({ g, items: g.items.filter((i) => !i.navAs && ok.has(i.key)) })).filter((x) => x.items.length);
}

function readSet(key: string): string[] | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writeSet(key: string, v: string[]) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
}
/** Screens this person opened recently (most recent first), kept per browser. */
export function useRecent(): string[] {
  const loc = useLocation();
  const [list, setList] = useState<string[]>(() => readSet('jj.recent') || []);
  useEffect(() => {
    const all = MENU.flatMap((g) => g.items);
    const it = activeItem(loc.pathname, all);
    if (!it || it.key === 'dashboard') return;
    setList((xs) => { const n = [it.key, ...xs.filter((k) => k !== it.key)].slice(0, 8); writeSet('jj.recent', n); return n; });
  }, [loc.pathname]);
  return list;
}

export function LangSwitch({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <select className={`lang${compact ? ' compact' : ''}`} value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="Language / ภาษา / 语言">
      <option value="thzh">ไทย + 中文</option>
      <option value="th">ไทย</option>
      <option value="zh">中文</option>
      <option value="en">English</option>
    </select>
  );
}

/** "Go to" box: type part of a screen name in any language, or an order / bill / box code to look it up. */
function GoTo({ open, onClose, items }: { open: boolean; onClose: () => void; items: MenuItem[] }) {
  const t = useT();
  const { lang } = useLang();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const groupOf = useMemo(() => Object.fromEntries(MENU.flatMap((g) => g.items.map((i) => [i.key, g]))), []);
  useEffect(() => { if (open) { setQ(''); setHi(0); } }, [open]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hits = (s ? items.filter((i) => `${i.th} ${i.zh} ${i.en} ${groupOf[i.key].th} ${groupOf[i.key].zh} ${groupOf[i.key].en}`.toLowerCase().includes(s)) : items).filter((i) => i.key !== 'package.lookup');
    const rows: { key: string; label: string; sub: string; go: () => void; icon: LucideIcon }[] = hits.map((i) => ({
      key: i.key, label: pick(i, lang), sub: pick(groupOf[i.key], lang), icon: ITEM_ICON[i.key] || FileText, go: () => nav(i.path),
    }));
    if (s && items.some((i) => i.key === 'order.search' || i.key === 'package.search')) {
      rows.push({ key: '_lookup', label: `${t('Look up code', 'ค้นหาเลข', '查找单号')} “${q.trim()}”`, sub: t('Order no., bill code or product id', 'เลขออเดอร์ / เลขบิล / รหัสสินค้า', '单号 / 划款单 / 款号'),
        icon: Search, go: () => nav(`/orders?${items.some((i) => i.key === 'order.search') ? '' : 'tab=bills&'}q=${encodeURIComponent(q.trim())}`) });
    }
    return rows;
  }, [q, items, lang, nav, t, groupOf]);
  useEffect(() => { listRef.current?.children[hi]?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  if (!open) return null;
  const go = (i: number) => { results[i]?.go(); onClose(); };
  return (
    <div className="modal-back goto-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="goto" role="dialog" aria-modal="true" aria-label={t('Go to', 'ไปที่เมนู', '前往')}>
        <div className="goto-input">
          <Search size={18} aria-hidden />
          <input autoFocus value={q} placeholder={t('Type a menu name or an order / bill no.', 'พิมพ์ชื่อเมนู หรือเลขออเดอร์ / เลขบิล', '输入菜单名称或单号')}
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { setHi((h) => Math.min(h + 1, results.length - 1)); e.preventDefault(); }
              if (e.key === 'ArrowUp') { setHi((h) => Math.max(h - 1, 0)); e.preventDefault(); }
              if (e.key === 'Enter') { go(hi); e.preventDefault(); }
              if (e.key === 'Escape') onClose();
            }} />
          <kbd>Esc</kbd>
        </div>
        <ul className="goto-list" ref={listRef} role="listbox">
          {results.map((r, i) => {
            const Ico = r.icon;
            return (
              <li key={r.key} role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); go(i); }}>
                <Ico size={18} aria-hidden className="goto-ico" />
                <span className="goto-label"><Bi>{r.label}</Bi></span>
                <span className="goto-sub">{r.sub.split(BI_SEP)[0]}</span>
                {i === hi && <CornerDownLeft size={14} aria-hidden className="goto-enter" />}
              </li>
            );
          })}
          {!results.length && <li className="goto-none">{t('Nothing found', 'ไม่พบเมนู', '没有找到')}</li>}
        </ul>
      </div>
    </div>
  );
}

export function Shell({ user, children, onLogout }: { user: User; children: ReactNode; onLogout: () => void }) {
  const { lang } = useLang();
  const t = useT();
  const loc = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [goto, setGoto] = useState(false);
  useEffect(() => setNavOpen(false), [loc.pathname]);
  const can = (k: string) => !!user.is_admin || user.menus.includes(k);
  const allowed = MENU.flatMap((g) => g.items).filter((i) => can(i.key));
  // Sidebar: screens folded into another (navAs) show as that screen, which appears if any of them is allowed.
  const groups = sidebarGroups(allowed);
  const hit = activeItem(loc.pathname, allowed);
  const active = hit?.navAs ? { ...hit, key: hit.navAs } : hit;
  const activeGroup = groups.find((x) => x.items.some((i) => i.key === active?.key))?.g.key;
  // which groups are expanded: remembered per browser; the group of the open screen is always expanded
  const [openGroups, setOpenGroups] = useState<string[]>(() => readSet('jj.navGroups') || []);
  const toggle = (k: string) => setOpenGroups((xs) => { const n = xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]; writeSet('jj.navGroups', n); return n; });
  useRecent();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing && !document.body.classList.contains('modal-open'))) { e.preventDefault(); setGoto(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="icon menu-btn" onClick={() => setNavOpen((o) => !o)} aria-label="Menu" aria-expanded={navOpen}>{navOpen ? <X size={20} /> : <Menu size={20} />}</button>
        <NavLink to="/" className="brand"><span className="logo">JJ</span><span className="brand-name">Cargo</span></NavLink>
        <button className="search-trigger" onClick={() => setGoto(true)}>
          <Search size={16} aria-hidden />
          <span className="search-text">{t('Go to menu or look up a code…', 'ไปที่เมนู หรือค้นหาเลข…', '前往菜单或查找单号…')}</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="spacer" />
        <LangSwitch compact />
        <span className="who" title={user.username}><span className="avatar" aria-hidden>{(user.name || user.username).slice(0, 1).toUpperCase()}</span><span className="who-name">{user.name}</span></span>
        <button className="icon" onClick={onLogout} title={t('Sign out', 'ออกจากระบบ', '退出')} aria-label={t('Sign out', 'ออกจากระบบ', '退出')}><LogOut size={18} /></button>
      </header>
      <div className={`nav-scrim${navOpen ? ' open' : ''}`} onClick={() => setNavOpen(false)} />
      <nav className={`sidebar${navOpen ? ' open' : ''}`} aria-label="Main">
        {groups.map(({ g, items }) => {
          const GIcon = GROUP_ICON[g.key] || FileText;
          // Overview, and any group with a single screen, show as one top-level link.
          if (g.key === 'main' || items.length === 1) {
            return items.map((i) => (
              <NavLink key={i.key} to={i.path} end className={() => `nav-item top${active?.key === i.key ? ' active' : ''}`} aria-current={active?.key === i.key ? 'page' : undefined}>
                <GIcon size={18} aria-hidden /><Bi>{pick(i, lang)}</Bi>
              </NavLink>
            ));
          }
          const expanded = openGroups.includes(g.key) || activeGroup === g.key;
          return (
            <div key={g.key} className={`nav-group${expanded ? ' open' : ''}`}>
              <button className="nav-title" onClick={() => toggle(g.key)} aria-expanded={expanded}>
                <GIcon size={18} aria-hidden />
                <span className="nav-title-text"><Bi>{pick(g, lang)}</Bi></span>
                <ChevronDown size={16} aria-hidden className="chev" />
              </button>
              {expanded && (
                <div className="nav-items">
                  {items.map((i) => (
                    <NavLink key={i.key} to={i.path} end={END_PATHS.has(i.path)} className={() => `nav-item${active?.key === i.key ? ' active' : ''}`} aria-current={active?.key === i.key ? 'page' : undefined}>
                      <Bi stack>{pick(i, lang)}</Bi>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <main className="content" id="main">{children}</main>
      <GoTo open={goto} onClose={() => setGoto(false)} items={allowed} />
    </div>
  );
}
