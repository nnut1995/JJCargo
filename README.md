# JJ Cargo — web back office

Web version of the JJCargoForm desktop program: orders from Chinese shops, supplier bills, packing & weighing,
loading containers, shipping-cost bills, customer THB/CNY balances, payment checking against bank statements,
expenses, currency exchange, staff and permissions. Thai + Chinese UI (English available).

## Run it
Needs **Node.js 22.5 or newer**.

```bash
npm install
cp .env.example .env          # then edit SESSION_SECRET and ADMIN_PASSWORD
npm run build
npm start                     # http://localhost:3001
```
For development: `npm run dev` (opens http://localhost:5173).
Want sample data to try it out? On an empty database run `npm run seed` before starting.

The database is one SQLite file (`data/jjcargo.db` by default). Back it up by copying that file.

## Feature map (old desktop screen → web page)
| Menu | Old form | Web page |
|---|---|---|
| Orders | NewOrderForm, SearchOrderForm | New order, Search orders |
| | NewPackageForm, ReceiveForm, SearchInvoiceForm, PrintForm | New supplier bill (receive goods), Search bills, bill print |
| | SearchCallForm | Lookup order / bill |
| Packing | NewPackingListForm, PackingListSaveForm | Pack & weigh (+ label with barcode) |
| | ReceiveNoBillForm | Receive without bill |
| | BuckPackingcs | Pack from file (old `ShipmentN.txt` pipe format or CSV) |
| | SearchPackingList, EditPackedForm, Add/EditPackedStyleForm | Search packing list (edit, contents, print labels) |
| | ShipmentForm, ShipmentCodeEditForm, ViewPackingListReport | Shipment rounds + packing-list report |
| | OffChinaFrom | Load container (scan box codes) |
| | ShipmentSummaryForm, ShipmentSummaryEditForm, PrintTextSettingForm | Shipping cost summary (per-box rate edit, other charges, post, print bill) |
| | SearchShipmentForm | Search shipping charges |
| | StyleForm | Product categories + units |
| Customers | CustomerInfo, CustomerInfoEdit | Customers (profile, rates, addresses) |
| | CustomerBalanceForm / YuanForm (+Edit) | THB balance, CNY balance |
| | ThaiPaymentInfoForm (+Edit) | Payment notices |
| Accounting | CheckPaymentForm, CheckPaymentEditForm, CheckPaymentWeightForm | Check payments (auto-match to bank lines) |
| | ViewBankStatementForm, BankStatementEditForm | Bank statements (running balance, find, print) |
| | GetBankStatementForm | Import bank statement (paste/CSV, column mapping, duplicate skip) |
| | TotalMoneyForm, DashboardForm | Total money, Dashboard |
| | DepositWithdrawChinaForm / ThaiForm (+Edit) | China / Thai deposit-withdraw |
| | AccountTransferForm | Account transfers |
| | InvoicePaymentForm, InvoicePaymentConfirm, InvoicePaymentRemarkFrom | Pay supplier bill (+ deductions on the bill page) |
| | InvoicePaymentSearchFrom | Bill payments |
| | DailyExpenseForm, ChinaExpenseForm, ExpenseTypeAddForm | Thai / China expenses (+ summary by type, types) |
| | OtherIncomeForm | Other income |
| | ExchageRateForm, ExchangeRateAddItemForm | Currency exchange (daily rate + exchange batches) |
| | UnpaidForm | Unpaid summary |
| Settings | BankInfoForm | Bank accounts |
| | EmployeeForm, AddEmployeeFrom, EmployeeRoleAddFrom | Employees & roles (+ activity log) |
| | UserPermissionForm | Menu permissions (per role and per person) |
| | VerifySettingForm | Verify permissions (who may tick "checked") |
| | GeneralSettingForm, PrinterSettingForm | General settings (rates, printing, webhook, password) |
| | LoginForm | Sign-in page |

See `CLAUDE.md` for architecture and the money rules.
