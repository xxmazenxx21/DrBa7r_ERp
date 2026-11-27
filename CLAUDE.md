# CLAUDE.md

ERP backend (drba7r): NestJS 11 + Prisma 7 + PostgreSQL, a REST API with JWT auth.
**Keep this file updated** whenever modules, models, conventions or the run setup change.

## Environments and branches

- **There is no deployed server** (the old hosted server was removed; never add a hosted URL to the docs). Nothing runs online.
- `main` = what the frontend uses. Work happens on `dev`, **one commit per task**, and `dev` is merged into `main` only after review. **Never push unfinished work to `main`.**
- The frontend developer runs the backend from `main` with Docker on `http://localhost:3000` (`git pull origin main` → `docker compose up -d --build`; see README "Run the backend locally (for the frontend developer)"). So every change on `main` must work from a fresh `docker compose up -d --build` and from an upgrade of an existing volume (migrations run on start; the admin is seeded only when there are no users).

## Run

**Docker (recommended, one command):**
```bash
docker compose up -d --build     # API on :3000 (service `api`), Postgres on host :5433 (service `db`)
docker compose logs -f api
docker compose down              # stops; DB data is KEPT (named volume `pgdata`)
docker compose down -v           # also DELETES the database volume
```
On container start: `prisma migrate deploy` → `scripts/seed-admin.js` → `node dist/src/main.js`.
The seed creates a SUPERADMIN (`ADMIN_USERNAME`/`ADMIN_PASSWORD`, default `admin`/`admin123`) **only if the User table is empty**.
You need it because `POST /users` requires a SUPERADMIN JWT (the temporary `POST /auth/signup` also works until it is removed).
You can override the defaults in a `.env` file (see `.env.example`). Compose reads `POSTGRES_*`, `JWT_SECRET`, `API_PORT` and `DB_PORT` from it.

**Local dev:** `.env` needs `DATABASE_URL` (and ideally `JWT_SECRET`), then:
```bash
npm install
npx prisma migrate dev     # apply/create migrations + generate client
npm run start:dev
```
Other scripts: `npm run build` (= `prisma generate && nest build`), `npm run lint`, `npm test`, `npm run start:prod` (runs `dist/src/main.js`).

## Architecture

- `src/main.ts`: global `AppValidationPipe` (`src/pipes/app-validation.pipe.ts`, a `ValidationPipe` with `whitelist + forbidNonWhitelisted + transform`), so an unknown body **or query** field gives 400 `"property X should not exist"`. Its errors keep Nest's message array and add `code: VALIDATION_FAILED` plus `field` (the path of the first invalid property; nested: `lines.1.quantity`). **Every DTO field must have a class-validator decorator** or it will be rejected. Optional fields: `@IsOptional()` when the DB column is nullable (null is allowed and clears it) or the field is ignored; `@IsOptionalNotNull()` (`src/utils/validation/optional.ts`) when the column is NOT nullable (null → 400 instead of a Prisma 500). Numbers: `@Type(() => Number) @IsNumber()` plus `@MaxDecimalPlaces(4)` for prices/quantities/costs or `@MaxDecimalPlaces(2)` for money (`src/utils/validation/max-decimal-places.ts`; don't use class-validator's `maxDecimalPlaces`, it throws on `1e-7`). Update DTOs are `PartialType(CreateXDto, { skipNullProperties: false })`, so PATCH null is validated: it clears nullable fields and gives 400 on the others. Usernames use `@IsUsername()` (`src/utils/validation/username.ts`: trimmed, `/^[A-Za-z0-9._-]{3,30}$/`); login only trims. CORS allows any origin. Port is `PORT` or 3000.
- `src/app.module.ts`: global `ConfigModule` and global `JwtModule` (secret `JWT_SECRET`, fallback `'defaultSecret'`, expiry 3650d; both to fix before delivery, see Postponed). Two global guards: `AuthGuard` then `RolesGuard`.
- **Auth:** every route requires `Authorization: Bearer <token>` unless it is marked `@Public()` (`src/decorators/public.decorator.ts`). The JWT payload is `{ sub, username, role }` (type `JwtPayload` in `src/guards/auth.guard.ts`) and is put on `request.user` (`AuthRequest`).
  - **Current user:** `@CurrentUser()` (`src/decorators/current-user.decorator.ts`) gives the JWT payload, `@CurrentUser('sub')` just the user id. Use it for `createdBy` / `postedBy`; **never take a user id from the body**.
  - The only public routes are `POST /auth/signup`, `POST /auth/login` and `POST /users/login`. Both login routes call `AuthService.login`; `AuthModule` exports `AuthService` for that.
  - **Roles:** every other handler has `@Roles(Role.SUPERADMIN)`, put on **each method** (not the class). Non-SUPERADMIN users get 403, and no token gives 401. Real roles per endpoint come in Week 5 (see Postponed). New handlers must get `@Roles(Role.SUPERADMIN)` too, unless told otherwise.
  - **TEMPORARY signup:** `POST /auth/signup` always creates a **SUPERADMIN** (a client-sent `role` is validated but ignored). **It must be removed before delivery** (see Postponed). It is marked with a `// TEMPORARY` comment in `auth.controller.ts` and `auth.service.ts`.
- **Errors: every error body is `{ statusCode, message, error, code, field }`** (type `ErrorBody`, codes in `src/utils/errors/error-codes.ts`): `ALREADY_EXISTS | DOES_NOT_EXIST | BELONGS_TO_DELETED | NOT_FOUND | VALIDATION_FAILED | UNAUTHORIZED | FORBIDDEN | BAD_REQUEST | INTERNAL_ERROR`, plus Week 2's `INVALID_STATUS` (409, action not allowed in the document's status), `INSUFFICIENT_STOCK` (400) and `QUANTITY_EXCEEDED` (400, returning more than bought). These three must always be thrown with `errorBody(...)` (the status fallback would give 409 → ALREADY_EXISTS / 400 → BAD_REQUEST). The frontend translates with `code` + `field`, so **never rename a code**, and keep message texts stable too. Two global filters are registered in `main.ts`, in this order (catch-all first, specific last):
  - `src/filters/http-exception.filter.ts` (`@Catch()`): an exception thrown with `errorBody(...)` keeps its code/field. Otherwise the code comes from the status (401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 ALREADY_EXISTS, 400+array VALIDATION_FAILED, other 4xx BAD_REQUEST, anything else 500 INTERNAL_ERROR, logged) and `field` is null. It also fills in `error` when Nest leaves it out (e.g. 401).
  - To choose the code/field yourself, throw `new BadRequestException(errorBody(400, 'categoryId does not exist', ErrorCode.DOES_NOT_EXIST, 'categoryId'))`. That's how `assertExists` (DOES_NOT_EXIST), `assertNotUsedByDeleted` (BELONGS_TO_DELETED), "Product inventory already exists" (ALREADY_EXISTS, 400, field `productId`) and "branchId must match the employee's branch" (BAD_REQUEST, field `branchId`) do it.
- `src/filters/prisma-exception.filter.ts`: maps Prisma errors to HTTP. P2002 unique → **409** `"<field> already exists"` (ALREADY_EXISTS), P2003 FK → **400** `"<field> does not exist"` (DOES_NOT_EXIST), P2025 → 404 (NOT_FOUND), anything else → 500 (INTERNAL_ERROR, logged). Field names come from `meta.target` or from the pg driver-adapter metadata. Don't add pre-checks for values used by *active* rows on unique fields; let the filter handle them. FK inputs still go through `assertExists` (see Conventions), because the DB FK can't see soft-deleted rows; the P2003 mapping stays as a fallback.
- `src/prisma/`: `PrismaService` extends the generated `PrismaClient` with the `PrismaPg` driver adapter. Every feature module imports `PrismaModule`.
- **Feature modules** (each one has controller/service/dto), with their routes:
  - `branch`: `/branch`
  - `inventory` (warehouses): `/inventory` (all, optional `?branchId=`), `/inventory/branch/:branchId` and `/inventory/:id`
  - `categories`: `/categories`
  - `item-unit`: `/item-unit`
  - `products`: `/products`
  - `product-inventory` (stock per warehouse): `/product-inventory/inventory/:inventoryId` and `/product-inventory/:id`
  - `customer`: `/customer`
  - `supplier`: `/supplier`
  - `employees`: `/employees` (all, optional `?branchId=`), `/employees/branch/:branchId` and `/employees/:id`
  - `users`: `/users`
  - `auth`: `/auth/signup` (temporary), `/auth/login`
  - `currency`: `/currency` (CRUD; list is a plain array, default first then code)
  - `product-units`: `/products/:productId/units` (POST, GET) and `/product-units/:id` (PATCH, DELETE). `@Controller()` is empty and each method has its full path. Exports `ProductUnitsService` for `getUnitFactor()`.
  - `stock`: `/stock-movements` (GET, filters + paginated) and `/stock-movements/item-card` (GET, `productId` + `warehouseId` required). No POST. Exports `StockService`; `product-inventory` imports `StockModule`.
  - `purchase-quotations`: `/purchase-quotations` (POST, GET paginated + filters + search), `/:id` (GET, PATCH, DELETE), `/:id/status` (PATCH), `/:id/convert-to-invoice` (POST). Imports `NumberingModule`, `ProductUnitsModule`, `PurchaseInvoicesModule`.
  - `purchase-invoices`: `/purchase-invoices` (POST, GET paginated + filters + search), `/:id` (GET, PATCH, DELETE), `/:id/post`, `/:id/cancel` (POST), `/:id/returnable` (GET). Imports `NumberingModule`, `ProductUnitsModule`, `StockModule`; exports `PurchaseInvoicesService` (for `createFromQuotation`).
  - `purchase-returns`: `/purchase-returns` (POST, GET paginated + filters), `/:id` (GET, PATCH, DELETE), `/:id/post`, `/:id/cancel` (POST). Imports `NumberingModule`, `ProductUnitsModule`, `StockModule`; reads the invoice tables but does NOT import the invoices module.
  - `numbering` (no routes): `NumberingService.next(tx, docType, date)` → `PI-2026-000001`. Exported by `NumberingModule`; import that module where you create documents.
  - Static GET routes (`@Get()`, `@Get('branch/:branchId')`) must stay **before** `@Get(':id')` in each controller. List filters use a query DTO (e.g. `src/utils/dto/branch-filter.dto.ts`), so they're validated and whitelisted.
- `src/utils/`: `document/document-currency.ts` (`resolveCurrency(db, currencyId, exchangeRate)`: the shared currency + exchange-rate rule of every invoice; `db` = prisma or a tx), `code-generator/code.generator.ts` (`generateCode('PRD')` gives `PRD-123456`, a random 6-digit number with no uniqueness guarantee), `hash/hash.ts` (bcrypt, 10 rounds), `enum/enum.ts` (TS `Role` enum, plus `ItemType` / `CostingMethod` re-exported from the generated Prisma client), `errors/error-codes.ts` (`ErrorCode`, `errorBody()`), `exists/assert-exists.ts` (`assertExists`, `doesNotExist`), `unique/deleted-unique.ts` (`assertNotUsedByDeleted`, optional `excludeId` for a row being restored), `validation/` (`IsOptionalNotNull`, `Trim`, `MaxDecimalPlaces`, `IsUsername`), `dto/branch-filter.dto.ts`, `response/response.ts` (`ok(message, data)`), `pagination/pagination.ts` (`PaginationQueryDto`, `pageArgs()`, `paginated()`), `document/document-totals.ts` (`calcLine()`, `calcTotals()`), `document/document-lines.ts` (shared by every document: `resolveLines()` = per line assertExists product + only one line discount + `getUnitFactor` + `calcLine`, errors re-labelled `lines.<i>.<field>` by `inLine()`; `headerDiscount()`, `assertWarehouseInBranch()`, `assertNotBefore()`, `dateFilter()` (@db.Date range), `toDate()`, `todayDate()`, `invalidStatus()` = 409 INVALID_STATUS field `status`). `src/users/user.select.ts` has `safeUserSelect` (every user field except `password`). `src/users/user-branch.ts` has `resolveUserBranch` (used by users create/update and signup).

- **Pagination (every new Week 2 list):** query DTO extends `PaginationQueryDto` (`?page` ≥ 1 default 1, `?pageSize` 1–100 default 20, else 400). In the service: `findMany({ where, ...pageArgs(query) })` + `count({ where })` (in one `$transaction([...])`), then `ok(msg, paginated(items, total, query))` → `data = { items, meta: { page, pageSize, total, totalPages } }`. Week 1 lists stay plain arrays.
- **Document totals:** quotations, invoices and returns compute totals ONLY with `calcLine(qty, price, discountPercent?, discountValue?)` (line total, 4 dp) and `calcTotals(lineTotals, discountPercent?, discountValue?, taxPercent?)` (`subTotal`, `discountValue`, `taxValue`, `netTotal`, 2 dp), all `Prisma.Decimal`, ROUND_HALF_UP. A percent wins over a value; tax is on `subTotal − discountValue`; out-of-range percent / discount > amount → 400 BAD_REQUEST. The client never sends totals. (Owner-approved formulas, since the "Simple Week 2" file they reference is not in the repo.)

## Database / Prisma

- Prisma 7 **multi-file schema**: `prisma/schema.prisma` (generator + datasource) plus one file per model in `prisma/models/*.prisma`. `prisma.config.ts` points `schema` at the `prisma/` directory and reads `DATABASE_URL`.
- The client is generated to `generated/prisma` (gitignored, `moduleFormat = "cjs"`). Import it from `../../generated/prisma/client.js`.
- Migrations live in `prisma/migrations/`. When you change a model, run `npx prisma migrate dev --name <name>` and commit the migration. Docker applies migrations with `migrate deploy`.
- Models: Branch, Inventory, Categories, ItemUnit, Product, ProductUnit, ProductInventory, StockMovement, Customer, Supplier, Employee, User, Currency, PurchaseInvoice, DocumentSequence.
- Week 2 enums live in `prisma/models/week2_enums.prisma` (migration `week2_enums_and_sequence`): `DocumentStatus` (DRAFT/POSTED/CANCELLED), `PaymentType` (CASH/CREDIT), `QuotationStatus` (DRAFT/SENT/ACCEPTED/REJECTED/CONVERTED), `DocumentType` (PQ/PI/PR + Week 3 SQ/SI/SR/ST/SC), `StockMovementType` (OPENING/ADJUSTMENT/PURCHASE/PURCHASE_CANCEL/PURCHASE_RETURN/PURCHASE_RETURN_CANCEL + Week 3 SALE/SALE_CANCEL/SALE_RETURN/SALE_RETURN_CANCEL/TRANSFER_OUT/TRANSFER_IN/TRANSFER_OUT_CANCEL/TRANSFER_IN_CANCEL; Week 3 values added by migration `week3_enums`, ADD VALUE only). A stock count has no movement type of its own: it writes ADJUSTMENT with `sourceType = SC`. Enum values are only ever ADDED (`ALTER TYPE … ADD VALUE`), never dropped / re-created.
- **Document numbers** (`DocumentSequence`, `@@unique([docType, year])`): only `NumberingService.next()` touches this table. Always call it with the **same `tx`** that creates the document (`prisma.$transaction(async (tx) => { const code = await this.numbering.next(tx, 'PI', dto.invoiceDate); ... })`), so a failed document doesn't burn a number and the locked counter row serializes concurrent creates. It's a native upsert (`INSERT … ON CONFLICT`), safe for the first number of a year too. Year = `date.getUTCFullYear()`.
- Design reference for upcoming work (purchase/sales invoices, returns, quotations): `Week2_ERP_DB_Design_Purchase_Sales.md` and `doc/week2/Week 2 Tasks.pdf` (see Week 2 progress). `PurchaseInvoice` has a model but no API module yet.

## Conventions

- IDs are `cuid()` strings. Business `code` fields are unique and **always server-generated** with `generateCode(prefix)`. Prefixes: `branch`, `category`, `unit`, `PRD`, `CUS`, `SUP`, `EMP`. In Create DTOs `code` is `@IsOptional()` and the service ignores the client value, so clients never need to send it. Follow this pattern for new modules. **Exception: `Currency.code`** is sent by the client (ISO, `/^[A-Z]{3}$/`, trimmed, required, `assertNotUsedByDeleted`). Week 2 documents get sequential numbers from `NumberingService` instead.
- **References to other records:** every id in a request **body** that points to another row (`categoryId`, `primaryItemUnitId`, `productId`, `employeeId`, `branchId`, …) is checked with `assertExists(this.prisma.<model>, '<field>', id)` from `src/utils/exists/assert-exists.ts` before the write. Missing **or soft-deleted** → 400 `"<field> does not exist"` (DOES_NOT_EXIST, field = the input name). Ids in the URL **path** / `?branchId=` keep 404 NOT_FOUND (missing or deleted), via each service's own lookup. New FK inputs must do the same; the DB FK only catches missing rows, not deleted ones.
- **User ↔ employee branch:** a user linked to an employee is always in the employee's branch (`resolveUserBranch`): `employeeId` without `branchId` → branchId filled from the employee; a different `branchId` → 400 BAD_REQUEST field `branchId` "branchId must match the employee's branch"; PATCH of `branchId` alone is checked against the stored employee; `employeeId: null` unlinks and keeps the branch.
- **openingBalance** (customer and supplier) may be negative. Customer: + = the customer owes us, − = we owe the customer. Supplier: + = we owe the supplier, − = the supplier owes us. `creditLimit` stays ≥ 0.
- **Soft delete everywhere, no hard deletes:** DELETE sets `deletedAt = new Date()`. All reads filter `deletedAt: null`, and get-by-id uses `findFirst` and returns 404 for deleted rows. Never call `prisma.*.delete()` or `deleteMany()`, **except** for the LINES of a document that is still editable (quotation DRAFT/SENT, invoice DRAFT): `lines: { deleteMany: {}, create: [...] }` replaces them (they have no `deletedAt`; a draft has no effect, so there is nothing to keep). Categories and item-unit can't be deleted (400) while an *active* product uses them. `ProductsService` rejects a soft-deleted category/unit with 400 `"categoryId does not exist"` / `"primaryItemUnitId does not exist"` (via `assertExists`).
- Money is `Decimal(18,2)`. Prices and quantities are `Decimal(18,4)`, including `ProductInventory.quantity` and `costPrice` (migration `20261121013011_week1_cleanup`, which also dropped `PurchaseInvoice.isDeleted` and added `createdAt`/`updatedAt`/`deletedAt` to Categories and ItemUnit).
- **Response shape:** every success response is exactly `{ message, data }`, built with `ok(message, data)` from `src/utils/response/response.ts` (no interceptor). Create, update and get-one return the record; get-all returns an array; delete returns `null`; login returns `{ access_token, user: { id, username, role } }`. Error responses keep the Nest default shape and the `PrismaExceptionFilter` shape.
- **Never pass a raw DTO to Prisma.** Build the `data` object field by field, so only known fields reach the DB. `code` is never copied from a DTO (always `generateCode`), on create or update.
- Never return a user's `password`: use `select: safeUserSelect` in every query that returns a user. `lastLoginDate` is set only on login.
- Errors: Nest exceptions from the services (`NotFoundException`, `BadRequestException`…). Wrap the body in `errorBody(...)` when the code/field should be more specific than the status default.
- `PATCH /product-inventory/:id` (sets quantity/costPrice) is **intentional**: the admin uses it to manually correct a wrong opening quantity or cost / record a stock count. Don't remove it. Since Week 2 it goes through `StockService.adjust` (ADJUSTMENT movement, `reason` required when something changes).
- The old misspellings were fixed in migration `20261122000000_week1_naming_and_enums` (renames, data kept): route `/prodcut-inventory` → `/product-inventory` (module `src/product-inventory`, classes `ProductInventory*`), `Product.primaryIteamUnitId`/`primaryIteamUnit` → `primaryItemUnitId`/`primaryItemUnit` (FK constraint renamed too), Role `ACCOUNTENT` → `ACCOUNTANT`, and `src/utils/codeGenratror` → `src/utils/code-generator`. **Don't reintroduce the old names.** Any future rename of a column or enum value must be a hand-written `RENAME`, never Prisma's drop/re-create draft.
- **Product enums:** `itemType ItemType @default(STOCK)` (`STOCK` = مخزني, `SERVICE` = خدمي) and `costingMethod CostingMethod @default(WEIGHTED_AVERAGE)` (متوسط التكلفة المرجح). Both are optional in DTOs (`@IsEnum`). The same migration converted old ints (`itemType` 2 → SERVICE, else STOCK; every `costingMethod` → WEIGHTED_AVERAGE).
- **Product units** (`ProductUnit`, migration `product_units`): per product, how many primary units one `itemUnitId` holds (`factor` Decimal(18,4) > 0, optional unique `barcode`, optional `retailPrice`), `@@unique([productId, itemUnitId])`. The primary unit is never a row (factor 1 implicitly) and can't be added. Re-POSTing a deleted unit **restores** that row (201 "Product unit restored successfully"), like product-inventory; `assertNotUsedByDeleted(..., excludeId)` lets the restored row keep its own old barcode. `GET /products/:productId/units` = one list, primary first (`id: null`, `isPrimary: true`), then by factor. **`getUnitFactor(productId, itemUnitId, db?)`** is the only way documents convert a line unit to base units: primary → 1, a unit row → its factor, else 400 BAD_REQUEST field `itemUnitId` "unit is not defined for this product". Guards: **the primary unit is locked once used**: `PATCH /products/:id` with a *different* `primaryItemUnitId` → 400 BAD_REQUEST field `primaryItemUnitId` "primaryItemUnitId can't change: stock and units are stored in the current primary unit" when the product has ANY `StockMovement` (permanent, so forever) or ANY active `ProductUnit` (`ProductsService.assertPrimaryUnitNotUsed`; the same value is allowed). Every stored quantity and factor is in the primary unit, so it must never change under them; `DELETE /item-unit/:id` also refuses units used by active product units. `GET /products/:id` includes `units`.
- **Stock (`StockService`, `StockMovement`, migration `stock_movements`) — THE ONLY code that writes `ProductInventory` or `StockMovement`.** Invariant: `ProductInventory.quantity = SUM(StockMovement.quantity)` per product+warehouse (`warehouseId` = an `Inventory` id). Movements are never updated or deleted (no `deletedAt`); quantities are always in the primary unit (convert with `getUnitFactor`). `ProductInventory.costPrice` is the weighted average cost.
  - `stockIn(tx, args)` (+, new avg = (oldQty·oldAvg + qty·cost)/(oldQty+qty)), `stockOut(tx, args)` (−, avg unchanged, 400 **INSUFFICIENT_STOCK** field `quantity`), `adjust(tx, args)` (set new qty/cost, ONE movement with the difference, none if nothing changed; type ADJUSTMENT (default, `reason` required → 400 VALIDATION_FAILED field `reason`) or OPENING; `AdjustArgs` extends `MovementSource`, so a document such as a stock count can pass `sourceType/sourceId/sourceLineId/sourceCode` — without them nothing changes, e.g. PATCH product-inventory). All three take the caller's `tx` as the first parameter and never open their own transaction, so a document and its stock change commit together.
  - Each write locks the balance row first (`createMany skipDuplicates` to create it if needed + `SELECT … FOR UPDATE`), so concurrent outs can't oversell; `stockOut` never creates a row. `adjust`/`stockIn` also un-delete a soft-deleted row. SERVICE items: `stockIn`, `adjust` to a quantity > 0 and POST product-inventory → 400 BAD_REQUEST field `productId`; `assertNotService(db, productId)` is public.
  - Movements keep `sourceType/sourceId/sourceLineId/sourceCode` (document), `reason` (VarChar 250), `createdBy` (from `@CurrentUser('sub')`). Item card order: `movementDate, createdDate, id` ascending.
  - product-inventory: POST = `adjust(type OPENING)` on an empty/restored row; PATCH = `adjust` (ADJUSTMENT, `reason` in `UpdateProductInventoryDto`); DELETE = `adjust` to 0 (reason "حذف الصنف من المخزن") then soft delete, so a deleted row always has quantity 0. `PATCH /products/:id` refuses `itemType: SERVICE` while active stock rows exist.
  - The `stock_movements` migration backfilled one OPENING movement ("Week 1 opening balance", createdBy = oldest active SUPERADMIN) per active Week 1 stock row and set soft-deleted rows to quantity 0.
- **Documents (header + lines)** — quotations now, invoices / returns next, same shape:
  - Lines are checked and priced with `resolveLines()`; header totals with `calcTotals` via `headerDiscount()` (a `discountPercent` > 0 wins, else the fixed `discountValue`); store `discountPercent` (0 when fixed), `discountValue`, `taxPercent`, `taxValue`, `subTotal`, `netTotal`. The client never sends totals, codes or status (whitelist rejects them).
  - Create = checks → `resolveLines` → totals → `$transaction`: `numbering.next(tx, type, documentDate)` + create header with `lines: { create }`. `createdBy` / `modifiedBy` from `@CurrentUser('sub')`.
  - Status checks are done in ONE conditional write (`updateMany({ where: { id, status: <allowed> } })`; `count === 0` → 404 if missing else 409 INVALID_STATUS), so two requests can't both pass; edits "claim" the row the same way inside their transaction before replacing lines.
  - Quotations: `QuotationStatus` DRAFT → SENT → ACCEPTED | REJECTED (`PATCH /:id/status`), CONVERTED only via convert-to-invoice (one tx: conditional ACCEPTED → CONVERTED, `purchaseInvoices.createFromQuotation(tx, …)`, set `convertedToInvoiceId`; returns `{ quotation, invoice }`; body `paymentType`, `invoiceDate`, `warehouseId?`); edit only DRAFT/SENT; delete any status except CONVERTED; `isExpired` = `validUntil < today`; list items have `_count.lines`, no lines.
- **Purchase invoices** (migration `purchase_invoice_lines`: `status` Int → `DocumentStatus` and `paymentType` Int → `PaymentType` converted in place, `isPosted` dropped, + `taxPercent`, `cancelledDate/cancelledBy`, `PurchaseInvoiceLine`):
  - `DocumentStatus` DRAFT → POSTED → CANCELLED. Edit / delete only DRAFT; a POSTED invoice is only cancelled. Every transition is ONE conditional `updateMany` inside the transaction (double post → 409).
  - Payment: CASH → `paidAmount = netTotal`; CREDIT → 0..netTotal (400 above); `remainingAmount = netTotal − paidAmount`. Currency: none → the default (rate 1; 400 if no default); default → rate must be 1; other → `exchangeRate` required — via the shared `resolveCurrency(db, currencyId, exchangeRate)` (`src/utils/document/document-currency.ts`), also for sales invoices.
  - `build()` (all checks + totals) + `insertInvoice(tx)` (PI number + header + lines) are shared by `create` and `createFromQuotation(tx, quotation, dto, userId)` (no API; runs in the caller's tx; default currency; expiry dates NOT required there — posting checks them).
  - **post**: lines sorted by productId (lock order); SERVICE lines skipped; `stockUnitCost = lineTotal × (1 − discountValue/subTotal) × exchangeRate ÷ baseQuantity` (4 dp, tax excluded) saved on the line, then `stock.stockIn(PURCHASE, sourceType PI, sourceId, sourceLineId, sourceCode)`. Re-checks warehouse / products / expiry dates.
  - **cancel**: reverses exactly the PURCHASE movements of this invoice (`sourceType PI, sourceId`) with `stock.stockOut(PURCHASE_CANCEL)`; INSUFFICIENT_STOCK rolls everything back. Totals, lines and stockUnitCost stay. Cancel is refused (400) while a POSTED return points to the invoice; `returnable()` = quantity − POSTED return lines (line's unit); `GET /:id` includes `purchaseReturns`.
  - `DELETE /currency/:id` → 400 while any non-deleted purchase invoice uses the currency.
- **Purchase returns** (migration `purchase_returns`: `PurchaseReturn` + `PurchaseReturnLine`): DRAFT → POSTED → CANCELLED like invoices.
  - **Linked** (`purchaseInvoiceId`, invoice must be POSTED): supplier = the invoice's, branch/warehouse default to it; every line needs `purchaseInvoiceLineId` (product, unit, factor from it; `unitCost = lineTotal ÷ quantity`; client values ignored); discount = `subTotal × invoice.discountValue ÷ invoice.subTotal`, tax = invoice `taxPercent`. **QUANTITY_EXCEEDED** (field `lines.N.quantity`) when, per invoice line, the sum of this return's lines > bought − POSTED returns; checked on save and again on post (`assertQuantities`, excluding the return itself).
  - **Not linked**: supplier/branch/warehouse and line product/unit/unitCost required; header discount/tax like other documents. `refundAmount` 0..netTotal.
  - **post**: conditional DRAFT → POSTED, then for linked returns `SELECT … FOR UPDATE` on the invoice row (serializes with other returns' posts and with invoice cancel), re-check invoice POSTED + quantities, then `stock.stockOut(PURCHASE_RETURN, sourceType PR)` per STOCK line (current average). **cancel**: reverses exactly its PURCHASE_RETURN movements with `stock.stockIn(PURCHASE_RETURN_CANCEL)` at the movement's `unitCost`.
  - `update` merges the request with the saved return and rebuilds everything (`build`), lines always replaced.
- **Default currency** (`Currency.isDefault`, migration `currency_symbol_default`, which also added `symbol String?`): at most one active currency is default, and once one exists there is always one. `isDefault: true` on create/update unsets the others in the same transaction; deleting the default or PATCHing it to `false` → 400 BAD_REQUEST field `isDefault`. Every write that can touch the default runs in `CurrencyService.lockedTransaction()` (`pg_advisory_xact_lock(hashtext('currency_default'))`) and re-reads the row under the lock: without it, concurrent "make default" requests ended with 2–3 defaults and deadlocks (500). Use the same advisory-lock pattern for any future "only one row may be X" rule.
- Roles: `SUPERADMIN | ADMIN | ACCOUNTANT | SALES | USER`. The Prisma enum and `src/utils/enum/enum.ts` must stay identical. `SALLES` was renamed to `SALES` in migration `20261119000000_rename_role_salles_to_sales`.
- **Frontend API docs** live in `doc/weekN/` (`doc/week2/00-overview.txt`: pagination, new error codes, totals), with one `.txt` file per module (`doc/week1/00-overview.txt` is the index plus general rules). Change notes for the frontend: see "Frontend change files" below. `doc/week1` covers the current modules, and `week2`–`week6` are for later work (e.g. purchase/sales invoices go in week2). Whenever an endpoint, DTO or response shape changes, update its doc file in the same change. Docs must describe the **real** behavior (exact response shapes, status codes, Decimals returned as strings), not the intended behavior. `requests.http` has sample requests.

## Known issues / gotchas

- **Unique columns still count soft-deleted rows** (the schema is unchanged on purpose). How each case is handled:
  - `ProductInventory` (`@@unique([productId, inventoryId])`): `POST /product-inventory/inventory/:id` **restores** a soft-deleted row. It sets `deletedAt = null` plus the new quantity/costPrice, keeps the same id, and returns 201 `"Product inventory restored successfully"`. An active row still gives 400 `"Product inventory already exists"`.
  - `Employee.nationalId`, `User.username` / `email` / `employeeId`, `Product.barcode`: before every create **and** update (including signup), call `assertNotUsedByDeleted(this.prisma.<model>, '<entity>', { field: value })` from `src/utils/unique/deleted-unique.ts`. A value held by a deleted row gives 409 `"<field> belongs to a deleted <entity>"`, and nothing is auto-restored. A value held by an active row is left to the PrismaExceptionFilter (409 `"<field> already exists"`). Any new unique non-`code` column on a soft-delete model needs the same call.
- Always throw Nest HTTP exceptions (`NotFoundException`, `BadRequestException`…), never a plain `Error`, which becomes a 500.
- Check that parent rows exist before creating children (e.g. `InventoryService.create` checks the branch), so the client gets a 404 instead of a 500 from the FK error.
- `UsersService.update` hashes `password` when it is sent. Any new code that writes passwords must use `hashPassword`.
- Locally, `dist/` can come out incomplete because of `incremental` + `deleteOutDir`. If that happens, delete `dist/` and `*.tsbuildinfo` and rebuild.

## Week 2 progress

- The task list is `doc/week2/Week 2 Tasks.pdf`. Do **ONE task per request**: read section 0, section 1 and that task only (they are in Arabic; tables give the Prisma fields, the APIs, the rules and the files). If something is unclear or conflicts with the code, ask before guessing.
- **Done** (on `dev`): Task 1 setup (`@CurrentUser`, pagination, document totals, 3 error codes), Task 2 numbering (Week 2 enums, `DocumentSequence`, `NumberingService`), Task 3 currency, Task 4 product-units (+ follow-up "lock primary unit once used"), Task 5 stock (`StockMovement`, `StockService`, item card), Task 6 purchase-quotations without convert-to-invoice (migration `purchase_quotations`), Task 7 purchase-invoices (migration `purchase_invoice_lines`), Task 6 convert-to-invoice, Task 8 purchase-returns (migration `purchase_returns`), Task 9 docs + the big test (`requests.http` section "WEEK 2 - THE BIG TEST", W2-0…W2-16, verified on an empty DB: final stock 218, average 10.6818).
- Week 2 is finished and merged into `main`.
- `requests.http` layout: Week 1 samples first, then "WEEK 2 - THE BIG TEST" (self-contained, uses `w2*` request names and `@w2token`, must run on an empty DB in order), then "WEEK 2 - MORE EXAMPLES". Keep the big test green when you change Week 2 code; add new weeks as new sections.
- **The 4 rules of the week:**
  1. Stock is always counted in the primary unit (convert document lines with `getUnitFactor`).
  2. Only `StockService` writes `ProductInventory` / `StockMovement`.
  3. The server computes every total (`src/utils/document/document-totals.ts`); the client sends quantities, prices and percents only.
  4. A posted document is never edited or deleted, only cancelled (an opposite movement).

## Week 3 progress

- The task list is `doc/week3/Week 3 Tasks.pdf`. Do **ONE task per request**: read section 0, section 1 and that task only (each task ends with the exact prompt). The sales modules MIRROR the purchase modules (same shape: transaction, conditional `updateMany` on status, lines sorted by productId, `build()`), but stock goes the other way — understand before copying.
- **Done** (on `dev`): Task 1 setup (migration `week3_enums`: new `DocumentType` / `StockMovementType` values; `StockService.adjust` accepts a source; shared `resolveCurrency` in `src/utils/document/document-currency.ts`; `doc/week3/00-overview.txt`, `doc/FRONTEND_WEEK3_READ_FIRST.txt`).
- **Next, in this order:** Task 2 sales-quotations (without convert) → Task 3 sales-invoices → Task 4 convert-to-invoice → Task 5 sales-returns → Task 6 stock-transfers → Task 7 stock-counts → Task 8 docs + the big test (`week3flow.txt`, W3-0…W3-22).
- **The 6 decisions of Week 3** (don't change them without asking the owner):
  1. Stock transfer = ONE step: posting takes the goods out of the source warehouse and puts them into the destination in the same transaction (no "in transit").
  2. A sales return MUST be linked to a POSTED sales invoice (`salesInvoiceId` required); the goods come back at the original sale cost.
  3. A stock count goes DRAFT → POSTED only; no cancel (a mistake is fixed with a new count).
  4. Sales price: the user sends `unitPrice` (the frontend suggests it from the product); no price level per customer.
  5. Selling below cost is allowed, with no warning.
  6. `creditLimit` is NOT enforced until Week 4.
- **Rule 5 of Week 3 (new):** the cost of a sale never comes from the user: it comes from `stockOut()` (the average at the moment the goods leave) and is saved on the line (`stockUnitCost`). Anything that comes back into stock (invoice cancel, sales return, transfer cancel) comes back at the SAME cost it left with.

## Frontend change files

- Rule: **every task that changes something the frontend sees updates the current FRONTEND file in the same commit** (BEFORE/AFTER examples, suggested Arabic messages, Arabic labels for new keys / enum values).
- Current file: `doc/FRONTEND_WEEK3_READ_FIRST.txt` (bump its "Last update" line). Start a new `FRONTEND_WEEKN_READ_FIRST.txt` each week and point to it from `README.md` and `doc/weekN/00-overview.txt`.
- The older frontend change files of Weeks 1 and 2 were **deleted on purpose** by the owner (commit `34a7276`): don't recreate them and don't link to them. The whole Week 2 flow lives in `doc/week2/week2flow.txt`.
- The module docs in `doc/weekN/*.txt` are updated in the same commit too (see Conventions).

## Postponed — do NOT implement unless asked

This is the only list of known gaps / planned work. Don't add these notes anywhere else.

**Before delivery / production**
- Remove the temporary `POST /auth/signup` (always creates a SUPERADMIN; marked `// TEMPORARY`).
- Remove the `console.log` of `DATABASE_URL` in `src/prisma/prisma.service.ts` (prints the DB password).
- JWT: no `'defaultSecret'` fallback (fail to start without `JWT_SECRET`) and a sane `expiresIn` (today `'3650d'`), in `src/app.module.ts`.
- Review the suggested Arabic messages in `doc/**` with a native speaker.

**Users and branches**
- A user deleting themselves or changing their own role; deleting / demoting the last SUPERADMIN (the frontend blocks these for now).
- Freeing `employeeId` / `email` when a user is deleted (today a deleted user keeps them → 409 BELONGS_TO_DELETED blocks reuse).
- Deleting a branch that still has active warehouses / employees / users (not blocked; `resolveUserBranch` can then copy a deleted branch from an active employee).

**Products and stock**
- Deleting a product that still has stock or product units (not blocked; its unit barcodes stay taken).
- A product-unit barcode can equal another product's barcode (matters for POS scanning, Week 5).
- ASSEMBLY item type (تجميعي): not supported, waiting for the client's decision.

**Later weeks (planned, not bugs)**
- Week 4: lock customer / supplier `openingBalance` once they have posted documents.
- Week 4: customer balance + customer statement + `creditLimit` check + receipt vouchers + sales journal entries (retroactive for the Week 2 / Week 3 documents).
- Week 5: real roles per endpoint (today `@Roles(Role.SUPERADMIN)` everywhere); hide `costPrice` from SALES / USER; hide `stockUnitCost` / `lineCost` / `totalCost` / `grossProfit` from SALES / USER; manual stock edit (`PATCH /product-inventory/:id`) only for SUPERADMIN / ADMIN.
- Not in Week 3 (decided): sales returns without an invoice; two-step transfers (in transit); cancelling a stock count; price levels per customer.

**Design decisions (not bugs, keep them)**
- Ids in the URL path / query (`?branchId=`) return 404 NOT_FOUND for missing or deleted rows; ids in the body return 400 DOES_NOT_EXIST.
- `NumberingService.next()` takes the year in UTC: always pass the document date (a `@db.Date`), never `new Date()`.
