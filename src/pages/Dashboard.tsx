import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, RefreshCw, type LucideIcon } from 'lucide-react';
import { MENU } from '../../shared/menus';
import { SHIPMENT_STATUSES } from '../../shared/statuses';
import { useApi, useT, money, useCan, useLang, pick } from '../lib';
import { Page, Card, Stat, Table, Badge, Bi } from '../ui';
import { GROUP_ICON, ITEM_ICON, sidebarGroups, useRecent } from '../nav';

const ITEMS = Object.fromEntries(MENU.flatMap((g) => g.items.map((i) => [i.key, i])));

// The daily cargo flow, in the order the work happens.
const FLOW = ['order.new', 'package.new', 'packing.new', 'packing.offchina', 'shipment.summary', 'payment.check'];

export default function Dashboard() {
  const t = useT();
  const can = useCan();
  const { lang } = useLang();
  const recent = useRecent().filter((k) => ITEMS[k] && k !== 'package.lookup' && can.menu(k)).slice(0, 6);
  const { data: d, reload, loading } = useApi<any>('/dashboard');
  const label = (k: string) => pick(ITEMS[k], lang);

  // Work waiting for someone, each linking to the screen where it gets done.
  const todo: { key: string; menu: string; text: string; sub?: string; n: number; shown?: string; tone?: 'warn' | 'bad' }[] = d ? [
    { key: 'pay', menu: 'payment.check', text: t('Payment notices to check', 'ยอดแจ้งโอนรอตรวจ', '待核对付款'), sub: d.pendingPayments ? `฿ ${money(d.pendingAmount)}` : undefined, n: d.pendingPayments, tone: 'warn' as const },
    { key: 'pack', menu: 'packing.new', text: t('Order lines waiting to pack', 'รายการสินค้ารอแพค', '等待打包'), n: d.waitingToPack },
    { key: 'load', menu: 'packing.offchina', text: t('Boxes not on a container yet', 'กล่อง/กระสอบที่ยังไม่ขึ้นตู้', '未发货包'), n: d.notLoaded },
    { key: 'bills', menu: 'invoice.payment', text: t('Supplier bills not fully paid', 'บิลโอนที่ยังจ่ายร้านค้าไม่ครบ', '未付划款单'), n: d.unpaidBills },
    { key: 'ship', menu: 'unpaid', text: t('Unpaid shipping (posted)', 'ค่าขนส่งที่ลูกค้ายังค้างจ่าย', '未付运费'), n: d.unpaidShipping ? 1 : 0, shown: d.unpaidShipping ? `฿ ${money(d.unpaidShipping)}` : '0', tone: 'bad' as const },
    { key: 'exp', menu: 'expense.thai', text: t('Expenses waiting for a check-mark', 'ค่าใช้จ่ายรอตรวจ', '费用待校验'), n: d.unchecked.expenses },
    { key: 'tr', menu: 'transfer.thai', text: t('Customer deposit / withdraw to check', 'ฝาก-ถอนเงินลูกค้ารอตรวจ', '存款 - 提款待校验'), n: d.unchecked.transfers },
    { key: 'acc', menu: 'account.transfer', text: t('Account transfers to check', 'โอนเงินระหว่างบัญชีรอตรวจ', '帐户之间转移待校验'), n: d.unchecked.accountTransfers },
    { key: 'inc', menu: 'income.other', text: t('Other income to check', 'รายรับอื่นๆ รอตรวจ', '其他收入待校验'), n: d.unchecked.otherIncome },
    { key: 'bp', menu: 'invoice.paymentSearch', text: t('Supplier bill payments to check', 'รายการจ่ายบิลรอตรวจ', '付款待校验'), n: d.unchecked.billPayments },
  ].filter((x) => can.menu(x.menu)) : [];
  const open = todo.filter((x) => x.n > 0);
  const done = todo.filter((x) => !x.n);
  const flow = FLOW.filter((k) => can.menu(k));
  const groups = sidebarGroups(MENU.flatMap((g) => g.items).filter((i) => can.menu(i.key))).filter((x) => x.g.key !== 'main');

  return (
    <Page title={t('Dashboard', 'แดชบอร์ด', '仪表板')}
      actions={<button onClick={reload} disabled={loading}><RefreshCw size={16} aria-hidden className={loading ? 'spin' : ''} /> {t('Refresh', 'รีเฟรช', '刷新')}</button>}>
      {flow.length > 1 && (
        <Card title={t('Daily work, step by step', 'ขั้นตอนงานประจำวัน', '日常流程')}>
          <nav className="flow" aria-label={t('Daily work', 'ขั้นตอนงาน', '日常流程')}>
            {flow.map((k, i) => {
              const Ico: LucideIcon = ITEM_ICON[k];
              return (
                <Link key={k} to={ITEMS[k].path}>
                  <span className="flow-ico"><Ico size={18} aria-hidden /></span>
                  <span className="flow-step">{t('Step', 'ขั้นที่', '步骤')} {i + 1}</span>
                  <span className="flow-name"><Bi stack>{label(k)}</Bi></span>
                </Link>
              );
            })}
          </nav>
        </Card>
      )}

      <div className="dash">
        <div>
          <Card title={t('Waiting for you', 'งานที่รอทำ', '待办事项')} actions={d && <span className="muted">{open.length ? `${open.length} ${t('items', 'เรื่อง', '项')}` : t('All clear', 'เคลียร์หมดแล้ว', '全部完成')}</span>}>
            {!d ? <div className="skeleton" /> : (
              <ul className="todo">
                {open.map((x) => {
                  const Ico: LucideIcon = ITEM_ICON[x.menu];
                  return (
                    <li key={x.key}>
                      <Link to={ITEMS[x.menu].path}>
                        <span className={`todo-ico ${x.n ? x.tone || '' : ''}`}><Ico size={18} aria-hidden /></span>
                        <span className="todo-text"><Bi>{x.text}</Bi>{x.sub && <div className="todo-sub">{x.sub}</div>}</span>
                        <span className={`todo-num${x.n ? '' : ' zero'}`}>{x.shown ?? x.n}</span>
                        <ChevronRight size={16} aria-hidden className="chev" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {done.length > 0 && (
              <details className="more done-list">
                <summary><ChevronDown size={16} aria-hidden className="chev" /> <span className="muted" style={{ fontWeight: 500 }}>{t('Nothing waiting', 'ไม่มีงานค้าง', '没有待办')} ({done.length})</span></summary>
                <div className="chips">{done.map((x) => <Link key={x.key} className="chip" to={ITEMS[x.menu].path}><Bi>{x.text}</Bi></Link>)}</div>
              </details>
            )}
          </Card>
          {d && (
            <Card title={t('Recent shipment rounds', 'รอบขนส่งล่าสุด', '最近发货单')} actions={can.menu('shipment.list') && <Link to="/shipments">{t('All rounds', 'ดูทั้งหมด', '全部')}</Link>}>
              <Table columns={[
                { key: 'code', label: t('Round', 'รอบ', '发货单'), render: (r) => <b>{r.code}</b> },
                { key: 'date', label: t('Date', 'วันที่', '日期') },
                { key: 'boxes', label: t('Boxes', 'กล่อง', '包'), align: 'right' },
                { key: 'weight', label: t('Weight kg', 'น้ำหนัก กก.', '重量'), money: true },
                { key: 'status', label: t('Status', 'สถานะ', '状态'), render: (r) => { const s = SHIPMENT_STATUSES.find((x) => x.key === r.status); return s ? <Badge tone={s.tone}><Bi>{pick(s, lang)}</Bi></Badge> : r.arrived_date ? <Badge tone="good">{r.arrived_date}</Badge> : <Badge tone="info">{t('Packing', 'กำลังรวมของ', '集货中')}</Badge>; } },
              ]} rows={d.recentShipments} />
            </Card>
          )}
        </div>
        <div>
          {recent.length > 0 && (
            <Card title={t('Recently opened', 'เปิดล่าสุด', '最近打开')}>
              <div className="chips">
                {recent.map((k) => { const Ico: LucideIcon = ITEM_ICON[k]; return <Link key={k} className="chip" to={ITEMS[k].path}><Ico size={16} aria-hidden /><Bi>{label(k)}</Bi></Link>; })}
              </div>
            </Card>
          )}
          {d && (
            <div className="stats">
              <Stat label={t('Thai accounts (THB)', 'เงินในบัญชีไทย (บาท)', '泰铢总额')} value={`฿ ${money(d.totalThb)}`} to={can.menu('bank.total') ? '/bank/total' : undefined} />
              <Stat label={t('China accounts (CNY)', 'เงินในบัญชีจีน (หยวน)', '人民币总额')} value={`¥ ${money(d.totalCny)}`} to={can.menu('bank.total') ? '/bank/total' : undefined} />
              <Stat label={t('Exchange rate CNY→THB', 'เรทแลกเงิน', '汇率')} value={d.rate ? money(d.rate, 3) : '—'} to={can.menu('exchange') ? '/exchange' : undefined} />
              <Stat label={t('Customers', 'ลูกค้า', '客户')} value={d.customers} to={can.menu('customer.info') ? '/customers' : undefined} />
            </div>
          )}
          {d && (
            <Card title={t('Account balances', 'ยอดเงินแต่ละบัญชี', '各账户余额')}>
              <Table columns={[
                { key: 'name', label: t('Account', 'บัญชี', '帐户') },
                { key: 'is_cash', label: t('Type', 'ประเภท', '类别'), render: (r) => r.is_cash ? <Bi>{t('Cash', 'เงินสด', '现金')}</Bi> : <Bi>{t('Bank', 'ธนาคาร', '银行')}</Bi> },
                { key: 'balance', label: t('Balance', 'ยอดคงเหลือ', '余额'), money: true, render: (r) => <>{r.is_thai ? '฿' : '¥'} {money(r.balance)}</> },
              ]} rows={d.banks} />
            </Card>
          )}
        </div>
      </div>

      <Card>
        <details className="more">
          <summary><ChevronDown size={18} aria-hidden className="chev" /> <Bi>{t('All menus', 'เมนูทั้งหมด', '全部菜单')}</Bi> <span className="muted" style={{ fontWeight: 400 }}>· {t('tip: press Ctrl K to jump to any screen', 'กด Ctrl K เพื่อค้นหาเมนูได้เร็วกว่า', '按 Ctrl K 快速前往')}</span></summary>
          <div className="menu-index">
            {groups.map(({ g, items }) => {
              const GIco: LucideIcon = GROUP_ICON[g.key];
              return (
                <section key={g.key}>
                  <h3><GIco size={16} aria-hidden /> <Bi>{pick(g, lang)}</Bi></h3>
                  {items.map((i) => <Link key={i.key} to={i.path}><Bi>{pick(i, lang)}</Bi></Link>)}
                </section>
              );
            })}
          </div>
        </details>
      </Card>
    </Page>
  );
}
