import { Link, useNavigate } from 'react-router-dom';
import { SHIPMENT_STATUSES } from '../../shared/statuses';
import type { ReactNode } from 'react';
import { useApi, useT, money, useCan, useLang, pick } from '../lib';
import { Page, Card, Stat, Table, Badge } from '../ui';

// A dashboard figure that opens the related screen when the user may see it.
function Tile({ to, menu, ...p }: { to: string; menu: string; label: ReactNode; value: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  const can = useCan();
  return can.menu(menu) ? <Link to={to} className="stat-link"><Stat {...p} /></Link> : <Stat {...p} />;
}

export default function Dashboard() {
  const t = useT();
  const can = useCan();
  const { lang } = useLang();
  const nav = useNavigate();
  const go = (menu: string, to: string) => (can.menu(menu) ? () => nav(to) : undefined);
  const { data: d, reload } = useApi<any>('/dashboard');
  if (!d) return <Page title={t('Dashboard', 'แดชบอร์ด', '仪表板')}><div className="muted">…</div></Page>;
  return (
    <Page title={t('Dashboard', 'แดชบอร์ด', '仪表板')} actions={<button onClick={reload}>↻ {t('Refresh', 'รีเฟรช', '刷新')}</button>}>
      <div className="stats">
        <Tile to="/bank/total" menu="bank.total" label={t('Money in Thai accounts (THB)', 'เงินไทยทั้งหมด (บาท)', '泰铢总额')} value={money(d.totalThb)} />
        <Tile to="/bank/total" menu="bank.total" label={t('Money in China accounts (CNY)', 'เงินหยวนทั้งหมด (หยวน)', '人民币总额')} value={money(d.totalCny)} />
        <Tile to="/exchange" menu="exchange" label={t('Exchange rate CNY→THB', 'เรทแลกเงิน', '汇率')} value={d.rate ? money(d.rate, 3) : '—'} />
        <Tile to="/customers" menu="customer.info" label={t('Customers', 'ลูกค้า', '客户')} value={d.customers} />
        <Tile to="/payments/check" menu="payment.check" label={t('Payment notices to check', 'ยอดแจ้งโอนรอตรวจ', '待核对付款')} value={`${d.pendingPayments} · ฿${money(d.pendingAmount)}`} tone={d.pendingPayments ? 'warn' : undefined} />
        <Tile to="/shipments/search" menu="shipment.search" label={t('Unpaid shipping (posted)', 'ค่าขนส่งค้างชำระ', '未付运费')} value={money(d.unpaidShipping)} tone={d.unpaidShipping ? 'bad' : undefined} />
        <Tile to="/packages" menu="package.search" label={t('Supplier bills not fully paid', 'บิลโอนที่ยังจ่ายไม่ครบ', '未付划款单')} value={d.unpaidBills} />
        <Tile to="/packing/new" menu="packing.new" label={t('Order lines waiting to pack', 'รายการรอแพค', '等待打包')} value={d.waitingToPack} />
        <Tile to="/shipments/load" menu="packing.offchina" label={t('Boxes not on a container yet', 'กระสอบที่ยังไม่ขึ้นตู้', '未发货包')} value={d.notLoaded} />
      </div>
      <div className="split">
        <Card title={t('Recent shipment rounds', 'รอบขนส่งล่าสุด', '最近发货单')} actions={can.menu('shipment.list') && <Link to="/shipments">{t('All', 'ทั้งหมด', '全部')} →</Link>}>
          <Table columns={[
            { key: 'code', label: t('Round', 'รอบ', '发货单') },
            { key: 'date', label: t('Date', 'วันที่', '日期') },
            { key: 'boxes', label: t('Boxes', 'กระสอบ', '包'), align: 'right' },
            { key: 'weight', label: t('Weight kg', 'น้ำหนัก', '重量'), money: true },
            { key: 'status', label: t('Status', 'สถานะ', '状态'), render: (r) => { const s = SHIPMENT_STATUSES.find((x) => x.key === r.status); return s ? <Badge tone={s.tone}>{pick(s, lang)}</Badge> : r.arrived_date ? <Badge tone="good">{r.arrived_date}</Badge> : <Badge tone="info">{t('Packing', 'กำลังรวมของ', '集货中')}</Badge>; } },
          ]} rows={d.recentShipments} onRow={can.menu('shipment.list') ? (r) => nav(`/shipments/${r.id}/report`) : undefined} />
        </Card>
        <Card title={t('Waiting for a check-mark', 'รายการรอตรวจสอบ', '待校验')}>
          <Table rowKey="k" onRow={(r: any) => r.go?.()} columns={[{ key: 'k', label: t('Area', 'รายการ', '项目') }, { key: 'v', label: t('Count', 'จำนวน', '数量'), align: 'right' }]}
            rows={[
              { k: t('Expenses', 'ค่าใช้จ่าย', '费用'), v: d.unchecked.expenses, go: go('expense.thai', '/expenses/TH') },
              { k: t('Customer deposit / withdraw', 'ฝาก-ถอนเงินลูกค้า', '存款 - 提款'), v: d.unchecked.transfers, go: go('transfer.thai', '/transfers/TH') },
              { k: t('Account transfers', 'โอนเงินระหว่างบัญชี', '帐户之间转移'), v: d.unchecked.accountTransfers, go: go('account.transfer', '/bank/transfers') },
              { k: t('Other income', 'รายรับอื่นๆ', '其他收入'), v: d.unchecked.otherIncome, go: go('income.other', '/other-income') },
              { k: t('Supplier bill payments', 'จ่ายบิล', '付款'), v: d.unchecked.billPayments, go: go('invoice.paymentSearch', '/invoice-payments') },
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
