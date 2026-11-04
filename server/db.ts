import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.js';

const DB_PATH = process.env.DB_PATH || path.resolve('data/jjcargo.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

type Params = Record<string, unknown> | unknown[];
const norm = (p?: Params) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);

export function all<T = any>(sql: string, p?: Params): T[] {
  return db.prepare(sql).all(...(norm(p) as any[])) as T[];
}
export function get<T = any>(sql: string, p?: Params): T | undefined {
  return db.prepare(sql).get(...(norm(p) as any[])) as T | undefined;
}
export function run(sql: string, p?: Params) {
  const r = db.prepare(sql).run(...(norm(p) as any[]));
  return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
}
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY, description TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, address TEXT, email TEXT,
  role_id INTEGER REFERENCES roles(id), salary REAL DEFAULT 0, start_date TEXT,
  username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, is_active INTEGER DEFAULT 1, is_admin INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS role_menus (role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE, menu_key TEXT, PRIMARY KEY (role_id, menu_key));
CREATE TABLE IF NOT EXISTS user_menus (employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE, menu_key TEXT, PRIMARY KEY (employee_id, menu_key));
CREATE TABLE IF NOT EXISTS verify_items (employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE, verify_key TEXT, PRIMARY KEY (employee_id, verify_key));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS provinces (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, firstname TEXT, lastname TEXT, nickname TEXT,
  phone TEXT, email TEXT, kilo_rate REAL, cubic_rate REAL, kilo_rate_yuan REAL, cubic_rate_yuan REAL,
  calc_type TEXT DEFAULT 'mix', credit_limit REAL DEFAULT 0, username TEXT, remark TEXT,
  parent_id INTEGER REFERENCES customers(id), recommender_id INTEGER REFERENCES customers(id),
  is_deleted INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, edited_by TEXT, edited_at TEXT
);
CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT, address TEXT, province_id INTEGER REFERENCES provinces(id), postcode TEXT, is_default INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS customer_balances (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), currency TEXT NOT NULL CHECK (currency IN ('THB','CNY')),
  ref_code TEXT, description TEXT, date TEXT NOT NULL, income REAL DEFAULT 0, expense REAL DEFAULT 0,
  source TEXT, source_id INTEGER, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, edited_by TEXT, edit_history TEXT
);

CREATE TABLE IF NOT EXISTS banks (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, nickname TEXT, account_name TEXT, account_number TEXT,
  is_active INTEGER DEFAULT 1, is_thai INTEGER DEFAULT 1, opening_balance REAL DEFAULT 0,
  customer_visible INTEGER DEFAULT 0, is_cash INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bank_statements (
  id INTEGER PRIMARY KEY, bank_id INTEGER NOT NULL REFERENCES banks(id), date TEXT NOT NULL,
  income REAL DEFAULT 0, expense REAL DEFAULT 0, detail TEXT, bank_detail TEXT,
  payment_id INTEGER, source TEXT, source_id INTEGER, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS exchange_rates (id INTEGER PRIMARY KEY, date TEXT NOT NULL, rate REAL NOT NULL);
CREATE TABLE IF NOT EXISTS exchanges (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, rate REAL NOT NULL, yuan_amount REAL NOT NULL, baht_amount REAL NOT NULL,
  status TEXT DEFAULT 'open', created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, checked INTEGER DEFAULT 0, checked_by TEXT
);
CREATE TABLE IF NOT EXISTS exchange_items (
  id INTEGER PRIMARY KEY, exchange_id INTEGER NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE, bank_id INTEGER REFERENCES banks(id),
  date TEXT, amount REAL NOT NULL, bank_fee REAL DEFAULT 0, is_thai INTEGER NOT NULL, created_by TEXT
);

CREATE TABLE IF NOT EXISTS style_units (id INTEGER PRIMARY KEY, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS styles (
  id INTEGER PRIMARY KEY, en TEXT, zh TEXT, th TEXT, unit_id INTEGER REFERENCES style_units(id), active INTEGER DEFAULT 1, is_deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS supplier_banks (
  id INTEGER PRIMARY KEY, bank TEXT NOT NULL, account_name TEXT, account_number TEXT, tel TEXT, is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), supplier_name TEXT, supplier_phone TEXT,
  order_date TEXT NOT NULL, payment_type TEXT DEFAULT 'credit', deposit REAL DEFAULT 0,
  created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT, style_id INTEGER REFERENCES styles(id), unit_price REAL DEFAULT 0, quantity REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, date TEXT NOT NULL, customer_id INTEGER NOT NULL REFERENCES customers(id),
  supplier_bank_id INTEGER REFERENCES supplier_banks(id), deposit REAL DEFAULT 0, is_done_paid INTEGER DEFAULT 0,
  created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS package_items (
  id INTEGER PRIMARY KEY, package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id), quantity REAL NOT NULL, unit_price REAL NOT NULL,
  receive_date TEXT, deposit REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS package_item_statements (
  id INTEGER PRIMARY KEY, package_item_id INTEGER NOT NULL REFERENCES package_items(id) ON DELETE CASCADE,
  type TEXT, amount REAL NOT NULL, description TEXT, payment_ref TEXT, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS package_payments (
  id INTEGER PRIMARY KEY, package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE, amount REAL NOT NULL,
  bank_fee REAL DEFAULT 0, service_fee REAL DEFAULT 0, date TEXT NOT NULL, bank_id INTEGER REFERENCES banks(id),
  payment_ref TEXT, finished INTEGER DEFAULT 0, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, checked INTEGER DEFAULT 0, checked_by TEXT
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, date TEXT NOT NULL, arrived_date TEXT,
  created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS packings (
  id INTEGER PRIMARY KEY, packing_code TEXT NOT NULL UNIQUE, shipment_id INTEGER REFERENCES shipments(id),
  ctn INTEGER, no INTEGER, customer_id INTEGER NOT NULL REFERENCES customers(id),
  weight REAL DEFAULT 0, cubic1 REAL DEFAULT 0, cubic2 REAL DEFAULT 0, cubic3 REAL DEFAULT 0,
  remark TEXT, tracking_no TEXT, rate_type TEXT, rate REAL, off_china_date TEXT,
  created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS packing_items (
  id INTEGER PRIMARY KEY, packing_id INTEGER NOT NULL REFERENCES packings(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id), quantity REAL NOT NULL, tracking_no TEXT, created_by TEXT
);
CREATE TABLE IF NOT EXISTS packing_styles (
  id INTEGER PRIMARY KEY, packing_id INTEGER NOT NULL REFERENCES packings(id) ON DELETE CASCADE,
  style_id INTEGER NOT NULL REFERENCES styles(id), quantity REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS shipment_other_amounts (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  detail TEXT, amount REAL NOT NULL, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS shipment_summaries (
  shipment_id INTEGER REFERENCES shipments(id), customer_id INTEGER REFERENCES customers(id), currency TEXT DEFAULT 'THB',
  total REAL NOT NULL, balance_id INTEGER, paid INTEGER DEFAULT 0, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shipment_id, customer_id)
);

CREATE TABLE IF NOT EXISTS payment_statuses (id INTEGER PRIMARY KEY, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payment_infos (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), bank_id INTEGER REFERENCES banks(id),
  payment_date TEXT, inform_date TEXT, description TEXT, amount_check REAL DEFAULT 0, amount_paid REAL,
  remark TEXT, reference TEXT, type TEXT DEFAULT 'topup', status_id INTEGER DEFAULT 1 REFERENCES payment_statuses(id),
  exchange_rate REAL, exchange_fee REAL, shipment_id INTEGER REFERENCES shipments(id), is_thai INTEGER DEFAULT 1,
  pay_from TEXT DEFAULT 'bank', statement_id INTEGER, balance_id INTEGER,
  checked_by TEXT, checked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customer_transfers (
  id INTEGER PRIMARY KEY, region TEXT NOT NULL CHECK (region IN ('CN','TH')), customer_id INTEGER NOT NULL REFERENCES customers(id),
  ref_code TEXT, date TEXT NOT NULL, income REAL DEFAULT 0, expense REAL DEFAULT 0, bank_fee REAL DEFAULT 0, service_fee REAL DEFAULT 0,
  company_cost REAL DEFAULT 0, remark TEXT, bank_id INTEGER REFERENCES banks(id), balance_id INTEGER,
  created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, checked INTEGER DEFAULT 0, checked_by TEXT
);
CREATE TABLE IF NOT EXISTS account_transfers (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, amount REAL NOT NULL, bank_fee REAL DEFAULT 0, company_cost REAL DEFAULT 0,
  from_bank_id INTEGER NOT NULL REFERENCES banks(id), to_bank_id INTEGER NOT NULL REFERENCES banks(id), remark TEXT,
  created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, checked INTEGER DEFAULT 0, checked_by TEXT
);
CREATE TABLE IF NOT EXISTS expense_types (id INTEGER PRIMARY KEY, description TEXT NOT NULL, is_thai INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS daily_expenses (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, amount REAL NOT NULL, bank_fee REAL DEFAULT 0, remark TEXT,
  bank_id INTEGER REFERENCES banks(id), type_id INTEGER REFERENCES expense_types(id), is_thai INTEGER DEFAULT 1,
  created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, checked INTEGER DEFAULT 0, checked_by TEXT
);
CREATE TABLE IF NOT EXISTS other_incomes (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, amount REAL NOT NULL, remark TEXT, bank_id INTEGER REFERENCES banks(id),
  created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, checked INTEGER DEFAULT 0, checked_by TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, at TEXT DEFAULT CURRENT_TIMESTAMP, username TEXT, action TEXT, entity TEXT, entity_id INTEGER, detail TEXT
);
CREATE TABLE IF NOT EXISTS shipment_status_log (
  id INTEGER PRIMARY KEY, shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE, status TEXT NOT NULL,
  date TEXT NOT NULL, note TEXT, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_bal_cust ON customer_balances(customer_id, currency, date);
CREATE INDEX IF NOT EXISTS ix_stmt_bank ON bank_statements(bank_id, date);
CREATE INDEX IF NOT EXISTS ix_pack_ship ON packings(shipment_id, customer_id);
CREATE INDEX IF NOT EXISTS ix_oi_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS ix_pki_oi ON package_items(order_item_id);
CREATE INDEX IF NOT EXISTS ix_pki_pkg ON package_items(package_id);
CREATE INDEX IF NOT EXISTS ix_pgi_oi ON packing_items(order_item_id);
CREATE INDEX IF NOT EXISTS ix_pgi_pk ON packing_items(packing_id);
CREATE INDEX IF NOT EXISTS ix_pkp_pkg ON package_payments(package_id);
CREATE INDEX IF NOT EXISTS ix_pks_pi ON package_item_statements(package_item_id);
`;

const PROVINCES = `กรุงเทพมหานคร,กระบี่,กาญจนบุรี,กาฬสินธุ์,กำแพงเพชร,ขอนแก่น,จันทบุรี,ฉะเชิงเทรา,ชลบุรี,ชัยนาท,ชัยภูมิ,ชุมพร,เชียงราย,เชียงใหม่,ตรัง,ตราด,ตาก,นครนายก,นครปฐม,นครพนม,นครราชสีมา,นครศรีธรรมราช,นครสวรรค์,นนทบุรี,นราธิวาส,น่าน,บึงกาฬ,บุรีรัมย์,ปทุมธานี,ประจวบคีรีขันธ์,ปราจีนบุรี,ปัตตานี,พระนครศรีอยุธยา,พะเยา,พังงา,พัทลุง,พิจิตร,พิษณุโลก,เพชรบุรี,เพชรบูรณ์,แพร่,ภูเก็ต,มหาสารคาม,มุกดาหาร,แม่ฮ่องสอน,ยโสธร,ยะลา,ร้อยเอ็ด,ระนอง,ระยอง,ราชบุรี,ลพบุรี,ลำปาง,ลำพูน,เลย,ศรีสะเกษ,สกลนคร,สงขลา,สตูล,สมุทรปราการ,สมุทรสงคราม,สมุทรสาคร,สระแก้ว,สระบุรี,สิงห์บุรี,สุโขทัย,สุพรรณบุรี,สุราษฎร์ธานี,สุรินทร์,หนองคาย,หนองบัวลำภู,อ่างทอง,อำนาจเจริญ,อุดรธานี,อุตรดิตถ์,อุทัยธานี,อุบลราชธานี`.split(',');

export const DEFAULT_SETTINGS: Record<string, string> = {
  kilo_rate: '35',
  cubic_rate: '5500',
  kilo_rate_yuan: '7',
  cubic_rate_yuan: '1100',
  printer_name: 'POSTEK C168/200i',
  print_after_pack: '1',
  show_shipment_while_weighing: '1',
  input_ctn_and_no: '0',
  print_text: 'JJ Cargo',
  print_phone: '',
  status_webhook_url: '',
};

function addColumn(table: string, col: string, def: string) {
  const cols = all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

export function migrate() {
  db.exec(SCHEMA);
  // 2026-11 demo feedback: shop order number on orders, status on shipment rounds
  addColumn('orders', 'order_no', 'TEXT');
  addColumn('shipments', 'status', 'TEXT');
  addColumn('shipments', 'status_date', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS ix_orders_no ON orders(order_no)');
  if (!get('SELECT 1 FROM provinces LIMIT 1')) {
    PROVINCES.forEach((n, i) => run('INSERT INTO provinces (id, name) VALUES (?, ?)', [i + 1, n]));
  }
  if (!get('SELECT 1 FROM payment_statuses LIMIT 1')) {
    [[1, 'pending'], [2, 'approved'], [3, 'rejected']].forEach((r) => run('INSERT INTO payment_statuses VALUES (?, ?)', r));
  }
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }
  if (!get('SELECT 1 FROM employees LIMIT 1')) {
    const role = run("INSERT INTO roles (description) VALUES ('Admin')");
    run('INSERT INTO employees (name, username, password_hash, role_id, is_admin) VALUES (?, ?, ?, ?, 1)', [
      'Administrator', process.env.ADMIN_USER || 'admin', hashPassword(process.env.ADMIN_PASSWORD || 'admin123'), role.id,
    ]);
  }
  if (!get('SELECT 1 FROM style_units LIMIT 1')) {
    ['ชิ้น 件', 'กล่อง 箱', 'ม้วน 卷', 'กิโล 公斤', 'คู่ 双'].forEach((u) => run('INSERT INTO style_units (description) VALUES (?)', [u]));
  }
}

export function setting(key: string): string {
  return get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? DEFAULT_SETTINGS[key] ?? '';
}

export function audit(username: string, action: string, entity: string, entityId?: number, detail?: unknown) {
  run('INSERT INTO audit_log (username, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)', [
    username, action, entity, entityId ?? null, detail === undefined ? null : JSON.stringify(detail),
  ]);
}
