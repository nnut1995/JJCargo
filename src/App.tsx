import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { api, AppProvider, useT, type Lookups, type User } from './lib';
import { useAction } from './ui';
import { Shell, LangSwitch } from './nav';
import Dashboard from './pages/Dashboard';
import { OrderEdit, OrderSearch, Lookup } from './pages/Orders';
import { PackageEdit, PackageSearch, PackageView } from './pages/Packages';
import { PackNew, PackingSearch, PackingImport, PackWeigh } from './pages/Packing';
import { Shipments, LoadContainer, ShipmentSummary, ShippingCharges, ShipmentReport } from './pages/Shipments';
import { Customers, CustomerEdit, Balances } from './pages/Customers';
import { Payments, CheckPayments } from './pages/Payments';
import { BankStatements, BankImport, BankTotal, BankAccounts, AccountTransfers } from './pages/Bank';
import { Transfers, Expenses, OtherIncome, Exchange, Unpaid, InvoicePay, InvoicePayments } from './pages/Accounting';
import { Employees, Permissions, VerifySettings, Settings, Styles } from './pages/Admin';

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const t = useT();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const { run, busy } = useAction();
  return (
    <div className="login">
      <form className="login-card" onSubmit={async (e) => {
        e.preventDefault();
        const u = await run(() => api<User>('/login', { body: { username, password } }), false);
        if (u) onLogin(u);
      }}>
        <div className="login-brand"><span className="logo big">JJ</span><div><div className="login-name">JJ Cargo</div>
          <div className="muted">{t('Back office · China → Thailand cargo', 'ระบบหลังบ้าน ขนส่งจีน-ไทย', '后台系统 中国 → 泰国')}</div></div></div>
        <label className="field"><span className="label">{t('Username', 'ชื่อผู้ใช้', '用户名')}</span><input autoFocus value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" /></label>
        <label className="field"><span className="label">{t('Password', 'รหัสผ่าน', '密码')}</span><input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" /></label>
        <button className="primary block" disabled={busy || !username || !password}>{busy ? t('Signing in…', 'กำลังเข้าสู่ระบบ…', '登录中…') : t('Sign in', 'เข้าสู่ระบบ', '登录')}</button>
        <div className="login-foot"><span className="muted">{t('Language', 'ภาษา', '语言')}</span><LangSwitch /></div>
      </form>
    </div>
  );
}

function NotFound() {
  const t = useT();
  return <div className="page"><div className="empty big"><h1>404</h1><p>{t('This page does not exist.', 'ไม่พบหน้านี้', '页面不存在')}</p><Link to="/">{t('Back to dashboard', 'กลับหน้าแรก', '返回首页')}</Link></div></div>;
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [lookups, setLookups] = useState<Lookups>();
  const reloadLookups = useCallback(async () => setLookups(await api<Lookups>('/lookups')), []);
  useEffect(() => {
    api<User>('/me').then(setUser).catch(() => setUser(null));
    const h = () => setUser(null);
    window.addEventListener('jj:logout', h);
    return () => window.removeEventListener('jj:logout', h);
  }, []);
  useEffect(() => { if (user) void reloadLookups(); }, [user, reloadLookups]);

  if (user === undefined) return null;
  if (!user) return <Login onLogin={setUser} />;
  if (!lookups) return <div className="loading"><span className="logo">JJ</span><span className="spinner" aria-label="Loading" /></div>;
  const logout = async () => { await api('/logout', { body: {} }); setUser(null); };
  return (
    <AppProvider value={{ user, lookups, reloadLookups }}>
      <BrowserRouter>
        <Shell user={user} onLogout={logout}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<OrderSearch />} />
            <Route path="/orders/new" element={<OrderEdit />} />
            <Route path="/orders/:id" element={<OrderEdit />} />
            <Route path="/lookup" element={<Lookup />} />
            <Route path="/packages" element={<PackageSearch />} />
            <Route path="/packages/new" element={<PackageEdit />} />
            <Route path="/packages/:id" element={<PackageView />} />
            <Route path="/packages/:id/edit" element={<PackageEdit />} />
            <Route path="/packing/new" element={<PackNew mode="order" />} />
            <Route path="/packing/nobill" element={<PackNew mode="nobill" />} />
            <Route path="/packing/import" element={<PackingImport />} />
            <Route path="/packing/weigh" element={<PackWeigh />} />
            <Route path="/packing" element={<PackingSearch />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/shipments/load" element={<LoadContainer />} />
            <Route path="/shipments/summary" element={<ShipmentSummary />} />
            <Route path="/shipments/search" element={<ShippingCharges />} />
            <Route path="/shipments/:id/report" element={<ShipmentReport />} />
            <Route path="/styles" element={<Styles />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/new" element={<CustomerEdit />} />
            <Route path="/customers/:id" element={<CustomerEdit />} />
            <Route path="/balances/:currency" element={<Balances />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/payments/check" element={<CheckPayments />} />
            <Route path="/bank/statements" element={<BankStatements />} />
            <Route path="/bank/import" element={<BankImport />} />
            <Route path="/bank/total" element={<BankTotal />} />
            <Route path="/bank/accounts" element={<BankAccounts />} />
            <Route path="/bank/transfers" element={<AccountTransfers />} />
            <Route path="/transfers/:region" element={<Transfers />} />
            <Route path="/invoice-payments/new" element={<InvoicePay />} />
            <Route path="/invoice-payments" element={<InvoicePayments />} />
            <Route path="/expenses/:region" element={<Expenses />} />
            <Route path="/other-income" element={<OtherIncome />} />
            <Route path="/exchange" element={<Exchange />} />
            <Route path="/unpaid" element={<Unpaid />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/permissions" element={<Permissions />} />
            <Route path="/verify-settings" element={<VerifySettings />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </AppProvider>
  );
}
