import { Link } from 'react-router-dom';
import { MENU } from '../../shared/menus';
import { SHIPMENT_STATUSES } from '../../shared/statuses';
import { useApi, useT, money, useCan, useLang, pick } from '../lib';
import { Page, Card, Stat, Table, Badge } from '../ui';

export default function Dashboard() {
  const t = useT();
  const can = useCan();
  const { lang } = useLang();
  const { data: d, reload } = useApi<any>('/dashboard');
  // quick access: every screen this user may open, grouped like the side menu
  const quick = MENU.filter((g) => g.key !== 'main').map((g) => ({ g, items: g.items.filter((i) => can.menu(i.key)) })).filter((x) => x.items.length);
  if (!d) return <Page title={t('Dashboard', 'แดชบอร์ด', '仪表板')}><div className="muted">…</div></Page>;
  return (
    <Page title={t('Dashboard', 'แดชบอร์ด', '仪表板')} actions={<button onClick={reload}>↻ {t('Refresh', 'รีเฟรช', '刷新')}</button>}>
      <Card title={t('Quick access', 'เมนูลัด', '快捷菜单')}>
        {quick.map(({ g, items }) => (
          <div key={g.key}>
            <div className="quick-group">{pick(g, lang)}</div>
            <div className="quick">{items.map((i) => <Link key={i.key} to={i.path}>{pick(i, lang)}</Link>)}</div>
          </div>
        ))}
      </Card>
      <div className="stats">
        <Stat label={t('Money in Thai accounts (THB)', 'เงินไทยทั้งหมด (บาท)', '泰铢总额')} value={money(d.totalThb)} />
        <Stat label={t('Money in China accounts (CNY)', 'เงินหยวนทั้งหมด (หยวน)', '人民币总额')} value={money(d.totalCny)} />
        <Stat label={t('Exchange rate CNY→THB', 'เรทแลกเงิน', '汇率')} value={d.rate ? money(d.rate, 3) : '—'} />
        <Stat label={t('Customers', 'ลูกค้า', '客户')} value={d.customers} />
        <Stat label={t('Payment notices to check', 'ยอดแจ้งโอนรอตรวจ', '待核对付款')} value={`${d.pendingPayments} · ฿${money(d.pendingAmount)}`} tone={d.pendingPayments ? 'warn' : undefined} />
        <Stat label={t('Unpaid shipping (posted)', 'ค่าขนส่งค้างชำระ', '未付运费')} value={money(d.unpaidShipping)} tone={d.unpaidShipping ? 'bad' : undefined} />
        <Stat label={t('Supplier bills not fully paid', 'บิลโอนที่ยังจ่ายไม่ครบ', '未付划款单')} value={d.unpaidBills} />
        <Stat label={t('Order lines waiting to pack', 'รายการรอแพค', '等待打包')} value={d.waitingToPack} />
        <Stat label={t('Boxes not on a container yet', 'กระสอบที่ยังไม่ขึ้นตู้', '未发货包')} value={d.notLoaded} />
      </div>
      <div className="split">
        <Card title={t('Recent shipment rounds', 'รอบขนส่งล่าสุด', '最近发货单')} actions={can.menu('shipment.list') && <Link to="/shipments">{t('All', 'ทั้งหมด', '全部')} →</Link>}>
          <Table columns={[
            { key: 'code', label: t('Round', 'รอบ', '发货单') },
            { key: 'date', label: t('Date', 'วันที่', '日期') },
            { key: 'boxes', label: t('Boxes', 'กระสอบ', '包'), align: 'right' },
            { key: 'weight', label: t('Weight kg', 'น้ำหนัก', '重量'), money: true },
            { key: 'status', label: t('Status', 'สถานะ', '状态'), render: (r) => { const s = SHIPMENT_STATUSES.find((x) => x.key === r.status); return s ? <Badge tone={s.tone}>{pick(s, lang)}</Badge> : r.arrived_date ? <Badge tone="good">{r.arrived_date}</Badge> : <Badge tone="info">{t('Packing', 'กำลังรวมของ', '集货中')}</Badge>; } },
          ]} rows={d.recentShipments} />
        </Card>
        <Card title={t('Waiting for a check-mark', 'รายการรอตรวจสอบ', '待校验')}>
          <Table rowKey="k" columns={[{ key: 'k', label: t('Area', 'รายการ', '项目') }, { key: 'v', label: t('Count', 'จำนวน', '数量'), align: 'right' }]}
            rows={[
              { k: t('Expenses', 'ค่าใช้จ่าย', '费用'), v: d.unchecked.expenses },
              { k: t('Customer deposit / withdraw', 'ฝาก-ถอนเงินลูกค้า', '存款 - 提款'), v: d.unchecked.transfers },
              { k: t('Account transfers', 'โอนเงินระหว่างบัญชี', '帐户之间转移'), v: d.unchecked.accountTransfers },
              { k: t('Other income', 'รายรับอื่นๆ', '其他收入'), v: d.unchecked.otherIncome },
              { k: t('Supplier bill payments', 'จ่ายบิล', '付款'), v: d.unchecked.billPayments },
            ]} />
        </Card>
      </div>
      <Card title={t('Account balances', 'ยอดเงินแต่ละบัญชี', '各账户余额')}>
        <Table columns={[
          { key: 'name', label: t('Account', 'บัญชี', '帐户') },
          { key: 'is_thai', label: t('Currency', 'หน่วยเงิน', '币种'), render: (r) => r.is_thai ? 'THB' : 'CNY' },
          { key: 'is_cash', label: t('Type', 'ประเภท', '类别'), render: (r) => r.is_cash ? t('Cash', 'เงินสด', '现金') : t('Bank', 'ธนาคาร', '银行') },
          { key: 'balance', label: t('Balance', 'ยอดคงเหลือ', '余额'), money: true },
        ]} rows={d.banks} />
      </Card>
    </Page>
  );
}
