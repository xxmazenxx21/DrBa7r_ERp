# CLAUDE.md

ERP backend (drba7r): NestJS 11 + Prisma 7 + PostgreSQL, a REST API with JWT auth.
**Keep this file updated** whenever modules, models, conventions or the run setup change.

## Run

**Docker (recommended, one command):**
```bash
docker compose up -d --build     # API on :3000, Postgres on host :5433
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

- `src/main.ts`: global `AppValidationPipe` (`src/pipes/app-validation.pipe.ts`, a `ValidationPipe` with `whitelist + forbidNonWhitelisted + transform`), so an unknown body **or query** field gives 400 `"property X should not exist"`. Its errors keep Nest's message array and add `code: VALIDATION_FAILED` plus `field` (the first invalid property). **Every DTO field must have a class-validator decorator** or it will be rejected. Optional fields: `@IsOptional()` when the DB column is nullable (null is allowed and clears it) or the field is ignored; `@IsOptionalNotNull()` (`src/utils/validation/optional.ts`) when the column is NOT nullable (null → 400 instead of a Prisma 500). Numbers: `@Type(() => Number) @IsNumber()` plus `@MaxDecimalPlaces(4)` for prices/quantities/costs or `@MaxDecimalPlaces(2)` for money (`src/utils/validation/max-decimal-places.ts`; don't use class-validator's `maxDecimalPlaces`, it throws on `1e-7`). Update DTOs are `PartialType(CreateXDto, { skipNullProperties: false })`, so PATCH null is validated: it clears nullable fields and gives 400 on the others. Usernames use `@IsUsername()` (`src/utils/validation/username.ts`: trimmed, `/^[A-Za-z0-9._-]{3,30}$/`); login only trims. CORS allows any origin. Port is `PORT` or 3000.
- `src/app.module.ts`: global `ConfigModule` and global `JwtModule` (secret `JWT_SECRET`, fallback `'defaultSecret'`, expiry 3650d). Two global guards: `AuthGuard` then `RolesGuard`.
- **Auth:** every route requires `Authorization: Bearer <token>` unless it is marked `@Public()` (`src/decorators/public.decorator.ts`). The JWT payload is `{ sub, username, role }` (type `JwtPayload` in `src/guards/auth.guard.ts`) and is put on `request.user` (`AuthRequest`).
  - **Current user:** `@CurrentUser()` (`src/decorators/current-user.decorator.ts`) gives the JWT payload, `@CurrentUser('sub')` just the user id. Use it for `createdBy` / `postedBy`; **never take a user id from the body**.
  - The only public routes are `POST /auth/signup`, `POST /auth/login` and `POST /users/login`. Both login routes call `AuthService.login`; `AuthModule` exports `AuthService` for that.
  - **Roles:** every other handler has `@Roles(Role.SUPERADMIN)`, put on **each method** (not the class). Non-SUPERADMIN users get 403, and no token gives 401. The owner will open up roles per endpoint later. New handlers must get `@Roles(Role.SUPERADMIN)` too, unless told otherwise.
  - **TEMPORARY signup:** `POST /auth/signup` always creates a **SUPERADMIN** (a client-sent `role` is validated but ignored). **It must be removed before production.** It is marked with a `// TEMPORARY` comment in `auth.controller.ts` and `auth.service.ts`.
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
  - `numbering` (no routes): `NumberingService.next(tx, docType, date)` → `PI-2026-000001`. Exported by `NumberingModule`; import that module where you create documents.
  - Static GET routes (`@Get()`, `@Get('branch/:branchId')`) must stay **before** `@Get(':id')` in each controller. List filters use a query DTO (e.g. `src/utils/dto/branch-filter.dto.ts`), so they're validated and whitelisted.
- `src/utils/`: `code-generator/code.generator.ts` (`generateCode('PRD')` gives `PRD-123456`, a random 6-digit number with no uniqueness guarantee), `hash/hash.ts` (bcrypt, 10 rounds), `enum/enum.ts` (TS `Role` enum, plus `ItemType` / `CostingMethod` re-exported from the generated Prisma client), `errors/error-codes.ts` (`ErrorCode`, `errorBody()`), `exists/assert-exists.ts` (`assertExists`, `doesNotExist`), `unique/deleted-unique.ts` (`assertNotUsedByDeleted`), `validation/` (`IsOptionalNotNull`, `Trim`, `MaxDecimalPlaces`, `IsUsername`), `dto/branch-filter.dto.ts`, `response/response.ts` (`ok(message, data)`), `pagination/pagination.ts` (`PaginationQueryDto`, `pageArgs()`, `paginated()`), `document/document-totals.ts` (`calcLine()`, `calcTotals()`). `src/users/user.select.ts` has `safeUserSelect` (every user field except `password`). `src/users/user-branch.ts` has `resolveUserBranch` (used by users create/update and signup).

- **Pagination (every new Week 2 list):** query DTO extends `PaginationQueryDto` (`?page` ≥ 1 default 1, `?pageSize` 1–100 default 20, else 400). In the service: `findMany({ where, ...pageArgs(query) })` + `count({ where })` (in one `$transaction([...])`), then `ok(msg, paginated(items, total, query))` → `data = { items, meta: { page, pageSize, total, totalPages } }`. Week 1 lists stay plain arrays.
- **Document totals:** quotations, invoices and returns compute totals ONLY with `calcLine(qty, price, discountPercent?, discountValue?)` (line total, 4 dp) and `calcTotals(lineTotals, discountPercent?, discountValue?, taxPercent?)` (`subTotal`, `discountValue`, `taxValue`, `netTotal`, 2 dp), all `Prisma.Decimal`, ROUND_HALF_UP. A percent wins over a value; tax is on `subTotal − discountValue`; out-of-range percent / discount > amount → 400 BAD_REQUEST. The client never sends totals. (Owner-approved formulas, since the "Simple Week 2" file they reference is not in the repo.)

## Database / Prisma

- Prisma 7 **multi-file schema**: `prisma/schema.prisma` (generator + datasource) plus one file per model in `prisma/models/*.prisma`. `prisma.config.ts` points `schema` at the `prisma/` directory and reads `DATABASE_URL`.
- The client is generated to `generated/prisma` (gitignored, `moduleFormat = "cjs"`). Import it from `../../generated/prisma/client.js`.
- Migrations live in `prisma/migrations/`. When you change a model, run `npx prisma migrate dev --name <name>` and commit the migration. Docker applies migrations with `migrate deploy`.
- Models: Branch, Inventory, Categories, ItemUnit, Product, ProductInventory, Customer, Supplier, Employee, User, Currency, PurchaseInvoice, DocumentSequence.
- Week 2 enums live in `prisma/models/week2_enums.prisma` (migration `week2_enums_and_sequence`): `DocumentStatus` (DRAFT/POSTED/CANCELLED), `PaymentType` (CASH/CREDIT), `QuotationStatus` (DRAFT/SENT/ACCEPTED/REJECTED/CONVERTED), `DocumentType` (PQ/PI/PR), `StockMovementType` (OPENING/ADJUSTMENT/PURCHASE/PURCHASE_CANCEL/PURCHASE_RETURN/PURCHASE_RETURN_CANCEL). `PurchaseInvoice.status` / `paymentType` are still `Int` until the purchase-invoices task.
- **Document numbers** (`DocumentSequence`, `@@unique([docType, year])`): only `NumberingService.next()` touches this table. Always call it with the **same `tx`** that creates the document (`prisma.$transaction(async (tx) => { const code = await this.numbering.next(tx, 'PI', dto.invoiceDate); ... })`), so a failed document doesn't burn a number and the locked counter row serializes concurrent creates. It's a native upsert (`INSERT … ON CONFLICT`), safe for the first number of a year too. Year = `date.getUTCFullYear()`.
- Design reference for upcoming work (purchase/sales invoices, returns, quotations): `Week2_ERP_DB_Design_Purchase_Sales.md`. `PurchaseInvoice` and `Currency` have models but no API module yet.

## Conventions

- IDs are `cuid()` strings. Business `code` fields are unique and **always server-generated** with `generateCode(prefix)`. Prefixes: `branch`, `category`, `unit`, `PRD`, `CUS`, `SUP`, `EMP`. In Create DTOs `code` is `@IsOptional()` and the service ignores the client value, so clients never need to send it. Follow this pattern for new modules.
- **References to other records:** every id in a request **body** that points to another row (`categoryId`, `primaryItemUnitId`, `productId`, `employeeId`, `branchId`, …) is checked with `assertExists(this.prisma.<model>, '<field>', id)` from `src/utils/exists/assert-exists.ts` before the write. Missing **or soft-deleted** → 400 `"<field> does not exist"` (DOES_NOT_EXIST, field = the input name). Ids in the URL **path** / `?branchId=` keep 404 NOT_FOUND (missing or deleted), via each service's own lookup. New FK inputs must do the same; the DB FK only catches missing rows, not deleted ones.
- **User ↔ employee branch:** a user linked to an employee is always in the employee's branch (`resolveUserBranch`): `employeeId` without `branchId` → branchId filled from the employee; a different `branchId` → 400 BAD_REQUEST field `branchId` "branchId must match the employee's branch"; PATCH of `branchId` alone is checked against the stored employee; `employeeId: null` unlinks and keeps the branch.
- **openingBalance** (customer and supplier) may be negative. Customer: + = the customer owes us, − = we owe the customer. Supplier: + = we owe the supplier, − = the supplier owes us. `creditLimit` stays ≥ 0.
- **Soft delete everywhere, no hard deletes:** DELETE sets `deletedAt = new Date()`. All reads filter `deletedAt: null`, and get-by-id uses `findFirst` and returns 404 for deleted rows. Never call `prisma.*.delete()` or `deleteMany()`. Categories and item-unit can't be deleted (400) while an *active* product uses them. `ProductsService` rejects a soft-deleted category/unit with 400 `"categoryId does not exist"` / `"primaryItemUnitId does not exist"` (via `assertExists`).
- Money is `Decimal(18,2)`. Prices and quantities are `Decimal(18,4)`, including `ProductInventory.quantity` and `costPrice` (migration `20261121013011_week1_cleanup`, which also dropped `PurchaseInvoice.isDeleted` and added `createdAt`/`updatedAt`/`deletedAt` to Categories and ItemUnit).
- **Response shape:** every success response is exactly `{ message, data }`, built with `ok(message, data)` from `src/utils/response/response.ts` (no interceptor). Create, update and get-one return the record; get-all returns an array; delete returns `null`; login returns `{ access_token, user: { id, username, role } }`. Error responses keep the Nest default shape and the `PrismaExceptionFilter` shape.
- **Never pass a raw DTO to Prisma.** Build the `data` object field by field, so only known fields reach the DB. `code` is never copied from a DTO (always `generateCode`), on create or update.
- Never return a user's `password`: use `select: safeUserSelect` in every query that returns a user. `lastLoginDate` is set only on login.
- Errors: Nest exceptions from the services (`NotFoundException`, `BadRequestException`…). Wrap the body in `errorBody(...)` when the code/field should be more specific than the status default.
- `PATCH /product-inventory/:id` (sets quantity/costPrice directly) is **intentional**: the admin uses it to manually correct a wrong opening quantity or cost. Don't remove or restrict it.
- The old misspellings were fixed in migration `20261122000000_week1_naming_and_enums` (renames, data kept): route `/prodcut-inventory` → `/product-inventory` (module `src/product-inventory`, classes `ProductInventory*`), `Product.primaryIteamUnitId`/`primaryIteamUnit` → `primaryItemUnitId`/`primaryItemUnit` (FK constraint renamed too), Role `ACCOUNTENT` → `ACCOUNTANT`, and `src/utils/codeGenratror` → `src/utils/code-generator`. **Don't reintroduce the old names.** Any future rename of a column or enum value must be a hand-written `RENAME`, never Prisma's drop/re-create draft.
- **Product enums:** `itemType ItemType @default(STOCK)` (`STOCK` = مخزني, `SERVICE` = خدمي) and `costingMethod CostingMethod @default(WEIGHTED_AVERAGE)` (متوسط التكلفة المرجح). Both are optional in DTOs (`@IsEnum`). The same migration converted old ints (`itemType` 2 → SERVICE, else STOCK; every `costingMethod` → WEIGHTED_AVERAGE).
- Roles: `SUPERADMIN | ADMIN | ACCOUNTANT | SALES | USER`. The Prisma enum and `src/utils/enum/enum.ts` must stay identical. `SALLES` was renamed to `SALES` in migration `20261119000000_rename_role_salles_to_sales`.
- **Frontend API docs** live in `doc/weekN/` (`doc/week2/00-overview.txt`: pagination, new error codes, totals), with one `.txt` file per module (`doc/week1/00-overview.txt` is the index plus general rules). Change notes for the frontend live in `doc/FRONTEND_WEEK1_READ_FIRST.txt`, `doc/FRONTEND_WEEK1_UPDATE_2.txt` and `doc/FRONTEND_WEEK1_UPDATE_3.txt` (UPDATE_3 also records decisions for later weeks: roles until Week 5, ADJUSTMENT movement + `reason` on manual stock edit from Week 2, and postponed self-delete / last-SUPERADMIN / freeing employeeId+email guards); add a new `FRONTEND_*` file for each later round of frontend-visible changes, with BEFORE/AFTER examples. `doc/week1` covers the current modules, and `week2`–`week6` are for later work (e.g. purchase/sales invoices go in week2). Whenever an endpoint, DTO or response shape changes, update its doc file in the same change. Docs must describe the **real** behavior (exact response shapes, status codes, Decimals returned as strings), not the intended behavior. `requests.http` has sample requests.

## Known issues / gotchas

- **Unique columns still count soft-deleted rows** (the schema is unchanged on purpose). How each case is handled:
  - `ProductInventory` (`@@unique([productId, inventoryId])`): `POST /product-inventory/inventory/:id` **restores** a soft-deleted row. It sets `deletedAt = null` plus the new quantity/costPrice, keeps the same id, and returns 201 `"Product inventory restored successfully"`. An active row still gives 400 `"Product inventory already exists"`.
  - `Employee.nationalId`, `User.username` / `email` / `employeeId`, `Product.barcode`: before every create **and** update (including signup), call `assertNotUsedByDeleted(this.prisma.<model>, '<entity>', { field: value })` from `src/utils/unique/deleted-unique.ts`. A value held by a deleted row gives 409 `"<field> belongs to a deleted <entity>"`, and nothing is auto-restored. A value held by an active row is left to the PrismaExceptionFilter (409 `"<field> already exists"`). Any new unique non-`code` column on a soft-delete model needs the same call.
- Always throw Nest HTTP exceptions (`NotFoundException`, `BadRequestException`…), never a plain `Error`, which becomes a 500.
- Check that parent rows exist before creating children (e.g. `InventoryService.create` checks the branch), so the client gets a 404 instead of a 500 from the FK error.
- `UsersService.update` hashes `password` when it is sent. Any new code that writes passwords must use `hashPassword`.
- `PrismaService` constructor logs `DATABASE_URL` (password included) to stdout.
- **Not enforced yet (postponed to the end of the project, frontend blocks them):** a user deleting themselves or changing their own role, deleting/demoting the last SUPERADMIN, and freeing `employeeId`/`email` when a user is deleted (a deleted user keeps them → BELONGS_TO_DELETED).
- Deleting a branch does not touch its employees/warehouses, so `resolveUserBranch` can copy a deleted branch from an active employee of that branch.
- Locally, `dist/` can come out incomplete because of `incremental` + `deleteOutDir`. If that happens, delete `dist/` and `*.tsbuildinfo` and rebuild.
