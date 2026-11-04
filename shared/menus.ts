// Single source of truth for navigation + permissions. Used by server and client.
// Each menu key maps 1:1 to a screen of the original JJCargoForm desktop app.

export interface MenuItem {
  key: string;
  path: string;
  th: string;
  zh: string;
  en: string;
}
export interface MenuGroup {
  key: string;
  th: string;
  zh: string;
  en: string;
  items: MenuItem[];
}

export const MENU: MenuGroup[] = [
  {
    key: 'main', th: 'ภาพรวม', zh: '概览', en: 'Overview',
    items: [{ key: 'dashboard', path: '/', th: 'แดชบอร์ด', zh: '仪表板', en: 'Dashboard' }],
  },
  {
    key: 'order', th: 'ออเดอร์', zh: '订单', en: 'Orders',
    items: [
      { key: 'order.new', path: '/orders/new', th: 'เพิ่มออเดอร์ใหม่', zh: '新订单', en: 'New order' },
      { key: 'order.search', path: '/orders', th: 'ค้นหาออเดอร์', zh: '搜索订单', en: 'Search orders' },
      { key: 'package.new', path: '/packages/new', th: 'เปิดบิลโอนใหม่', zh: '开划款单', en: 'New supplier bill' },
      { key: 'package.search', path: '/packages', th: 'ค้นหาบิลโอนเงิน', zh: '找划款单', en: 'Search bills' },
      { key: 'package.lookup', path: '/lookup', th: 'ค้นหารายละเอียด', zh: '查找账单', en: 'Lookup order / bill' },
    ],
  },
  {
    key: 'packing', th: 'แพคของ / ขนส่ง', zh: '打包 / 发货', en: 'Packing & shipping',
    items: [
      { key: 'packing.new', path: '/packing/new', th: 'แพคของ + ชั่งน้ำหนัก', zh: '打包+称重', en: 'Pack & weigh' },
      { key: 'packing.nobill', path: '/packing/nobill', th: 'รับของไม่มีบิล', zh: '没有订单收货', en: 'Receive without bill' },
      { key: 'packing.weigh', path: '/packing/weigh', th: 'ชั่งน้ำหนัก / วัดขนาดทีหลัง', zh: '补录重量尺寸', en: 'Weigh boxes later' },
      { key: 'packing.bulk', path: '/packing/import', th: 'แพคจากไฟล์', zh: '从文件打包', en: 'Pack from file' },
      { key: 'packing.search', path: '/packing', th: 'ค้นหา PackingList', zh: '搜索 PackingList', en: 'Search packing list' },
      { key: 'shipment.list', path: '/shipments', th: 'รอบขนส่ง', zh: '发货运单', en: 'Shipment rounds' },
      { key: 'packing.offchina', path: '/shipments/load', th: 'ขึ้นตู้เมืองจีน', zh: '上车', en: 'Load container (off China)' },
      { key: 'shipment.summary', path: '/shipments/summary', th: 'สรุปยอดค่าขนส่ง', zh: '运费汇总', en: 'Shipping cost summary' },
      { key: 'shipment.search', path: '/shipments/search', th: 'ค้นหารายการค่าน้ำหนัก', zh: '查运费', en: 'Search shipping charges' },
      { key: 'style', path: '/styles', th: 'ประเภทสินค้า', zh: '产品分类', en: 'Product categories' },
    ],
  },
  {
    key: 'customer', th: 'ลูกค้า', zh: '客户', en: 'Customers',
    items: [
      { key: 'customer.info', path: '/customers', th: 'ข้อมูลลูกค้า', zh: '客户数据', en: 'Customer info' },
      { key: 'customer.balance', path: '/balances/THB', th: 'Balance เงินไทย', zh: '平衡泰铢', en: 'THB balance' },
      { key: 'customer.yuan', path: '/balances/CNY', th: 'Balance เงินจีน', zh: '平衡人民币', en: 'CNY balance' },
      { key: 'customer.payment', path: '/payments', th: 'รายการแจ้งโอน', zh: '付款通知', en: 'Payment notices' },
    ],
  },
  {
    key: 'account', th: 'ฝ่ายบัญชี', zh: '帐户部门', en: 'Accounting',
    items: [
      { key: 'payment.check', path: '/payments/check', th: 'ตรวจสอบยอดโอนเงินลูกค้า', zh: '核对付款', en: 'Check payments' },
      { key: 'bank.statement', path: '/bank/statements', th: 'รายการเดินบัญชี', zh: '银行流水', en: 'Bank statements' },
      { key: 'bank.import', path: '/bank/import', th: 'ดึงยอดธนาคาร', zh: '拉银行余额', en: 'Import bank statement' },
      { key: 'bank.total', path: '/bank/total', th: 'สรุปยอดเงินทั้งหมด', zh: '总余额', en: 'Total money' },
      { key: 'transfer.china', path: '/transfers/CN', th: 'ฝาก-ถอนเงิน กวางโจว', zh: '中国 存款 - 提款', en: 'China deposit / withdraw' },
      { key: 'transfer.thai', path: '/transfers/TH', th: 'ฝาก-ถอนเงิน เมืองไทย', zh: '泰国 存款 - 提款', en: 'Thai deposit / withdraw' },
      { key: 'account.transfer', path: '/bank/transfers', th: 'โอนเงินระหว่างบัญชี', zh: '帐户之间转移', en: 'Account transfers' },
      { key: 'invoice.payment', path: '/invoice-payments/new', th: 'จ่ายบิล', zh: '付款', en: 'Pay supplier bill' },
      { key: 'invoice.paymentSearch', path: '/invoice-payments', th: 'ค้นหารายการจ่ายบิล', zh: '查付款', en: 'Bill payments' },
      { key: 'expense.thai', path: '/expenses/TH', th: 'ค่าใช้จ่ายเมืองไทย', zh: '泰国费用', en: 'Thai expenses' },
      { key: 'expense.china', path: '/expenses/CN', th: 'ค่าใช้จ่ายเมืองจีน', zh: '中国费用', en: 'China expenses' },
      { key: 'income.other', path: '/other-income', th: 'รายรับอื่นๆ', zh: '其他收入', en: 'Other income' },
      { key: 'exchange', path: '/exchange', th: 'การแลกเปลี่ยนเงิน', zh: '换钱', en: 'Currency exchange' },
      { key: 'unpaid', path: '/unpaid', th: 'สรุปยอดลูกค้าค้างจ่าย', zh: '未付款', en: 'Unpaid summary' },
    ],
  },
  {
    key: 'admin', th: 'ตั้งค่าอื่นๆ', zh: '其他', en: 'Settings',
    items: [
      { key: 'bank.info', path: '/bank/accounts', th: 'ข้อมูลบัญชีธนาคาร', zh: '银行信息', en: 'Bank accounts' },
      { key: 'employees', path: '/employees', th: 'ข้อมูลพนักงาน', zh: '员工信息', en: 'Employees & roles' },
      { key: 'permission', path: '/permissions', th: 'ตั้งค่าการเข้าถึงเมนู', zh: '权限', en: 'Menu permissions' },
      { key: 'verify', path: '/verify-settings', th: 'ตั้งค่าการตรวจสอบ', zh: '校验设置', en: 'Verify permissions' },
      { key: 'settings', path: '/settings', th: 'ตั้งค่าทั่วไป', zh: '一般设置', en: 'General settings' },
    ],
  },
];

export const ALL_MENU_KEYS = MENU.flatMap((g) => g.items.map((i) => i.key));

// Things that need a "checked / verified" sign-off, as in VerifySettingForm.
export const VERIFY_KEYS: { key: string; th: string; zh: string; en: string }[] = [
  { key: 'payment', th: 'ตรวจยอดแจ้งโอน', zh: '核对付款', en: 'Customer payments' },
  { key: 'transfer', th: 'ฝาก-ถอนเงินลูกค้า', zh: '存款 - 提款', en: 'Customer deposit / withdraw' },
  { key: 'account_transfer', th: 'โอนเงินระหว่างบัญชี', zh: '帐户之间转移', en: 'Account transfers' },
  { key: 'expense', th: 'ค่าใช้จ่าย', zh: '费用', en: 'Expenses' },
  { key: 'other_income', th: 'รายรับอื่นๆ', zh: '其他收入', en: 'Other income' },
  { key: 'invoice_payment', th: 'จ่ายบิล', zh: '付款', en: 'Supplier bill payments' },
  { key: 'exchange', th: 'แลกเงิน', zh: '换钱', en: 'Currency exchange' },
  { key: 'bank_statement', th: 'แก้ไขรายการเดินบัญชี', zh: '修改银行流水', en: 'Edit bank statements' },
];
