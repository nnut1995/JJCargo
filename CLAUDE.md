# CLAUDE.md — JJ Cargo web

Web rewrite of **JJCargoForm**, a Windows Forms (.NET 4.8) back-office app for a China → Thailand cargo
and purchasing-agent business. The original was compiled only (exe/pdb in the project's `JJCargo/` folder);
features were recovered from its type/method/control names and its Thai + Chinese UI strings.
Every screen of the old `MainForm` menu maps to one menu key in `shared/menus.ts`.

## Stack
- **Server**: Node 22 + Express 4, TypeScript run directly with `tsx` (no build step).
- **Database**: SQLite through Node's built-in `node:sqlite` (`DatabaseSync`, synchronous). No ORM, no native deps.
  Schema + seed live in `server/db.ts` (`CREATE TABLE IF NOT EXISTS`, so it migrates on boot).
- **Client**: React 18 + Vite 5 + react-router 6, plain CSS (`src/styles.css`), `jsbarcode` for labels.
- **Auth**: scrypt password hashes, HMAC-signed session cookie (`server/auth.ts`).

## Commands
```bash
npm install
npm run dev        # API on :3001 (tsx watch) + Vite on :5173 (proxies /api)
npm test           # end-to-end API test of the whole business flow on a temp DB (scripts/e2e.ts)
npm run typecheck  # tsc --noEmit over server, shared, src, scripts
npm run build      # vite build -> dist/
npm start          # production: serves API + dist/ on $PORT
npm run seed       # fill an EMPTY database with demo data (same flow as the test)
```
Default first login: `admin` / `admin123` (override with `ADMIN_USER` / `ADMIN_PASSWORD` before first start).

## Layout
```
shared/menus.ts        menu tree (th/zh/en labels) + VERIFY_KEYS; source of truth for permissions
server/index.ts        express app, error handler, static dist/
server/db.ts           schema, seed (provinces, statuses, units, admin), helpers all/get/run/tx/audit/setting
server/auth.ts         sessions, password hashing, HttpError, needMenu / canVerify
server/logic.ts        business rules: balances, shipping price, bill totals, cash posting, codes, webhook
server/crud.ts         generic /api/r/:resource list/create/update/delete/check for simple tables
server/routes/core.ts       login, /me, /lookups, /dashboard, settings, employees, permissions, verify, audit
server/routes/sales.ts      customers, balances, orders, supplier bills (packages), bill payments, lookup
server/routes/logistics.ts  packing, import, shipments load/unload, shipping summary, charges search
server/routes/finance.ts    payment notices + checking, customer deposit/withdraw, bank statements/import, exchange, unpaid
src/lib.tsx            api(), useApi(), i18n (useT), app context (user, lookups), formatters
src/nav.tsx            app shell: collapsible sidebar, top bar, Ctrl+K "go to" search, recent screens, icon per menu key
src/ui.tsx             Page/Card/Field/Grid/Table/Modal/Tabs/Combo pickers/PrintModal/Barcode/toasts/Bi/useAsk
src/pages/Crud.tsx     CrudPage: config-driven list + modal form for /api/r/* resources
src/pages/*.tsx        one file per area (Orders, Packages, Packing, Shipments, Customers, Payments, Bank, Accounting, Admin)
scripts/flow.ts        full business flow through the API with assertions (used by test + seed)
```

## Domain model (old name → new)
- Order / OrderDtl → `orders`, `order_items` (what the customer bought from a Chinese shop, prices in CNY)
- Package / PackageDtl → `packages`, `package_items`: a **supplier bill** = goods received + money to transfer to the shop
- PackageDtlsStatement → `package_item_statements` (deductions / refunds); PackagePayment → `package_payments`
- ShipmentDtl → `packings` (one box/sack, code `yyyymmnnnn` e.g. `2026110001`, monthly running no.; older boxes `PK0001`), ShipmentDtlsItem → `packing_items`, ShipmentDtlsStyle → `packing_styles`
- Shipment → `shipments` (a round / container); ShipmentOtherAmount → `shipment_other_amounts`; posting → `shipment_summaries`
- CustomerBalance / CustomerYuanBalance → `customer_balances` with `currency` THB|CNY (running balance computed, not stored)
- PaymentInfo → `payment_infos` (customer "I transferred" notice; status 1 pending / 2 approved / 3 rejected)
- ChinaTransferWithdraw / ThailandTransferWithdraw → `customer_transfers` with `region` CN|TH
- BankInfo / BankStatement → `banks`, `bank_statements`; HistoryExchange(+Item) → `exchanges`, `exchange_items`
- DailyExpense(+Type), OtherIncome, AccountTransfer, ExchangeRate, Style(+Unit), SupplierBank, Employee(+Role), RoleMenuView/MenuView, VerifyItem, GeneralSetting

## Rules worth knowing before changing money code
- **Customer balances are a ledger.** Lines created by other screens carry `source` + `source_id`
  (`payment`, `transfer`, `package_payment`, `shipment`); only `source='manual'` lines are editable on the balance pages.
  Undo = `removeBalanceBySource`.
- **Bank balance = opening_balance + sum(statement lines).** Real bank lines come from *Import bank statement*.
  Cash accounts (`is_cash=1`) have no export, so `postCash()` writes their lines automatically from expenses,
  transfers, other income, exchange items and bill payments. Don't auto-post to non-cash accounts — it would double count after import.
- **Shipping price** (`logic.packingPrice`): m³ = w×l×h/1e6; customer `calc_type` kilo | cubic | mix (higher of the two);
  per-box `rate_type` kilo|cubic|fixed overrides. Rates fall back to settings. Posting a summary freezes each box's basis and
  locks weight/size/round edits until undone.
- **Checked records** (`checked=1`) can't be edited or deleted; who may check what is `verify_items` (admins may check all).
- Supplier bill payment deducts the customer's **CNY** balance by amount + service fee; blocked if balance + credit_limit is short.
- Payment approval: `topup` → THB credit; `topup_cny`/`goods` → THB in, THB out, CNY in at the given rate; `shipping` → THB credit + marks the round's summary paid.

## 2026-11 demo feedback changes
- `orders.order_no` = shop / platform order number typed by staff (unique when given). Show `order_no || '#'+id` everywhere an order is named.
- Packing no longer needs weight, size or contents; boxes can be received first and measured later (`/packing/weigh`, `POST /api/packing/measure`).
- An order line can be packed up to its **ordered** qty even before a supplier bill exists (bill = payment to the shop). "Not received yet" on orders = qty − max(billed, packed).
- Shipment rounds have a `status` (steps in `shared/statuses.ts`) with history in `shipment_status_log` (`POST /api/shipments/:id/status`).
- Dashboard figures and rows link to the related screen (no separate quick-menu card).
- Customer screen opens read-only (Edit button); shows THB, CNY and unpaid shipping (unpaid `shipment_summaries`) separately.

## UI conventions (2026-11 redesign, see DESIGN.md)
- Icons: `lucide-react` only (no emoji / unicode glyphs as icons). Icon-only buttons need an `sr-only` label or `aria-label`.
- Never use `confirm()` / `prompt()` / `alert()`: `const { ask, askText } = useAsk()` then `await ask(msg, { danger: true })`; toasts for results.
- `t()` in Thai+Chinese mode returns `th + U+2002 + zh + U+2060`. `<Bi>` (used automatically by Page/Card/Field/Table headers/Tabs) shows the Chinese half quieter. Don't `split(' ')` labels; use `BI_SEP`.
- New screen: also give its menu key an icon in `ITEM_ICON` (src/nav.tsx). Detail pages pass `back="/list-path"` to `<Page>`.
- A menu item with `navAs: '<key>'` keeps its own permission but has no sidebar entry; it lights up the `<key>` screen instead.
  Orders: `/orders` (`OrdersHub`) holds the order list and supplier bills as tabs with one search box; `/packages` and `/lookup` redirect there.
  Packing: `/packing` (`PackingList`) is the box list with filters; *Pack & weigh*, *Receive without bill* and *Pack from file* open as dialogs
  (`?open=new|nobill|file`, `&order=` prefills the order no.); `/packing/new`, `/packing/nobill`, `/packing/import` redirect there.
  Shipments: `/shipments` lists rounds (filters, status, arrived, edit) with *New round* and *Load container* as dialogs (`?open=new|load&round=`); `/shipments/load` redirects there.

## Conventions
- All route handlers are synchronous (node:sqlite is sync) and throw `HttpError(status, message)`; messages are bilingual where the user sees them.
- Writes that touch several tables go in `tx(() => …)` and call `audit(user, action, entity, id, detail)`.
- UI strings: `t(english, thai, chinese)`. Default display is Thai + Chinese like the original; user can switch to th / zh / en.
- New simple table → add to `R` in `server/crud.ts` and use `CrudPage`. New screen → add menu key in `shared/menus.ts`, route in `src/App.tsx`, guard API with `needMenu(key)`.
- Run `npm run typecheck && npm test` before committing; extend `scripts/flow.ts` when you add business logic.

## Not ported (on purpose)
- Hard-coded SQL Server connection strings / `ConnectionStringForm` → replaced by `DB_PATH` env.
- `jnpupdater.exe` (desktop auto-updater) → not needed for a website.
- Direct printing to the POSTEK label printer → labels/bills open as printable pages (browser print dialog).
- Old SQL Server data migration is not included; the schema maps closely (see the table above) if it is ever needed.
