// One-off (2026-11-09): box codes were briefly replaced by yyyymmnnnn references. This moves that number to
// packings.reference_id and gives each box its PK… code back (from a backup taken before the change, else a new PK no.).
// Usage: DB_PATH=data/jjcargo.db npx tsx scripts/split-box-ref.ts <backup.db> [--dry]
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.env.DB_PATH || 'data/jjcargo.db';
const backupPath = process.argv[2];
const dry = process.argv.includes('--dry');
if (!backupPath) throw new Error('usage: split-box-ref.ts <backup.db> [--dry]');

const db = new DatabaseSync(dbPath);
const cols = (db.prepare('PRAGMA table_info(packings)').all() as any[]).map((c) => c.name);
if (!cols.includes('reference_id')) throw new Error('packings.reference_id missing: start the new server version once first');

const old = new Map<number, string>();
for (const r of new DatabaseSync(backupPath, { readOnly: true }).prepare('SELECT id, packing_code FROM packings').all() as any[]) {
  if (!/^\d{10,}$/.test(r.packing_code)) old.set(r.id, r.packing_code);
}

const rows = db.prepare("SELECT id, packing_code FROM packings WHERE reference_id IS NULL AND packing_code GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]*' ORDER BY id").all() as any[];
const used = new Set((db.prepare('SELECT packing_code FROM packings').all() as any[]).map((r) => String(r.packing_code).toUpperCase()));
const plan: { id: number; ref: string; code: string }[] = [];
// backup codes first, so a freshly numbered box can never take an old box's code
for (const r of rows) if (old.has(r.id) && !used.has(old.get(r.id)!.toUpperCase())) { plan.push({ id: r.id, ref: r.packing_code, code: old.get(r.id)! }); used.add(old.get(r.id)!.toUpperCase()); }
for (const r of rows) {
  if (plan.some((x) => x.id === r.id)) continue;
  let n = r.id;
  while (used.has(`PK${String(n).padStart(4, '0')}`)) n++;
  const code = `PK${String(n).padStart(4, '0')}`;
  used.add(code);
  plan.push({ id: r.id, ref: r.packing_code, code });
}

const upd = db.prepare("UPDATE packings SET packing_code = ?, reference_id = ?, updated_by = 'split-box-ref', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
if (!dry) {
  db.exec('BEGIN');
  try { for (const x of plan) upd.run(x.code, x.ref, x.id); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}
for (const x of plan.sort((a, b) => a.id - b.id)) console.log(`${x.id}\t${x.ref}\t-> ${x.code}${old.has(x.id) ? '' : '  (new PK no.)'}`);
console.log(`${dry ? '[dry run] ' : ''}${plan.length} boxes: reference_id set, PK code restored (${plan.filter((x) => old.has(x.id)).length} from backup)`);
