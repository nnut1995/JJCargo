// Walks the whole business flow through the HTTP API. Used by `npm test` (with assertions)
// and `npm run seed` (to fill an empty database with demo data).
import assert from 'node:assert/strict';

export type Call = (path: string, opts?: { method?: string; body?: unknown; expect?: number }) => Promise<any>;

export function client(base: string): Call {
  let cookie = '';
  return async (path, opts = {}) => {
    const res = await fetch(base + '/api' + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    const want = opts.expect ?? 200;
    if (res.status !== want) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status} (wanted ${want}): ${JSON.stringify(data)}`);
    return data;
  };
}

export async function runFlow(call: Call, log = (_: string) => {}) {
  const d = new Date().toISOString().slice(0, 10);
  await call('/login', { body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' } });

  log('settings, banks, styles, rate');
  await call('/settings', { method: 'PUT', body: { kilo_rate: '30', cubic_rate: '5000', kilo_rate_yuan: '6', cubic_rate_yuan: '1000', print_text: 'JJ Cargo' } });
  const kbank = await call('/r/banks', { body: { name: 'KBANK กสิกร', account_name: 'JJ Cargo Co.', account_number: '123-4-56789-0', is_thai: 1, opening_balance: 100000 } });
  const cashTh = await call('/r/banks', { body: { name: 'เงินสด Cash TH', is_thai: 1, is_cash: 1, opening_balance: 5000 } });
  const icbc = await call('/r/banks', { body: { name: 'ICBC 工行', account_name: '广州 JJ', account_number: '6222 0000 1111', is_thai: 0, opening_balance: 50000 } });
  const unit = (await call('/r/style_units'))[0];
  const shoes = await call('/r/styles', { body: { zh: '鞋子', th: 'รองเท้า', en: 'Shoes', unit_id: unit.id } });
  const clothes = await call('/r/styles', { body: { zh: '衣服', th: 'เสื้อผ้า', en: 'Clothes', unit_id: unit.id } });
  await call('/r/exchange_rates', { body: { date: d, rate: 5 } });
  const supplier = await call('/r/supplier_banks', { body: { bank: 'ICBC 工行', account_name: '义乌小商品', account_number: '6222 1234 5678', tel: '13800000000' } });

  log('customers');
  const a = await call('/customers', { body: { code: 'M4-001', firstname: 'สมชาย', nickname: 'ชาย', phone: '0812345678', calc_type: 'mix' } });
  const b = await call('/customers', { body: { code: 'KOOK', firstname: 'Kook', kilo_rate: 25, cubic_rate: 4500, calc_type: 'kilo' } });
  await call('/customers', { body: { code: 'KOOK' }, expect: 409 });
  await call('/r/customer_addresses', { body: { customer_id: a.id, name: 'สมชาย', address: '41/1 ซ.เอกชัย 83/1 ถ.เอกชัย แขวงบางบอน', province_id: 1, postcode: '10150', is_default: 1 } });

  log('customer money in: China deposit (CNY)');
  await call('/transfers/CN', { body: { customer_id: a.id, date: d, income: 2000, bank_id: icbc.id, ref_code: 'CN-1' } });
  const pBal = await call('/customers/' + a.id);
  assert.equal(pBal.balance_cny, 2000);

  log('order → bill (receive goods) → pay supplier');
  const order = await call('/orders', { body: { customer_id: a.id, supplier_name: '义乌小商品', order_date: d, items: [
    { product_id: 'TB-1001', style_id: shoes.id, quantity: 10, unit_price: 50 },
    { product_id: 'TB-1002', style_id: clothes.id, quantity: 20, unit_price: 30 },
  ] } });
  const o = await call('/orders/' + order.id);
  assert.equal(o.items.length, 2);
  const waiting = await call(`/packages/waiting?customer_id=${a.id}`);
  assert.equal(waiting.length, 2);
  const pkg = await call('/packages', { body: { customer_id: a.id, date: d, supplier_bank_id: supplier.id, items: [
    { order_item_id: o.items[0].id, quantity: 10, unit_price: 50 },
    { order_item_id: o.items[1].id, quantity: 15, unit_price: 30 },
  ] } });
  await call('/packages', { body: { customer_id: a.id, items: [{ order_item_id: o.items[0].id, quantity: 1, unit_price: 50 }] }, expect: 409 }); // over-receive
  let k = await call('/packages/' + pkg.id);
  assert.equal(k.due, 950);
  await call(`/package-items/${k.items[1].id}/statements`, { body: { type: 'refund', amount: 50, description: 'shop refund' } });
  k = await call('/packages/' + pkg.id);
  assert.equal(k.due, 900);
  await call(`/packages/${pkg.id}/payments`, { body: { amount: 900, bank_fee: 5, service_fee: 18, bank_id: icbc.id, date: d } });
  k = await call('/packages/' + pkg.id);
  assert.equal(k.is_done_paid, 1);
  assert.equal(k.customer_balance_cny, 2000 - 918);

  log('packing: with order + without bill');
  const pk1 = await call('/packing', { body: { customer_id: a.id, weight: 12.5, cubic1: 40, cubic2: 50, cubic3: 30, items: [
    { order_item_id: o.items[0].id, quantity: 10 }, { order_item_id: o.items[1].id, quantity: 15 },
  ] } });
  // packing can go up to the ordered qty (20) even though only 15 were billed: 5 left, so 6 is too many
  await call('/packing', { body: { customer_id: a.id, items: [{ order_item_id: o.items[1].id, quantity: 6 }] }, expect: 409 });
  // box code = PK + running no.; reference id = yyyymm + monthly running no., e.g. 2026110001
  const ym = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  assert.match(pk1.created[0].code, /^PK\d{4,}$/);
  const ref1 = (await call(`/packing/${pk1.created[0].id}`)).reference_id;
  assert.match(ref1, new RegExp(`^${ym}\\d{4}$`));
  assert.ok((await call(`/packing?ref=${ref1}`)).some((x: any) => x.id === pk1.created[0].id));
  const nb = await call('/packing', { body: { customer_id: b.id, weight: 51.12, cubic1: 40, cubic2: 90, cubic3: 90, tracking_no: 'CH83207', boxes: 2, styles: [{ style_id: clothes.id, quantity: 100 }] } });
  assert.equal(nb.created.length, 2);
  // boxes saved together share one running number with -1, -2 …; the next save continues the count
  const nbRefs = await Promise.all(nb.created.map(async (c: any) => (await call(`/packing/${c.id}`)).reference_id));
  const base = Number(ref1.slice(6)) + 1;
  assert.deepEqual(nbRefs, [1, 2].map((i) => `${ym}${String(base).padStart(4, '0')}-${i}`));
  assert.equal((await call(`/packing/${nbRefs[1]}`)).id, nb.created[1].id);

  log('demo feedback: receive first, weigh later; order numbers; overview per customer');
  await call('/r/banks', { body: { name: 'no currency chosen' }, expect: 400 });
  const ordNo = await call('/orders', { body: { customer_id: b.id, order_no: 'TB-778899', order_date: d, items: [{ product_id: 'X-1', style_id: shoes.id, quantity: 4, unit_price: 10 }] } });
  await call('/orders', { body: { customer_id: b.id, order_no: 'TB-778899', order_date: d, items: [{ product_id: 'X-2', quantity: 1 }] }, expect: 409 });
  assert.equal((await call('/orders?id=778899')).length, 1);
  const w1 = await call(`/packing/waiting?order_id=TB-778899`); // no supplier bill yet, still packable
  assert.equal(w1.length, 1);
  assert.equal(w1[0].order_no, 'TB-778899');
  const rcv = await call('/packing', { body: { customer_id: b.id, boxes: 3 } }); // no weight, no size, no contents
  assert.equal(rcv.created.length, 3);
  const pkOrd = await call('/packing', { body: { customer_id: b.id, items: [{ order_item_id: w1[0].id, quantity: 3 }] } });
  assert.equal(pkOrd.packings[0].order_nos, 'TB-778899');
  assert.equal((await call('/orders?id=TB-778899'))[0].packed_qty, 3);
  const unmeasured = await call(`/packing?unmeasured=1&customer_id=${b.id}`);
  assert.equal(unmeasured.length, 4);
  await call('/packing/measure', { body: { rows: [...rcv.created, pkOrd.created[0]].map((c: any) => ({ id: c.id, weight: 2, cubic1: 10, cubic2: 10, cubic3: 10 })) } });
  assert.equal((await call(`/packing?unmeasured=1&customer_id=${b.id}`)).length, 0);
  // one search box finds a box by order no., box code or tracking
  assert.ok((await call('/packing?ref=778899')).some((x: any) => x.id === pkOrd.created[0].id));
  assert.ok((await call(`/packing?ref=${pkOrd.packings[0].packing_code}`)).some((x: any) => x.id === pkOrd.created[0].id));
  // transport mode (truck / ship) is saved, filterable and validated
  await call(`/packing/${pkOrd.created[0].id}`, { method: 'PUT', body: { transport: 'ship' } });
  assert.ok((await call('/packing?transport=ship')).some((x: any) => x.id === pkOrd.created[0].id));
  await call(`/packing/${pkOrd.created[0].id}`, { method: 'PUT', body: { transport: 'plane' }, expect: 400 });
  // กระสอบรวม: small parcels (any customers) go into one sack; parcels keep code/customer, follow the sack, are charged after the split
  const small = await Promise.all([b.id, b.id, a.id].map((cid) => call('/packing', { body: { customer_id: cid, tracking_no: 'SF' + cid } })));
  const smallIds = small.map((x: any) => x.created[0].id);
  await call('/packing/merge', { body: { ids: [smallIds[0]] }, expect: 400 });
  const sack = await call('/packing/merge', { body: { ids: smallIds.slice(0, 2) } });
  assert.equal(sack.children.length, 2);
  assert.equal(sack.customer_id, b.id);
  const sack2 = await call('/packing/merge', { body: { ids: [sack.id, smallIds[2]] } }); // add another customer's parcel to the sack
  assert.equal(sack2.id, sack.id);
  assert.equal(sack2.children.length, 3);
  assert.deepEqual(sack2.other_customer_ids, [a.id]);
  await call('/packing/merge', { body: { ids: [smallIds[0], smallIds[2]] }, expect: 409 }); // already in a sack
  const inWeigh = await call('/packing?unmeasured=1');
  assert.ok(inWeigh.some((x: any) => x.id === sack.id) && !inWeigh.some((x: any) => smallIds.includes(x.id)));
  await call(`/packing/${sack.id}`, { method: 'DELETE', expect: 409 });
  const split1 = await call(`/packing/${sack.id}/split`, { body: { ids: [smallIds[2]] } });
  assert.equal(split1.deleted, false);
  assert.deepEqual((await call(`/packing/${sack.id}`)).other_customer_ids, []);
  assert.equal((await call(`/packing/${sack.id}/split`, { body: {} })).deleted, true);
  await call(`/packing/${sack.id}`, { expect: 404 });
  for (const id of smallIds) await call(`/packing/${id}`, { method: 'DELETE' });
  // secondary customers: box shows up under them too, shipping stays with the main customer
  await call(`/packing/${pkOrd.created[0].id}`, { method: 'PUT', body: { other_customer_ids: [a.id, b.id] } });
  const withOther = await call(`/packing/${pkOrd.created[0].id}`);
  assert.deepEqual(withOther.other_customer_ids, [a.id]); // main customer is never stored as secondary
  assert.ok((await call(`/packing?customer_id=${a.id}`)).some((x: any) => x.id === pkOrd.created[0].id && x.other_customers === 'M4-001'));
  await call(`/packing/${pkOrd.created[0].id}`, { method: 'PUT', body: { other_customer_ids: [] } });
  assert.ok(!(await call(`/packing?customer_id=${a.id}`)).some((x: any) => x.id === pkOrd.created[0].id));
  const over = await call('/packing/by-customer');
  const ob = over.find((x: any) => x.customer_id === b.id);
  assert.equal(ob.boxes, 6);
  assert.ok(String(ob.order_nos).includes('TB-778899'));
  for (const c of [...rcv.created, pkOrd.created[0]]) await call(`/packing/${c.id}`, { method: 'DELETE' });
  await call(`/orders/${ordNo.id}`, { method: 'DELETE' }); // boxes removed, so the order can be deleted again

  log('bulk import (old ShipmentN.txt format)');
  const imp = await call('/packing/import', { body: { text: '-1|1|344|PKX119738|494|KOOK|17.67|35|40|55|CH60328\n-2|2|2|PKX0027|3|NOPE|1|1|1|1|', commit: true, style_id: shoes.id } });
  assert.equal(imp.created.length, 1);

  log('shipment round, load container, summary, payment');
  const ship = await call('/r/shipments', { body: { code: 'JJ-' + d.replace(/-/g, ''), date: d } });
  for (const p of [pk1.created[0], ...nb.created, imp.created[0]]) await call(`/shipments/${ship.id}/load`, { body: { code: p.code, date: d } });
  const loaded = await call(`/shipments/${ship.id}/packings`);
  assert.equal(loaded.length, 4);
  // the scan box also takes the CTN number of a box on this round, and a tracking no.
  const byCtn = await call(`/shipments/${ship.id}/load`, { body: { code: String(loaded[0].ctn), date: d } });
  assert.equal(byCtn.id, loaded[0].id);
  const tracked = loaded.find((x: any) => x.tracking_no);
  if (tracked) assert.equal((await call(`/shipments/${ship.id}/load`, { body: { code: tracked.tracking_no, date: d } })).id, tracked.id);
  assert.equal((await call(`/shipments/${ship.id}/packings`)).length, 4);
  const sum = await call(`/shipments/${ship.id}/summary`);
  const sa = sum.find((x: any) => x.id === a.id);
  // M4-001 mix: 12.5kg*30=375 vs 0.06m3*5000=300 → 375
  assert.equal(sa.total, 375);
  const sb = sum.find((x: any) => x.id === b.id);
  assert.equal(sb.total, Math.round((51.12 * 25 * 2 + 17.67 * 25) * 100) / 100);
  await call('/r/shipment_other_amounts', { body: { customer_id: a.id, shipment_id: ship.id, detail: 'ค่าส่งในไทย Kerry', amount: 60 } });
  await call(`/shipments/${ship.id}/summary/${a.id}`, { body: { currency: 'THB' } });
  await call(`/packing/${pk1.created[0].id}`, { method: 'PUT', body: { weight: 99 }, expect: 409 }); // locked after posting
  assert.equal((await call('/customers/' + a.id)).balance_thb, -435);
  await call(`/shipments/${ship.id}/arrived`, { body: { date: d } });
  await call(`/shipments/${ship.id}/status`, { body: { status: 'nope' }, expect: 400 });
  await call(`/shipments/${ship.id}/status`, { body: { status: 'loaded', date: d } });
  await call(`/shipments/${ship.id}/status`, { body: { status: 'inspect_th', date: d, note: 'X-ray' } });
  assert.equal((await call(`/shipments/${ship.id}/status`)).length, 2);
  assert.equal((await call('/r/shipments')).find((s: any) => s.id === ship.id).status, 'inspect_th');
  // a sack goes on a round as one box; its parcels follow, are not loadable alone, and must be weighed before the summary
  const ship2 = await call('/r/shipments', { body: { code: 'JJ-SACK-' + d.replace(/-/g, ''), date: d } });
  const parcels = await call('/packing', { body: { customer_id: b.id, boxes: 2 } });
  const bag = await call('/packing/merge', { body: { ids: parcels.created.map((x: any) => x.id) } });
  await call(`/shipments/${ship2.id}/load`, { body: { code: parcels.created[0].code, date: d }, expect: 409 });
  await call(`/shipments/${ship2.id}/load`, { body: { code: bag.packing_code, date: d } });
  assert.ok((await call(`/packing/${parcels.created[1].id}`)).off_china_date);
  await call(`/shipments/${ship2.id}/summary/${b.id}`, { body: { currency: 'THB' }, expect: 409 });
  await call(`/packing/${bag.id}/split`, { body: {} });
  const after = await call(`/packing/${parcels.created[0].id}`);
  assert.equal(after.shipment_id, ship2.id); // still on the round after the split
  await call('/packing/measure', { body: { rows: parcels.created.map((c: any) => ({ id: c.id, weight: 1, cubic1: 10, cubic2: 10, cubic3: 10 })) } });
  assert.equal((await call(`/shipments/${ship2.id}/summary`)).find((x: any) => x.id === b.id).total, 50);

  log('bank statement import + payment notice + check');
  await call('/bank/import', { body: { bank_id: kbank.id, rows: [
    { date: d, income: 435, bank_detail: 'TR fr 081-2-34567 นายสมชาย' },
    { date: d, income: 1000, bank_detail: 'unknown transfer' },
  ] } });
  const dup = await call('/bank/import', { body: { bank_id: kbank.id, rows: [{ date: d, income: 435, bank_detail: 'TR fr 081-2-34567 นายสมชาย' }] } });
  assert.equal(dup.skipped, 1);
  const pay = await call('/payments', { body: { customer_id: a.id, type: 'shipping', pay_from: 'bank', bank_id: kbank.id, amount_check: 435, payment_date: d, shipment_id: ship.id } });
  const pending = await call('/payments/check');
  const mine = pending.find((p: any) => p.id === pay.id);
  assert.equal(mine.candidates.length, 1);
  await call(`/payments/${pay.id}/approve`, { body: { statement_id: mine.candidates[0].id } });
  assert.equal((await call('/customers/' + a.id)).balance_thb, 0);
  const charges = await call('/shipping-charges?summarized=1');
  assert.equal(charges.find((c: any) => c.customer_id === a.id).paid, 1);
  // a CNY top-up paid in baht
  const pay2 = await call('/payments', { body: { customer_id: b.id, type: 'topup_cny', pay_from: 'bank', bank_id: kbank.id, amount_check: 1000, payment_date: d, exchange_rate: 5 } });
  await call(`/payments/${pay2.id}/approve`, { body: { force: true } });
  assert.equal((await call('/customers/' + b.id)).balance_cny, 200);

  log('expenses, transfers, other income, exchange');
  const et = await call('/r/expense_types', { body: { description: 'ค่าน้ำมัน Fuel', is_thai: 1 } });
  const ex = await call('/r/daily_expenses', { body: { date: d, amount: 500, type_id: et.id, bank_id: cashTh.id, is_thai: 1, remark: 'diesel' } });
  await call('/r/daily_expenses/check', { body: { ids: [ex.id] } });
  await call('/r/daily_expenses/' + ex.id, { method: 'DELETE', expect: 409 });
  await call('/r/account_transfers', { body: { date: d, amount: 2000, from_bank_id: kbank.id, to_bank_id: cashTh.id, remark: 'petty cash' } });
  await call('/r/other_incomes', { body: { date: d, amount: 300, bank_id: cashTh.id, remark: 'sold boxes' } });
  const total = await call('/bank/total');
  const cash = total.banks.find((x: any) => x.id === cashTh.id);
  assert.equal(cash.balance, 5000 - 500 + 2000 + 300);
  const xch = await call('/exchanges', { body: { date: d, rate: 5.02, yuan_amount: 10000 } });
  await call(`/exchanges/${xch.id}/items`, { body: { bank_id: kbank.id, is_thai: 1, amount: 50200 } });
  await call(`/exchanges/${xch.id}/items`, { body: { bank_id: icbc.id, is_thai: 0, amount: 10000 } });
  assert.equal((await call('/exchanges')).find((x: any) => x.id === xch.id).complete, true);

  log('second order still open → unpaid + dashboard');
  const order2 = await call('/orders', { body: { customer_id: b.id, supplier_name: '广州服装', order_date: d, items: [{ product_id: 'TB-2001', style_id: clothes.id, quantity: 5, unit_price: 40 }] } });
  const o2 = await call('/orders/' + order2.id);
  await call('/packages', { body: { customer_id: b.id, date: d, items: [{ order_item_id: o2.items[0].id, quantity: 5, unit_price: 40 }] } });
  const unpaid = await call('/unpaid');
  assert.ok(unpaid.bills.length >= 1);
  const dash = await call('/dashboard');
  assert.ok(dash.customers >= 2);

  log('employees & permissions');
  const role = await call('/r/roles', { body: { description: 'Warehouse 仓库' } });
  await call('/permissions/role/' + role.id, { method: 'PUT', body: { keys: ['dashboard', 'packing.new', 'packing.search', 'packing.offchina'] } });
  await call('/employees', { body: { name: 'Lee', username: 'lee', password: 'lee12345', role_id: role.id } });
  return { a, b, ship };
}

export async function permissionChecks(base: string) {
  const lee = client(base);
  await lee('/login', { body: { username: 'lee', password: 'lee12345' } });
  await lee('/packing?sent=1');
  await lee('/payments/check', { expect: 403 });
  await lee('/r/daily_expenses', { expect: 403 });
  const anon = client(base);
  await anon('/dashboard', { expect: 401 });
  await anon('/login', { body: { username: 'admin', password: 'wrong' }, expect: 401 });
}
