import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useApi, useApp, useCan, useT, money, today } from '../lib';
import { Page, Card, Grid, Field, Table, CustomerPick, DateRange, Badge, Modal, Tabs, Combo, useAction } from '../ui';

/** CustomerInfo — list + search. */
export function Customers() {
  const t = useT();
  const nav = useNavigate();
  const [q, setQ] = useState({ q: '', by: 'all' });
  const { data } = useApi<any[]>('/customers', q);
  return (
    <Page title={t('Customers', 'ข้อมูลลูกค้า', '客户数据')} actions={<Link to="/customers/new"><button className="primary">+ {t('New customer', 'เพิ่มลูกค้า', '新增客户')}</button></Link>}>
      <Card>
        <Grid cols={3}>
          <Field label={t('Search', 'คำค้นหา', '搜索字词')}><input autoFocus value={q.q} onChange={(e) => setQ({ ...q, q: e.target.value })} /></Field>
          <Field label={t('Search in', 'ค้นหาโดย', '搜索')}>
            <select value={q.by} onChange={(e) => setQ({ ...q, by: e.target.value })}>
              <option value="all">{t('Everything', 'ทั้งหมด', '全部')}</option>
              <option value="code">CODE</option>
              <option value="firstname">{t('Name', 'ชื่อจริง', '名字')}</option>
              <option value="nickname">{t('Nickname', 'ชื่อเล่น', '昵称')}</option>
              <option value="phone">{t('Phone', 'เบอร์โทร', '电话')}</option>
              <option value="email">Email</option>
            </select>
          </Field>
          <Field label=" "><span className="muted">{data?.length ?? 0} {t('customers', 'คน', '客户')}</span></Field>
        </Grid>
      </Card>
      <Table rows={data} onRow={(r) => nav(`/customers/${r.id}`)} columns={[
        { key: 'code', label: 'CODE' },
        { key: 'name', label: t('Name', 'ชื่อ', '名字'), render: (r) => `${r.firstname || ''} ${r.lastname || ''}` },
        { key: 'nickname', label: t('Nickname', 'ชื่อเล่น', '昵称') },
        { key: 'phone', label: t('Phone', 'เบอร์โทร', '电话') },
        { key: 'calc_type', label: t('Charge by', 'คิดตาม', '计算') },
        { key: 'rates', label: t('Rates ฿ kg / m³', 'เรทกิโล / คิว', '费率'), render: (r) => `${r.kilo_rate ?? '–'} / ${r.cubic_rate ?? '–'}` },
        { key: 'parent_code', label: t('Under', 'เป็นลูกค้าของ', '属于') },
        { key: 'balance_thb', label: t('THB balance', 'เงินไทย', '泰铢'), money: true, render: (r) => <span className={r.balance_thb < 0 ? 'neg' : ''}>{money(r.balance_thb)}</span> },
        { key: 'balance_cny', label: t('CNY balance', 'เงินหยวน', '人民币'), money: true, render: (r) => <span className={r.balance_cny < 0 ? 'neg' : ''}>{money(r.balance_cny)}</span> },
        { key: 'shipping_due', label: t('Shipping due ฿', 'ค่าขนส่งค้างจ่าย', '未付运费'), money: true, render: (r) => r.shipping_due ? <span className="neg">{money(r.shipping_due)}</span> : '' },
        { key: 'created_at', label: t('Registered', 'วันที่ลงทะเบียน', '注册'), render: (r) => r.created_at?.slice(0, 10) },
      ]} />
    </Page>
  );
}

/** CustomerInfoEdit — profile, shipping rates and delivery addresses. */
export function CustomerEdit() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { lookups, reloadLookups } = useApp();
  const { run, busy } = useAction();
  const [c, setC] = useState<any>({ calc_type: 'mix' });
  const [tab, setTab] = useState('info');
  const [addr, setAddr] = useState<any>(null);
  // existing customers open read-only; press Edit to change them (avoids accidental edits)
  const [editing, setEditing] = useState(!id);
  useEffect(() => setEditing(!id), [id]);
  const load = () => id && api(`/customers/${id}`).then(setC);
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const set = (k: string) => (e: any) => setC({ ...c, [k]: e.target.value });
  const save = async () => {
    const r: any = await run(() => (id ? api(`/customers/${id}`, { method: 'PUT', body: c }) : api('/customers', { body: c })));
    if (r) { await reloadLookups(); if (!id) nav(`/customers/${r.id}`); else { setEditing(false); void load(); } }
  };
  const cancel = () => { setEditing(false); void load(); };
  const del = async () => {
    if (!confirm(t('Delete this customer?', 'แน่ใจหรือเปล่าว่าต้องการลบออก?', '你确定要删除吗?'))) return;
    if (await run(() => api(`/customers/${id}`, { method: 'DELETE' }))) { await reloadLookups(); nav('/customers'); }
  };
  const others = lookups.customers.filter((x) => String(x.id) !== String(id));
  return (
    <Page title={id ? `${t('Customer', 'ลูกค้า', '客户')} ${c.code || ''}` : t('New customer', 'เพิ่มลูกค้า', '新增客户')}
      actions={editing
        ? <>{id && <button className="danger" onClick={del}>{t('Delete', 'ลบ', '删除')}</button>}{id && <button onClick={cancel}>{t('Cancel', 'ยกเลิก', '取消')}</button>}<button className="primary" disabled={busy} onClick={save}>{t('Save', 'บันทึก', '保存')}</button></>
        : <button className="primary" onClick={() => setEditing(true)}>✎ {t('Edit', 'แก้ไข', '修改')}</button>}>
      {id && (
        <div className="stats">
          <div className={`stat ${c.balance_thb < 0 ? 'bad' : ''}`}><div className="stat-label">{t('THB balance', 'Balance เงินไทย', '平衡泰铢')}</div><div className="stat-value">{money(c.balance_thb)}</div></div>
          <div className={`stat ${c.balance_cny < 0 ? 'bad' : ''}`}><div className="stat-label">{t('CNY balance', 'Balance เงินจีน', '平衡人民币')}</div><div className="stat-value">{money(c.balance_cny)}</div></div>
          <div className={`stat ${c.shipping_due > 0 ? 'bad' : ''}`}><div className="stat-label">{t('Shipping due (THB)', 'ค่าขนส่งค้างจ่าย (บาท)', '未付运费')}</div><div className="stat-value">{money(c.shipping_due)}</div></div>
          <div className="stat"><div className="stat-label">{t('Quick links', 'ลิงก์', '链接')}</div><div className="row" style={{ marginTop: 8 }}>
            <Link to={`/orders/new?customer_id=${id}`}>{t('New order', 'ออเดอร์ใหม่', '新订单')}</Link>
            <Link to={`/balances/THB?customer_id=${id}`}>THB</Link><Link to={`/balances/CNY?customer_id=${id}`}>CNY</Link></div></div>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'info', label: t('Profile & rates', 'ข้อมูลลูกค้า', '客户数据') }, ...(id ? [{ key: 'addr', label: t('Addresses', 'ที่อยู่จัดส่ง', '地址') }] : [])]} />
      {tab === 'info' && (
        <fieldset className="locked" disabled={!editing}>
          {!editing && <p className="muted">{t('Read-only. Press Edit to make changes.', 'ดูอย่างเดียว กดปุ่ม “แก้ไข” ถ้าต้องการเปลี่ยนข้อมูล', '只读，点“修改”编辑')}</p>}
          <Card title={t('Profile', 'ข้อมูลทั่วไป', '基本信息')}>
            <Grid cols={4}>
              <Field label="CODE *"><input value={c.code || ''} onChange={set('code')} /></Field>
              <Field label={t('First name', 'ชื่อจริง', '名字')}><input value={c.firstname || ''} onChange={set('firstname')} /></Field>
              <Field label={t('Last name', 'นามสกุล', '姓')}><input value={c.lastname || ''} onChange={set('lastname')} /></Field>
              <Field label={t('Nickname', 'ชื่อเล่น', '昵称')}><input value={c.nickname || ''} onChange={set('nickname')} /></Field>
              <Field label={t('Phone', 'เบอร์โทร', '电话')}><input value={c.phone || ''} onChange={set('phone')} /></Field>
              <Field label="Email"><input type="email" value={c.email || ''} onChange={set('email')} /></Field>
              <Field label={t('Web username', 'ชื่อผู้ใช้เว็บ', '用户名')}><input value={c.username || ''} onChange={set('username')} /></Field>
              <Field label={t('Credit limit ¥', 'วงเงินเครดิต', '信用额度')}><input type="number" value={c.credit_limit ?? 0} onChange={set('credit_limit')} /></Field>
              <Field label={t('Customer of (parent)', 'เป็นลูกค้าของ', '属于')}><Combo items={others} value={c.parent_id} onChange={(v) => setC({ ...c, parent_id: v })} getLabel={(x) => x.code} placeholder="—" /></Field>
              <Field label={t('Recommended by', 'คนแนะนำ', '推荐人')}><Combo items={others} value={c.recommender_id} onChange={(v) => setC({ ...c, recommender_id: v })} getLabel={(x) => x.code} placeholder="—" /></Field>
              <Field label={t('Remark', 'หมายเหตุ', '备注')} wide><textarea value={c.remark || ''} onChange={set('remark')} /></Field>
            </Grid>
          </Card>
          <Card title={t('Shipping rates', 'เรทค่าขนส่ง', '运费')}>
            <p className="muted">{t('Leave empty to use the general settings', 'เว้นว่างเพื่อใช้ค่าตั้งต้น', '留空使用默认')}: ฿{lookups.settings.kilo_rate}/kg · ฿{lookups.settings.cubic_rate}/m³ · ¥{lookups.settings.kilo_rate_yuan}/kg · ¥{lookups.settings.cubic_rate_yuan}/m³</p>
            <Grid cols={5}>
              <Field label={t('Charge by', 'คิดค่าน้ำหนักเป็น', '计算')}>
                <select value={c.calc_type || 'mix'} onChange={set('calc_type')}>
                  <option value="mix">{t('Higher of kg / m³', 'ผสม (ใช้ค่าที่สูงกว่า)', '混合')}</option>
                  <option value="kilo">{t('Kg only', 'กิโลอย่างเดียว', '只按公斤')}</option>
                  <option value="cubic">{t('m³ only', 'คิวอย่างเดียว', '只按立方')}</option>
                </select>
              </Field>
              <Field label={t('฿ per kg', 'เรทกิโล (บาท)', '泰铢/公斤')}><input type="number" step="any" value={c.kilo_rate ?? ''} onChange={set('kilo_rate')} /></Field>
              <Field label={t('฿ per m³', 'เรทคิว (บาท)', '泰铢/立方')}><input type="number" step="any" value={c.cubic_rate ?? ''} onChange={set('cubic_rate')} /></Field>
              <Field label={t('¥ per kg', 'เรทกิโล (หยวน)', '元/公斤')}><input type="number" step="any" value={c.kilo_rate_yuan ?? ''} onChange={set('kilo_rate_yuan')} /></Field>
              <Field label={t('¥ per m³', 'เรทคิว (หยวน)', '元/立方')}><input type="number" step="any" value={c.cubic_rate_yuan ?? ''} onChange={set('cubic_rate_yuan')} /></Field>
            </Grid>
          </Card>
        </fieldset>
      )}
      {tab === 'addr' && (
        <Card title={t('Delivery addresses', 'ที่อยู่จัดส่ง', '收货地址')} actions={<button onClick={() => setAddr({ customer_id: Number(id), is_default: c.addresses?.length ? 0 : 1 })}>+ {t('Add', 'เพิ่ม', '新增')}</button>}>
          <Table rows={c.addresses} onRow={setAddr} columns={[
            { key: 'name', label: t('Receiver', 'ชื่อผู้รับ', '收件人') },
            { key: 'address', label: t('Address', 'ที่อยู่', '地址') },
            { key: 'province', label: t('Province', 'จังหวัด', '省') },
            { key: 'postcode', label: t('Postcode', 'รหัสไปรษณีย์', '邮编') },
            { key: 'is_default', label: '', render: (r) => r.is_default ? <Badge tone="info">{t('Default', 'ค่าเริ่มต้น', '默认')}</Badge> : null },
            { key: 'x', label: '', render: (r) => <button className="link danger" onClick={async (e) => { e.stopPropagation(); if (await run(() => api(`/r/customer_addresses/${r.id}`, { method: 'DELETE' }))) load(); }}>{t('Delete', 'ลบ', '删除')}</button> },
          ]} />
        </Card>
      )}
      {addr && (
        <Modal open title={t('Address', 'ที่อยู่', '地址')} onClose={() => setAddr(null)}
          footer={<button className="primary" onClick={async () => {
            const ok = await run(() => (addr.id ? api(`/r/customer_addresses/${addr.id}`, { method: 'PUT', body: addr }) : api('/r/customer_addresses', { body: addr })));
            if (ok) { setAddr(null); load(); }
          }}>{t('Save', 'บันทึก', '保存')}</button>}>
          <Grid cols={2}>
            <Field label={t('Receiver', 'ชื่อผู้รับ', '收件人')}><input value={addr.name || ''} onChange={(e) => setAddr({ ...addr, name: e.target.value })} /></Field>
            <Field label={t('Province', 'จังหวัด', '省')}>
              <select value={addr.province_id || ''} onChange={(e) => setAddr({ ...addr, province_id: e.target.value })}>
                <option value="">—</option>{lookups.provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label={t('Address', 'ที่อยู่', '地址')} wide><textarea value={addr.address || ''} onChange={(e) => setAddr({ ...addr, address: e.target.value })} /></Field>
            <Field label={t('Postcode', 'รหัสไปรษณีย์', '邮编')}><input value={addr.postcode || ''} onChange={(e) => setAddr({ ...addr, postcode: e.target.value })} /></Field>
            <Field label={t('Default', 'ค่าเริ่มต้น', '默认')}><div className="radios"><input type="checkbox" checked={!!addr.is_default} onChange={(e) => setAddr({ ...addr, is_default: e.target.checked })} /></div></Field>
          </Grid>
        </Modal>
      )}
    </Page>
  );
}

/** CustomerBalanceForm (THB) / CustomerBalanceYuanForm (CNY) — ledger with running balance. */
export function Balances() {
  const t = useT();
  const { currency = 'THB' } = useParams();
  const can = useCan();
  const params = new URLSearchParams(location.search);
  const [q, setQ] = useState<any>({ customer_id: params.get('customer_id') ? Number(params.get('customer_id')) : null, from: '', to: '' });
  const { data, reload } = useApi<any>(`/balances/${currency}`, q);
  const [edit, setEdit] = useState<any>(null);
  const { run } = useAction();
  const cny = currency === 'CNY';
  const save = async () => {
    const body = { ...edit, income: edit.kind === 'in' ? edit.amount : 0, expense: edit.kind === 'out' ? edit.amount : 0 };
    const ok = await run(() => (edit.id ? api(`/balances/${currency}/${edit.id}`, { method: 'PUT', body }) : api(`/balances/${currency}`, { body })));
    if (ok) { setEdit(null); reload(); }
  };
  void can;
  return (
    <Page title={cny ? t('CNY balance', 'รายการ Balance เงินจีนของลูกค้า', '平衡人民币') : t('THB balance', 'รายการ Balance เงินไทยของลูกค้า', '平衡泰铢')}
      actions={<button className="primary" onClick={() => setEdit({ customer_id: q.customer_id, date: today(), kind: 'in', amount: '' })}>+ {cny ? t('Add CNY', 'เพิ่มเงินจีน', '新增人民币') : t('Add THB', 'เพิ่มเงินไทย', '新增泰铢')}</button>}>
      <Card>
        <Grid cols={4}>
          <Field label={t('Customer', 'ลูกค้า', '客户')}><CustomerPick value={q.customer_id} onChange={(v) => setQ({ ...q, customer_id: v })} /></Field>
          <DateRange from={q.from} to={q.to} onChange={(from, to) => setQ({ ...q, from, to })} />
          {data?.balance !== null && data?.balance !== undefined && <Field label={t('Balance now', 'ยอดคงเหลือ', '余额')}><b className={data.balance < 0 ? 'neg' : 'pos'} style={{ fontSize: '1.3rem' }}>{money(data.balance)} {currency}</b></Field>}
        </Grid>
      </Card>
      <Table rows={data?.rows} onRow={(r) => r.source === 'manual' && setEdit({ ...r, kind: r.income ? 'in' : 'out', amount: r.income || r.expense })} columns={[
        { key: 'date', label: t('Date', 'วันที่', '日期') },
        { key: 'customer_code', label: t('Customer', 'ลูกค้า', '客户') },
        { key: 'ref_code', label: t('Reference', 'อ้างอิง', '参考') },
        { key: 'description', label: t('Detail', 'รายละเอียด', '详情') },
        { key: 'income', label: t('In (+)', 'เข้า ( + )', '收入'), money: true, sum: true },
        { key: 'expense', label: t('Out (−)', 'ออก ( - )', '支出'), money: true, sum: true },
        { key: 'balance', label: t('Balance', 'คงเหลือ', '余额'), money: true, render: (r) => <span className={r.balance < 0 ? 'neg' : ''}>{money(r.balance)}</span> },
        { key: 'source', label: t('From', 'ที่มา', '来源'), render: (r) => <Badge tone={r.source === 'manual' ? 'neutral' : 'info'}>{r.source}</Badge> },
        { key: 'created_by', label: t('By', 'โดย', '人') },
        { key: 'x', label: '', render: (r) => r.source === 'manual' && <button className="link danger" onClick={async (e) => { e.stopPropagation(); if (confirm('?') && await run(() => api(`/balances/${currency}/${r.id}`, { method: 'DELETE' }))) reload(); }}>{t('Delete', 'ลบ', '删除')}</button> },
      ]} />
      {edit && (
        <Modal open title={edit.id ? t('Edit', 'แก้ไข', '修改') : cny ? t('Top up / deduct CNY', 'เติมเงินเข้า Balance เงินจีน', '人民币') : t('Top up / deduct THB', 'เติมเงินเข้า Balance เงินไทย', '泰铢')} onClose={() => setEdit(null)}
          footer={<button className="primary" onClick={save}>{t('Save', 'บันทึก', '保存')}</button>}>
          <Grid cols={2}>
            <Field label={t('Customer', 'ลูกค้า', '客户')}>{edit.id ? <input disabled value={edit.customer_code} /> : <CustomerPick value={edit.customer_id} onChange={(v) => setEdit({ ...edit, customer_id: v })} placeholder="—" />}</Field>
            <Field label={t('Date', 'วันที่', '日期')}><input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label={t('Type', 'ประเภท', '类别')}>
              <div className="radios">
                <label><input type="radio" checked={edit.kind === 'in'} onChange={() => setEdit({ ...edit, kind: 'in' })} /> {t('Top up', 'เติมเงิน', '存款')}</label>
                <label><input type="radio" checked={edit.kind === 'out'} onChange={() => setEdit({ ...edit, kind: 'out' })} /> {t('Deduct', 'ถอนเงิน', '提款')}</label>
              </div>
            </Field>
            <Field label={t('Amount', 'ยอดเงิน', '总额')}><input type="number" step="any" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field>
            <Field label={t('Reference', 'เลขอ้างอิง', '参考')}><input value={edit.ref_code || ''} onChange={(e) => setEdit({ ...edit, ref_code: e.target.value })} /></Field>
            <Field label={t('Detail', 'รายละเอียด', '详情')}><input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </Grid>
          {edit.edit_history && <pre className="muted" style={{ whiteSpace: 'pre-wrap' }}>{edit.edit_history}</pre>}
        </Modal>
      )}
    </Page>
  );
}
