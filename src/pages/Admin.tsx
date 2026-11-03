import { useEffect, useState } from 'react';
import { MENU, VERIFY_KEYS } from '../../shared/menus';
import { api, useApi, useApp, useLang, useT, pick, today } from '../lib';
import { Page, Card, Grid, Field, Table, Badge, Modal, Tabs, useAction } from '../ui';
import { Plus } from 'lucide-react';
import { CrudPage } from './Crud';

/** EmployeeForm + AddEmployeeFrom + EmployeeRoleAddFrom */
export function Employees() {
  const t = useT();
  const { lookups, reloadLookups } = useApp();
  const [tab, setTab] = useState('emp');
  const { data, reload } = useApi<any[]>('/employees');
  const [edit, setEdit] = useState<any>(null);
  const { run, busy } = useAction();
  const save = async () => {
    if (await run(() => (edit.id ? api(`/employees/${edit.id}`, { method: 'PUT', body: edit }) : api('/employees', { body: edit })))) { setEdit(null); reload(); }
  };
  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'emp', label: t('Employees', 'พนักงาน', '员工') }, { key: 'roles', label: t('Roles', 'ตำแหน่ง', '职位') }, { key: 'audit', label: t('Activity log', 'ประวัติการใช้งาน', '日志') }]} />
      </div>
      {tab === 'emp' && (
        <Page title={t('Employees', 'ข้อมูลพนักงาน', '员工信息')} actions={<button className="primary" onClick={() => setEdit({ is_active: 1, start_date: today() })}><Plus size={16} aria-hidden /> {t('Add', 'เพิ่ม', '新增')}</button>}>
          <Table rows={data} onRow={(r) => setEdit({ ...r, password: '' })} columns={[
            { key: 'name', label: t('Name', 'ชื่อ', '名字') }, { key: 'username', label: t('Username', 'ชื่อผู้ใช้', '用户名') },
            { key: 'role', label: t('Role', 'ตำแหน่ง', '职位') }, { key: 'phone', label: t('Phone', 'เบอร์โทร', '电话') },
            { key: 'start_date', label: t('Started', 'เริ่มทำงาน', '入职') }, { key: 'salary', label: t('Salary', 'เงินเดือน', '工资'), money: true },
            { key: 'is_active', label: t('Status', 'สถานะ', '状态'), render: (r) => r.is_admin ? <Badge tone="info">Admin</Badge> : r.is_active ? <Badge tone="good">{t('Active', 'เปิด', '启用')}</Badge> : <Badge>{t('Disabled', 'ปิด', '停用')}</Badge> },
          ]} />
          {edit && (
            <Modal open title={edit.id ? t('Edit employee', 'แก้ไขพนักงาน', '修改员工') : t('New employee', 'เพิ่มพนักงาน', '新增员工')} onClose={() => setEdit(null)}
              footer={<button className="primary" disabled={busy} onClick={save}>{t('Save', 'บันทึก', '保存')}</button>}>
              <Grid cols={2}>
                <Field label={t('Name', 'ชื่อ', '名字') + ' *'}><input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
                <Field label={t('Role', 'ตำแหน่ง', '职位')}>
                  <select value={edit.role_id || ''} onChange={(e) => setEdit({ ...edit, role_id: e.target.value || null })}>
                    <option value="">—</option>{lookups.roles.map((r) => <option key={r.id} value={r.id}>{r.description}</option>)}
                  </select>
                </Field>
                <Field label={t('Username', 'ชื่อผู้ใช้', '用户名') + ' *'}><input value={edit.username || ''} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></Field>
                <Field label={edit.id ? t('New password (leave empty to keep)', 'รหัสผ่านใหม่', '新密码') : t('Password', 'รหัสผ่าน', '密码') + ' *'}><input type="password" value={edit.password || ''} onChange={(e) => setEdit({ ...edit, password: e.target.value })} autoComplete="new-password" /></Field>
                <Field label={t('Phone', 'เบอร์โทร', '电话')}><input value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
                <Field label="Email"><input value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
                <Field label={t('Start date', 'เริ่มทำงาน', '入职')}><input type="date" value={edit.start_date || ''} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} /></Field>
                <Field label={t('Salary', 'เงินเดือน', '工资')}><input type="number" value={edit.salary ?? ''} onChange={(e) => setEdit({ ...edit, salary: e.target.value })} /></Field>
                <Field label={t('Address', 'ที่อยู่', '地址')} wide><input value={edit.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
                <Field label={t('Can sign in', 'เปิดใช้งาน', '启用')}><div className="radios"><input type="checkbox" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked ? 1 : 0 })} /></div></Field>
              </Grid>
            </Modal>
          )}
        </Page>
      )}
      {tab === 'roles' && (
        <CrudPage resource="roles" title={t('Roles', 'ตำแหน่งพนักงาน', '职位')} onChanged={reloadLookups} canDelete={false}
          fields={[{ key: 'description', label: t('Role name', 'ชื่อตำแหน่ง', '职位'), required: true }]}
          columns={[{ key: 'description', label: t('Role', 'ตำแหน่ง', '职位') }, {
            key: 'del', label: '', render: (r) => <button className="link danger" onClick={async (e) => { e.stopPropagation(); if (await run(() => api(`/roles/${r.id}`, { method: 'DELETE' }))) { await reloadLookups(); location.reload(); } }}>{t('Delete', 'ลบ', '删除')}</button>,
          }]} />
      )}
      {tab === 'audit' && <AuditLog />}
    </>
  );
}
function AuditLog() {
  const t = useT();
  const { data } = useApi<any[]>('/audit', { limit: 500 });
  return (
    <Page title={t('Activity log', 'ประวัติการใช้งาน', '日志')}>
      <Table rows={data} columns={[
        { key: 'at', label: t('Time', 'เวลา', '时间') }, { key: 'username', label: t('User', 'ผู้ใช้', '用户') },
        { key: 'action', label: t('Action', 'การกระทำ', '操作') }, { key: 'entity', label: t('What', 'รายการ', '项目') }, { key: 'entity_id', label: 'ID' },
        { key: 'detail', label: t('Detail', 'รายละเอียด', '详情'), render: (r) => <span className="muted" style={{ fontSize: 12 }}>{(r.detail || '').slice(0, 140)}</span> },
      ]} />
    </Page>
  );
}

function MenuChecks({ keys, setKeys }: { keys: Set<string>; setKeys: (s: Set<string>) => void }) {
  const { lang } = useLang();
  return (
    <>
      {MENU.map((g) => (
        <div key={g.key} style={{ marginBottom: 14 }}>
          <label className="row" style={{ fontWeight: 600, marginBottom: 6 }}>
            <input type="checkbox" checked={g.items.every((i) => keys.has(i.key))} onChange={(e) => {
              const s = new Set(keys); g.items.forEach((i) => (e.target.checked ? s.add(i.key) : s.delete(i.key))); setKeys(s);
            }} /> {pick(g, lang)}
          </label>
          <div className="check-grid">
            {g.items.map((i) => (
              <label key={i.key}><input type="checkbox" checked={keys.has(i.key)} onChange={(e) => { const s = new Set(keys); if (e.target.checked) s.add(i.key); else s.delete(i.key); setKeys(s); }} /> {pick(i, lang)}</label>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** EmployeeForm (role menus) + UserPermissionForm (extra menus per user). */
export function Permissions() {
  const t = useT();
  const { lookups } = useApp();
  const emps = useApi<any[]>('/employees');
  const [target, setTarget] = useState<{ kind: 'role' | 'user'; id: number; name: string } | null>(null);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const { run, busy } = useAction();
  useEffect(() => { if (target) api<string[]>(`/permissions/${target.kind}/${target.id}`).then((k) => setKeys(new Set(k))); }, [target]);
  return (
    <Page title={t('Menu permissions', 'ตั้งค่าการเข้าถึงเมนูต่าง', '权限')}>
      <div className="split" style={{ gridTemplateColumns: '300px 1fr' }}>
        <div>
          <Card title={t('Roles', 'ตำแหน่ง', '职位')}>
            <Table rows={lookups.roles} onRow={(r) => setTarget({ kind: 'role', id: r.id, name: r.description })} rowClass={(r) => (target?.kind === 'role' && target.id === r.id ? 'on' : '')} columns={[{ key: 'description', label: t('Role', 'ตำแหน่ง', '职位') }]} />
          </Card>
          <Card title={t('Extra menus per person', 'สิทธิ์เพิ่มรายบุคคล', '个人权限')}>
            <Table rows={emps.data?.filter((e) => !e.is_admin)} onRow={(r) => setTarget({ kind: 'user', id: r.id, name: r.name })} rowClass={(r) => (target?.kind === 'user' && target.id === r.id ? 'on' : '')} columns={[{ key: 'name', label: t('Name', 'ชื่อ', '名字') }, { key: 'role', label: t('Role', 'ตำแหน่ง', '职位') }]} />
          </Card>
        </div>
        {target ? (
          <Card title={`${target.kind === 'role' ? t('Role', 'ตำแหน่ง', '职位') : t('Person', 'พนักงาน', '员工')}: ${target.name}`}
            actions={<button className="primary" disabled={busy} onClick={() => run(() => api(`/permissions/${target.kind}/${target.id}`, { method: 'PUT', body: { keys: [...keys] } }))}>{t('Save', 'บันทึก', '保存')}</button>}>
            {target.kind === 'user' && <p className="muted">{t('These are added on top of the menus of their role.', 'สิทธิ์นี้เพิ่มจากสิทธิ์ของตำแหน่ง', '在职位权限之外增加')}</p>}
            <MenuChecks keys={keys} setKeys={setKeys} />
          </Card>
        ) : <Card><p className="muted">{t('Choose a role or a person on the left.', 'เลือกตำแหน่งหรือพนักงานด้านซ้าย', '请选择左边的职位或员工')}</p></Card>}
      </div>
    </Page>
  );
}

/** VerifySettingForm — who may tick "checked" on which kind of record. */
export function VerifySettings() {
  const t = useT();
  const { lang } = useLang();
  const emps = useApi<any[]>('/employees');
  const [emp, setEmp] = useState<any>(null);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const { run, busy } = useAction();
  useEffect(() => { if (emp) api<string[]>(`/verify/${emp.id}`).then((k) => setKeys(new Set(k))); }, [emp]);
  return (
    <Page title={t('Verify permissions', 'ตั้งค่าการตรวจสอบ', '校验设置')}>
      <div className="split" style={{ gridTemplateColumns: '300px 1fr' }}>
        <Card title={t('Employees', 'พนักงาน', '员工')}>
          <Table rows={emps.data?.filter((e) => !e.is_admin)} onRow={setEmp} rowClass={(r) => (emp?.id === r.id ? 'on' : '')} columns={[{ key: 'name', label: t('Name', 'ชื่อ', '名字') }, { key: 'role', label: t('Role', 'ตำแหน่ง', '职位') }]} />
        </Card>
        {emp ? (
          <Card title={emp.name} actions={<button className="primary" disabled={busy} onClick={() => run(() => api(`/verify/${emp.id}`, { method: 'PUT', body: { keys: [...keys] } }))}>{t('Save', 'บันทึก', '保存')}</button>}>
            <p className="muted">{t('Allowed to mark these as checked:', 'อนุญาตให้ตรวจสอบรายการต่อไปนี้', '允许校验以下项目')}</p>
            <div className="check-grid">
              {VERIFY_KEYS.map((v) => <label key={v.key}><input type="checkbox" checked={keys.has(v.key)} onChange={(e) => { const s = new Set(keys); if (e.target.checked) s.add(v.key); else s.delete(v.key); setKeys(s); }} /> {pick(v, lang)}</label>)}
            </div>
          </Card>
        ) : <Card><p className="muted">{t('Choose an employee.', 'เลือกพนักงาน', '请选择员工')}</p></Card>}
      </div>
    </Page>
  );
}

/** GeneralSettingForm + PrinterSettingForm + PrintTextSettingForm */
export function Settings() {
  const t = useT();
  const { reloadLookups } = useApp();
  const { data, setData } = useApi<Record<string, string>>('/settings');
  const { run, busy } = useAction();
  const [pw, setPw] = useState({ current: '', next: '' });
  if (!data) return null;
  const set = (k: string) => (e: any) => setData({ ...data, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value });
  return (
    <Page title={t('General settings', 'ตั้งค่าทั่วไป', '一般设置')} actions={<button className="primary" disabled={busy} onClick={async () => { if (await run(() => api('/settings', { method: 'PUT', body: data }))) await reloadLookups(); }}>{t('Save', 'บันทึก', '保存')}</button>}>
      <Card title={t('Default shipping rates', 'ค่าขนส่งตั้งต้น', '默认运费')}>
        <Grid cols={4}>
          <Field label={t('฿ per kg', 'ค่ากิโลทั่วไป (บาท)', '泰铢/公斤')}><input type="number" step="any" value={data.kilo_rate} onChange={set('kilo_rate')} /></Field>
          <Field label={t('฿ per m³', 'ค่าคิวทั่วไป (บาท)', '泰铢/立方')}><input type="number" step="any" value={data.cubic_rate} onChange={set('cubic_rate')} /></Field>
          <Field label={t('¥ per kg', 'ค่ากิโลทั่วไป (หยวน)', '元/公斤')}><input type="number" step="any" value={data.kilo_rate_yuan} onChange={set('kilo_rate_yuan')} /></Field>
          <Field label={t('¥ per m³', 'ค่าคิวทั่วไป (หยวน)', '元/立方')}><input type="number" step="any" value={data.cubic_rate_yuan} onChange={set('cubic_rate_yuan')} /></Field>
        </Grid>
      </Card>
      <Card title={t('Packing & printing', 'การแพคและปริ้น', '打包和打印')}>
        <Grid cols={2}>
          <Field label={t('Label printer name (for reference)', 'ชื่อ Printer', '打印机')}><input value={data.printer_name} onChange={set('printer_name')} /></Field>
          <Field label={t('Text printed on labels & bills', 'ตั้งค่าคำที่ต้องการใส่เมื่อปริ้น', '打印文字')}><input value={data.print_text} onChange={set('print_text')} /></Field>
          <label className="row"><input type="checkbox" checked={data.print_after_pack === '1'} onChange={set('print_after_pack')} /> {t('Open the label right after packing', 'ปริ้นทันทีหลังแพค', '打包后打印')}</label>
          <label className="row"><input type="checkbox" checked={data.input_ctn_and_no === '1'} onChange={set('input_ctn_and_no')} /> {t('Type CTN / No. while packing', 'ใส่ CTN และ No. ตอนแพค', '打包时输入 CTN')}</label>
        </Grid>
      </Card>
      <Card title={t('Customer website sync (optional)', 'เชื่อมต่อเว็บลูกค้า', '客户网站同步')}>
        <Field label={t('Webhook URL — receives a POST when boxes go on a container or a round arrives', 'URL สำหรับแจ้งสถานะ', '状态通知 URL')} hint={t('API key comes from the STATUS_WEBHOOK_KEY environment variable.', 'API key ตั้งใน environment STATUS_WEBHOOK_KEY', 'API key 在环境变量中')}>
          <input value={data.status_webhook_url} onChange={set('status_webhook_url')} placeholder="https://…" />
        </Field>
      </Card>
      <Card title={t('My password', 'รหัสผ่านของฉัน', '我的密码')}>
        <Grid cols={3}>
          <Field label={t('Current', 'รหัสผ่านเดิม', '当前')}><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label={t('New (6+ characters)', 'รหัสผ่านใหม่', '新密码')}><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label=" "><button onClick={async () => { if (await run(() => api('/me/password', { body: pw }))) setPw({ current: '', next: '' }); }}>{t('Change password', 'เปลี่ยนรหัสผ่าน', '修改密码')}</button></Field>
        </Grid>
      </Card>
    </Page>
  );
}

/** StyleForm — product categories in English / Chinese / Thai, with units. */
export function Styles() {
  const t = useT();
  const { lookups, reloadLookups } = useApp();
  const [tab, setTab] = useState('styles');
  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'styles', label: t('Categories', 'ประเภทสินค้า', '产品分类') }, { key: 'units', label: t('Units', 'หน่วย', '单位') }]} />
      </div>
      {tab === 'styles' ? (
        <CrudPage resource="styles" title={t('Product categories', 'ประเภทสินค้า', '产品分类')} search onChanged={reloadLookups}
          fields={[
            { key: 'zh', label: '中文', required: true }, { key: 'th', label: 'ไทย' }, { key: 'en', label: 'English' },
            { key: 'unit_id', label: t('Unit', 'หน่วย', '单位'), type: 'select', options: lookups.units.map((u) => ({ value: u.id, label: u.description })) },
            { key: 'active', label: t('Active', 'ใช้งาน', '启用'), type: 'bool', default: 1 },
          ]}
          columns={[
            { key: 'id', label: '#' }, { key: 'zh', label: '中文' }, { key: 'th', label: 'ไทย' }, { key: 'en', label: 'English' },
            { key: 'unit', label: t('Unit', 'หน่วย', '单位') },
            { key: 'active', label: '', render: (r) => r.active ? null : <Badge>{t('Hidden', 'ไม่ใช้งาน', '停用')}</Badge> },
          ]} />
      ) : (
        <CrudPage resource="style_units" title={t('Units', 'หน่วย', '单位')} onChanged={reloadLookups}
          fields={[{ key: 'description', label: t('Unit', 'หน่วย', '单位'), required: true }]}
          columns={[{ key: 'description', label: t('Unit', 'หน่วย', '单位') }]} />
      )}
    </>
  );
}
