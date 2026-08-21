# Week 2 — ERP Database Design
## Purchase Invoices / Purchase Returns / Sales Quotations / Sales Invoices / Sales Returns


Every header (invoice-level) table follows the same ERP-standard pattern:

| Concern | How it's handled |
|---|---|
| **Numbering** | `Code` is the human-facing document number (e.g. `PI-2026-000123`), separate from the internal `Id`. Recommend numbering per branch + per year. |
| **Audit trail** | `CreatedBy` / `CreatedDate` / `ModifiedBy` / `ModifiedDate` on every table. |
| **Soft delete** | `IsDeleted bit Default 0` on every table (same rule as Week 1). |
| **Workflow / Posting** | Financial documents (Purchase/Sales Invoices & Returns) carry `Status` + `IsPosted` + `PostedDate` + `PostedBy`. Nothing touches stock (`ItemBalances`) until it's posted — this is what protects your inventory from being changed by a Draft document. |
| **Money vs. quantity precision** | Quantities & unit prices use `decimal(18,4)` (matches Week 1's `Items.RetailPrice`). Aggregated totals (`NetTotal`, `PaidAmount`...) use `decimal(18,2)`. |
| **Multi-currency** | `CurrencyId` + `ExchangeRate` included as optional fields — safe to drop if the system is single-currency (EGP/SAR/etc. only). |
| **Line-level snapshot** | Every detail table stores the price/cost *at the time of the transaction* — never trust a live join to `Items` for historical documents. |

---

## 1. Purchase Invoices (`PurchaseInvoices`)

فاتورة شراء من مورد — تزيد رصيد الصنف في المخزن عند الترحيل (Posting).

### Header — `PurchaseInvoices`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد للفاتورة |
| Code | nvarchar(20) | Unique, Required | رقم الفاتورة الداخلي (ترقيم تلقائي) |
| SupplierInvoiceNumber | nvarchar(50) | Optional | رقم فاتورة المورد نفسه (مرجعي) |
| InvoiceDate | date | Required | تاريخ الفاتورة |
| DueDate | date | Optional | تاريخ الاستحقاق (لو آجل) |
| SupplierId | int | Foreign Key (Suppliers), Required | المورد |
| BranchId | int | Foreign Key (Branches), Required | الفرع |
| WarehouseId | int | Foreign Key (Warehouses), Required | المخزن المستلم للبضاعة |
| CurrencyId | int | Foreign Key (Currencies), Optional | العملة (لو النظام متعدد العملات) |
| ExchangeRate | decimal(18,4) | Default 1 | سعر الصرف وقت الفاتورة |
| PaymentType | tinyint | Required | نوع الدفع (نقدي / آجل) |
| SubTotal | decimal(18,2) | Required | إجمالي قبل الخصم والضريبة |
| DiscountPercent | decimal(5,2) | Default 0 | نسبة الخصم على مستوى الفاتورة |
| DiscountValue | decimal(18,2) | Default 0 | قيمة الخصم |
| TaxValue | decimal(18,2) | Default 0 | إجمالي الضريبة |
| NetTotal | decimal(18,2) | Required | الصافي المستحق |
| PaidAmount | decimal(18,2) | Default 0 | المبلغ المدفوع |
| RemainingAmount | decimal(18,2) | Default 0 | المتبقي = NetTotal − PaidAmount |
| Status | tinyint | Required | حالة المستند (Draft/Confirmed/Posted/Cancelled) |
| IsPosted | bit | Default 0 | هل تم ترحيله على المخزون؟ |
| PostedDate | datetime | Nullable | تاريخ الترحيل |
| PostedBy | int | Foreign Key (Users), Nullable | من قام بالترحيل |
| Notes | nvarchar(500) | Optional | ملاحظات |
| CreatedBy | int | Foreign Key (Users), Required | منشئ السجل |
| CreatedDate | datetime | Required, Default GETDATE() | تاريخ الإنشاء |
| ModifiedBy | int | Foreign Key (Users), Nullable | آخر معدّل |
| ModifiedDate | datetime | Nullable | تاريخ آخر تعديل |
| IsDeleted | bit | Default 0 | Soft Delete |

### Details — `PurchaseInvoiceDetails`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد لبند الفاتورة |
| PurchaseInvoiceId | int | Foreign Key (PurchaseInvoices), Required | الفاتورة التابع لها |
| ItemId | int | Foreign Key (Items), Required | الصنف |
| UnitId | int | Foreign Key (ItemUnits), Required | وحدة القياس المستخدمة في هذا البند |
| Quantity | decimal(18,4) | Required | الكمية المشتراة |
| UnitCost | decimal(18,4) | Required | تكلفة الوحدة (قبل الخصم/الضريبة) |
| DiscountPercent | decimal(5,2) | Default 0 | نسبة خصم البند |
| DiscountValue | decimal(18,4) | Default 0 | قيمة خصم البند |
| TaxPercent | decimal(5,2) | Default 0 | نسبة الضريبة على البند |
| TaxValue | decimal(18,4) | Default 0 | قيمة الضريبة على البند |
| NetAmount | decimal(18,4) | Required | صافي البند |
| BatchNumber | nvarchar(50) | Optional | رقم التشغيلة (Batch/Lot) |
| ExpiryDate | date | Nullable | تاريخ الصلاحية (لو HasExpiryDate = true) |
| Notes | nvarchar(250) | Optional | ملاحظات على البند |
| IsDeleted | bit | Default 0 | Soft Delete |

---

## 2. Purchase Return Invoices (`PurchaseReturnInvoices`)

مرتجع شراء لمورد — تنقص رصيد الصنف في المخزن عند الترحيل.

### Header — `PurchaseReturnInvoices`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد |
| Code | nvarchar(20) | Unique, Required | رقم مستند المرتجع |
| ReturnDate | date | Required | تاريخ المرتجع |
| SupplierId | int | Foreign Key (Suppliers), Required | المورد |
| BranchId | int | Foreign Key (Branches), Required | الفرع |
| WarehouseId | int | Foreign Key (Warehouses), Required | المخزن المرتجع منه |
| OriginalPurchaseInvoiceId | int | Foreign Key (PurchaseInvoices), Nullable | فاتورة الشراء الأصلية (لو مرتجع مرتبط بفاتورة) |
| ReturnReason | nvarchar(250) | Optional | سبب الإرجاع |
| SubTotal | decimal(18,2) | Required | الإجمالي قبل الخصم/الضريبة |
| DiscountValue | decimal(18,2) | Default 0 | قيمة الخصم |
| TaxValue | decimal(18,2) | Default 0 | قيمة الضريبة |
| NetTotal | decimal(18,2) | Required | صافي المرتجع |
| RefundAmount | decimal(18,2) | Default 0 | المبلغ المسترد فعليًا |
| Status | tinyint | Required | حالة المستند |
| IsPosted | bit | Default 0 | هل تم الترحيل؟ |
| PostedDate | datetime | Nullable | تاريخ الترحيل |
| PostedBy | int | Foreign Key (Users), Nullable | من رحّل المستند |
| Notes | nvarchar(500) | Optional | ملاحظات |
| CreatedBy | int | Foreign Key (Users), Required | منشئ السجل |
| CreatedDate | datetime | Required, Default GETDATE() | تاريخ الإنشاء |
| ModifiedBy | int | Foreign Key (Users), Nullable | آخر معدّل |
| ModifiedDate | datetime | Nullable | تاريخ آخر تعديل |
| IsDeleted | bit | Default 0 | Soft Delete |

### Details — `PurchaseReturnInvoiceDetails`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد للبند |
| PurchaseReturnInvoiceId | int | Foreign Key (PurchaseReturnInvoices), Required | مستند المرتجع |
| PurchaseInvoiceDetailId | int | Foreign Key (PurchaseInvoiceDetails), Nullable | البند الأصلي في فاتورة الشراء |
| ItemId | int | Foreign Key (Items), Required | الصنف |
| UnitId | int | Foreign Key (ItemUnits), Required | وحدة القياس |
| Quantity | decimal(18,4) | Required | الكمية المرتجعة |
| UnitCost | decimal(18,4) | Required | تكلفة الوحدة وقت الشراء الأصلي |
| DiscountValue | decimal(18,4) | Default 0 | قيمة الخصم على البند |
| TaxValue | decimal(18,4) | Default 0 | قيمة الضريبة على البند |
| NetAmount | decimal(18,4) | Required | صافي البند |
| Notes | nvarchar(250) | Optional | ملاحظات |
| IsDeleted | bit | Default 0 | Soft Delete |

---

## 3. Sales Quotations (`SalesQuotations`)

عرض سعر للعميل — **لا يؤثر على المخزون إطلاقًا**، فقط يتحول لاحقًا إلى فاتورة بيع.

### Header — `SalesQuotations`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد |
| Code | nvarchar(20) | Unique, Required | رقم عرض السعر |
| QuotationDate | date | Required | تاريخ العرض |
| ValidUntil | date | Optional | تاريخ انتهاء صلاحية العرض |
| CustomerId | int | Foreign Key (Customers), Required | العميل |
| BranchId | int | Foreign Key (Branches), Required | الفرع |
| WarehouseId | int | Foreign Key (Warehouses), Optional | المخزن المخطط للتسليم منه |
| SalesEmployeeId | int | Foreign Key (Employees), Optional | مندوب المبيعات |
| SubTotal | decimal(18,2) | Required | الإجمالي قبل الخصم/الضريبة |
| DiscountPercent | decimal(5,2) | Default 0 | نسبة الخصم |
| DiscountValue | decimal(18,2) | Default 0 | قيمة الخصم |
| TaxValue | decimal(18,2) | Default 0 | قيمة الضريبة |
| NetTotal | decimal(18,2) | Required | الصافي |
| Status | tinyint | Required | Draft / Sent / Accepted / Rejected / Expired / Converted |
| ConvertedToSalesInvoiceId | int | Foreign Key (SalesInvoices), Nullable | الفاتورة الناتجة عن تحويل العرض |
| Notes | nvarchar(500) | Optional | ملاحظات |
| CreatedBy | int | Foreign Key (Users), Required | منشئ السجل |
| CreatedDate | datetime | Required, Default GETDATE() | تاريخ الإنشاء |
| ModifiedBy | int | Foreign Key (Users), Nullable | آخر معدّل |
| ModifiedDate | datetime | Nullable | تاريخ آخر تعديل |
| IsDeleted | bit | Default 0 | Soft Delete |

### Details — `SalesQuotationDetails`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد للبند |
| SalesQuotationId | int | Foreign Key (SalesQuotations), Required | عرض السعر |
| ItemId | int | Foreign Key (Items), Required | الصنف |
| UnitId | int | Foreign Key (ItemUnits), Required | وحدة القياس |
| Quantity | decimal(18,4) | Required | الكمية المعروضة |
| UnitPrice | decimal(18,4) | Required | سعر الوحدة المعروض |
| DiscountPercent | decimal(5,2) | Default 0 | نسبة الخصم على البند |
| DiscountValue | decimal(18,4) | Default 0 | قيمة الخصم |
| TaxValue | decimal(18,4) | Default 0 | قيمة الضريبة |
| NetAmount | decimal(18,4) | Required | صافي البند |
| Notes | nvarchar(250) | Optional | ملاحظات |
| IsDeleted | bit | Default 0 | Soft Delete |

---

## 4. Sales Invoices (`SalesInvoices`)

فاتورة بيع للعميل — تنقص رصيد الصنف في المخزن عند الترحيل، وتُستخدم لحساب تكلفة البضاعة المباعة (COGS).

### Header — `SalesInvoices`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد |
| Code | nvarchar(20) | Unique, Required | رقم الفاتورة |
| InvoiceDate | date | Required | تاريخ الفاتورة |
| DueDate | date | Optional | تاريخ الاستحقاق (لو آجل) |
| CustomerId | int | Foreign Key (Customers), Required | العميل |
| BranchId | int | Foreign Key (Branches), Required | الفرع |
| WarehouseId | int | Foreign Key (Warehouses), Required | المخزن المسلَّم منه |
| SalesQuotationId | int | Foreign Key (SalesQuotations), Nullable | عرض السعر الأصلي (لو محوّل) |
| SalesEmployeeId | int | Foreign Key (Employees), Optional | مندوب المبيعات |
| PaymentType | tinyint | Required | نقدي / آجل |
| SubTotal | decimal(18,2) | Required | الإجمالي قبل الخصم/الضريبة |
| DiscountPercent | decimal(5,2) | Default 0 | نسبة الخصم |
| DiscountValue | decimal(18,2) | Default 0 | قيمة الخصم |
| TaxValue | decimal(18,2) | Default 0 | قيمة الضريبة |
| NetTotal | decimal(18,2) | Required | الصافي المستحق |
| PaidAmount | decimal(18,2) | Default 0 | المبلغ المدفوع |
| RemainingAmount | decimal(18,2) | Default 0 | المتبقي |
| Status | tinyint | Required | حالة المستند |
| IsPosted | bit | Default 0 | هل تم الترحيل على المخزون؟ |
| PostedDate | datetime | Nullable | تاريخ الترحيل |
| PostedBy | int | Foreign Key (Users), Nullable | من رحّل المستند |
| Notes | nvarchar(500) | Optional | ملاحظات |
| CreatedBy | int | Foreign Key (Users), Required | منشئ السجل |
| CreatedDate | datetime | Required, Default GETDATE() | تاريخ الإنشاء |
| ModifiedBy | int | Foreign Key (Users), Nullable | آخر معدّل |
| ModifiedDate | datetime | Nullable | تاريخ آخر تعديل |
| IsDeleted | bit | Default 0 | Soft Delete |

### Details — `SalesInvoiceDetails`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد للبند |
| SalesInvoiceId | int | Foreign Key (SalesInvoices), Required | الفاتورة |
| ItemId | int | Foreign Key (Items), Required | الصنف |
| UnitId | int | Foreign Key (ItemUnits), Required | وحدة القياس |
| Quantity | decimal(18,4) | Required | الكمية المباعة |
| UnitPrice | decimal(18,4) | Required | سعر بيع الوحدة |
| CostPriceAtSale | decimal(18,4) | Required | تكلفة الوحدة وقت البيع (Snapshot لحساب الربحية) |
| DiscountPercent | decimal(5,2) | Default 0 | نسبة خصم البند |
| DiscountValue | decimal(18,4) | Default 0 | قيمة الخصم |
| TaxPercent | decimal(5,2) | Default 0 | نسبة الضريبة |
| TaxValue | decimal(18,4) | Default 0 | قيمة الضريبة |
| NetAmount | decimal(18,4) | Required | صافي البند |
| BatchNumber | nvarchar(50) | Optional | رقم التشغيلة المباعة |
| Notes | nvarchar(250) | Optional | ملاحظات |
| IsDeleted | bit | Default 0 | Soft Delete |

---

## 5. Sales Return Invoices (`SalesReturnInvoices`)

مرتجع بيع من عميل — تزيد رصيد الصنف في المخزن عند الترحيل.

### Header — `SalesReturnInvoices`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد |
| Code | nvarchar(20) | Unique, Required | رقم مستند المرتجع |
| ReturnDate | date | Required | تاريخ المرتجع |
| CustomerId | int | Foreign Key (Customers), Required | العميل |
| BranchId | int | Foreign Key (Branches), Required | الفرع |
| WarehouseId | int | Foreign Key (Warehouses), Required | المخزن المستلم للمرتجع |
| OriginalSalesInvoiceId | int | Foreign Key (SalesInvoices), Nullable | فاتورة البيع الأصلية |
| ReturnReason | nvarchar(250) | Optional | سبب الإرجاع |
| SubTotal | decimal(18,2) | Required | الإجمالي قبل الخصم/الضريبة |
| DiscountValue | decimal(18,2) | Default 0 | قيمة الخصم |
| TaxValue | decimal(18,2) | Default 0 | قيمة الضريبة |
| NetTotal | decimal(18,2) | Required | صافي المرتجع |
| RefundAmount | decimal(18,2) | Default 0 | المبلغ المسترد للعميل |
| Status | tinyint | Required | حالة المستند |
| IsPosted | bit | Default 0 | هل تم الترحيل؟ |
| PostedDate | datetime | Nullable | تاريخ الترحيل |
| PostedBy | int | Foreign Key (Users), Nullable | من رحّل المستند |
| Notes | nvarchar(500) | Optional | ملاحظات |
| CreatedBy | int | Foreign Key (Users), Required | منشئ السجل |
| CreatedDate | datetime | Required, Default GETDATE() | تاريخ الإنشاء |
| ModifiedBy | int | Foreign Key (Users), Nullable | آخر معدّل |
| ModifiedDate | datetime | Nullable | تاريخ آخر تعديل |
| IsDeleted | bit | Default 0 | Soft Delete |

### Details — `SalesReturnInvoiceDetails`

| اسم الحقل | نوع البيانات | Constraints | الوصف (بالعربية) |
|---|---|---|---|
| Id | int | Primary Key | المعرف الفريد للبند |
| SalesReturnInvoiceId | int | Foreign Key (SalesReturnInvoices), Required | مستند المرتجع |
| SalesInvoiceDetailId | int | Foreign Key (SalesInvoiceDetails), Nullable | البند الأصلي في فاتورة البيع |
| ItemId | int | Foreign Key (Items), Required | الصنف |
| UnitId | int | Foreign Key (ItemUnits), Required | وحدة القياس |
| Quantity | decimal(18,4) | Required | الكمية المرتجعة |
| UnitPrice | decimal(18,4) | Required | سعر الوحدة وقت البيع الأصلي |
| DiscountValue | decimal(18,4) | Default 0 | قيمة الخصم |
| TaxValue | decimal(18,4) | Default 0 | قيمة الضريبة |
| NetAmount | decimal(18,4) | Required | صافي البند |
| Notes | nvarchar(250) | Optional | ملاحظات |
| IsDeleted | bit | Default 0 | Soft Delete |

---

## Suggested Enum Values (tinyint fields)

Same convention as Week 1 (`ItemType`, `CostingMethod` left as tinyint without hard enum lock — these are suggestions, adjust as needed):

| Field | Suggested values |
|---|---|
| `Status` (all headers) | `0=Draft, 1=Confirmed, 2=Posted, 3=Cancelled` |
| `PaymentType` | `0=Cash, 1=Credit` |
| `SalesQuotations.Status` | `0=Draft, 1=Sent, 2=Accepted, 3=Rejected, 4=Expired, 5=Converted` |

---

## APIs Section

Same base rules as Week 1: **all tables get CRUD (Add/Update/Delete/Get)**, **Delete is always soft** (`IsDeleted = 1`, record stays queryable via GetDeleted-type filters). On top of CRUD, transaction documents need **workflow endpoints** (post/cancel/convert) since they affect stock and can't just be edited freely once confirmed.

All list (`GET` collection) endpoints support: pagination (`page`, `pageSize`), filtering by `branchId`, `warehouseId`, `dateFrom`/`dateTo`, `status`, and return header + line count (not full lines, to keep payload light — lines come from the `{id}` detail endpoint).

### 1. Purchase Invoices — `/api/purchase-invoices`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/purchase-invoices` | Create new invoice (header + lines), status = Draft |
| GET | `/api/purchase-invoices` | List with filters (supplierId, branchId, warehouseId, status, date range) |
| GET | `/api/purchase-invoices/{id}` | Get single invoice with all lines |
| PUT | `/api/purchase-invoices/{id}` | Update (only allowed while Status = Draft) |
| DELETE | `/api/purchase-invoices/{id}` | Soft delete |
| POST | `/api/purchase-invoices/{id}/post` | Confirm & post → increases `ItemBalances.Quantity`, sets `IsPosted=1` |
| POST | `/api/purchase-invoices/{id}/cancel` | Cancel a posted invoice → reverses stock movement |
| GET | `/api/purchase-invoices/by-supplier/{supplierId}` | All invoices for a supplier |
| GET | `/api/purchase-invoices/{id}/print` | Print/PDF view |

### 2. Purchase Return Invoices — `/api/purchase-return-invoices`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/purchase-return-invoices` | Create return (optionally linked to an original invoice) |
| GET | `/api/purchase-return-invoices` | List with filters |
| GET | `/api/purchase-return-invoices/{id}` | Get single with lines |
| PUT | `/api/purchase-return-invoices/{id}` | Update (only while Draft) |
| DELETE | `/api/purchase-return-invoices/{id}` | Soft delete |
| POST | `/api/purchase-return-invoices/{id}/post` | Post → decreases `ItemBalances.Quantity` |
| POST | `/api/purchase-return-invoices/{id}/cancel` | Cancel posted return → reverses stock |
| GET | `/api/purchase-return-invoices/by-original-invoice/{invoiceId}` | Returns linked to a given purchase invoice |

### 3. Sales Quotations — `/api/sales-quotations`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sales-quotations` | Create new quotation |
| GET | `/api/sales-quotations` | List with filters (customerId, branchId, status) |
| GET | `/api/sales-quotations/{id}` | Get single with lines |
| PUT | `/api/sales-quotations/{id}` | Update (only while Draft/Sent) |
| DELETE | `/api/sales-quotations/{id}` | Soft delete |
| PUT | `/api/sales-quotations/{id}/status` | Update status (Sent/Accepted/Rejected) |
| POST | `/api/sales-quotations/{id}/convert-to-invoice` | Creates a `SalesInvoice` from this quotation, sets `ConvertedToSalesInvoiceId` |
| GET | `/api/sales-quotations/by-customer/{customerId}` | Quotations for a customer |
| GET | `/api/sales-quotations/expiring` | Quotations nearing `ValidUntil` (for follow-up) |

### 4. Sales Invoices — `/api/sales-invoices`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sales-invoices` | Create invoice (directly, or via quotation conversion) |
| GET | `/api/sales-invoices` | List with filters |
| GET | `/api/sales-invoices/{id}` | Get single with lines |
| PUT | `/api/sales-invoices/{id}` | Update (only while Draft) |
| DELETE | `/api/sales-invoices/{id}` | Soft delete |
| POST | `/api/sales-invoices/{id}/post` | Post → decreases `ItemBalances.Quantity`, snapshots `CostPriceAtSale` on lines |
| POST | `/api/sales-invoices/{id}/cancel` | Cancel posted invoice → reverses stock |
| GET | `/api/sales-invoices/by-customer/{customerId}` | Invoices for a customer |
| GET | `/api/sales-invoices/{id}/print` | Print/PDF view |

### 5. Sales Return Invoices — `/api/sales-return-invoices`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sales-return-invoices` | Create return (optionally linked to original sales invoice) |
| GET | `/api/sales-return-invoices` | List with filters |
| GET | `/api/sales-return-invoices/{id}` | Get single with lines |
| PUT | `/api/sales-return-invoices/{id}` | Update (only while Draft) |
| DELETE | `/api/sales-return-invoices/{id}` | Soft delete |
| POST | `/api/sales-return-invoices/{id}/post` | Post → increases `ItemBalances.Quantity` |
| POST | `/api/sales-return-invoices/{id}/cancel` | Cancel posted return → reverses stock |
| GET | `/api/sales-return-invoices/by-original-invoice/{invoiceId}` | Returns linked to a given sales invoice |

