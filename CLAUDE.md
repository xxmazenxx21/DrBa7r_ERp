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
You need it because there is no public signup and `POST /users` requires a JWT.
You can override the defaults in a `.env` file (see `.env.example`). Compose reads `POSTGRES_*`, `JWT_SECRET`, `API_PORT` and `DB_PORT` from it.

**Local dev:** `.env` needs `DATABASE_URL` (and ideally `JWT_SECRET`), then:
```bash
npm install
npx prisma migrate dev     # apply/create migrations + generate client
npm run start:dev
```
Other scripts: `npm run build` (= `prisma generate && nest build`), `npm run lint`, `npm test`, `npm run start:prod` (runs `dist/src/main.js`).

## Architecture

- `src/main.ts`: global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, so an unknown body field gives 400 `"property X should not exist"`. **Every DTO field must have a class-validator decorator** (use `@IsOptional()` for optional or ignored fields, and `@Type(() => Number)` for numbers) or it will be rejected. CORS allows any origin. Port is `PORT` or 3000.
- `src/app.module.ts`: global `ConfigModule` and global `JwtModule` (secret `JWT_SECRET`, fallback `'defaultSecret'`, expiry 3650d). Two global guards: `AuthGuard` then `RolesGuard`.
- **Auth:** every route requires `Authorization: Bearer <token>` unless it is marked `@Public()` (`src/decorators/public.decorator.ts`). The JWT payload is `{ sub, username, role }` (type `JwtPayload` in `src/guards/auth.guard.ts`) and is put on `request.user` (`AuthRequest`).
  - The only public routes are `POST /auth/signup`, `POST /auth/login` and `POST /users/login`. Both login routes call `AuthService.login`; `AuthModule` exports `AuthService` for that.
  - **Roles:** every other handler has `@Roles(Role.SUPERADMIN)`, put on **each method** (not the class). Non-SUPERADMIN users get 403, and no token gives 401. The owner will open up roles per endpoint later. New handlers must get `@Roles(Role.SUPERADMIN)` too, unless told otherwise.
  - **TEMPORARY signup:** `POST /auth/signup` always creates a **SUPERADMIN** (a client-sent `role` is validated but ignored). **It must be removed before production.** It is marked with a `// TEMPORARY` comment in `auth.controller.ts` and `auth.service.ts`.
- `src/filters/prisma-exception.filter.ts` is registered globally in `main.ts`. It maps Prisma errors to HTTP: P2002 unique → **409** `"<field> already exists"`, P2003 FK → **400** `"<field> does not exist"`, P2025 → 404, anything else → 500 (logged). Field names come from `meta.target` or from the pg driver-adapter metadata. Don't add duplicate pre-checks for unique or FK fields; let the filter handle them.
- `src/prisma/`: `PrismaService` extends the generated `PrismaClient` with the `PrismaPg` driver adapter. Every feature module imports `PrismaModule`.
- **Feature modules** (each one has controller/service/dto), with their routes:
  - `branch`: `/branch`
  - `inventory` (warehouses): `/inventory/branch/:branchId` and `/inventory/:id`
  - `categories`: `/categories`
  - `item-unit`: `/item-unit`
  - `products`: `/products`
  - `prodcut-inventory` (stock per warehouse): `/prodcut-inventory/inventory/:inventoryId` and `/prodcut-inventory/:id`
  - `customer`: `/customer`
  - `supplier`: `/supplier`
  - `employees`: `/employees/branch/:branchId` and `/employees/:id`
  - `users`: `/users`
  - `auth`: `/auth/signup` (temporary), `/auth/login`
- `src/utils/`: `codeGenratror/code.generator.ts` (`generateCode('PRD')` gives `PRD-123456`, a random 6-digit number with no uniqueness guarantee), `hash/hash.ts` (bcrypt, 10 rounds), `enum/enum.ts` (TS `Role` enum), `response/response.ts` (`ok(message, data)`). `src/users/user.select.ts` has `safeUserSelect` (every user field except `password`).

## Database / Prisma

- Prisma 7 **multi-file schema**: `prisma/schema.prisma` (generator + datasource) plus one file per model in `prisma/models/*.prisma`. `prisma.config.ts` points `schema` at the `prisma/` directory and reads `DATABASE_URL`.
- The client is generated to `generated/prisma` (gitignored, `moduleFormat = "cjs"`). Import it from `../../generated/prisma/client.js`.
- Migrations live in `prisma/migrations/`. When you change a model, run `npx prisma migrate dev --name <name>` and commit the migration. Docker applies migrations with `migrate deploy`.
- Models: Branch, Inventory, Categories, ItemUnit, Product, ProductInventory, Customer, Supplier, Employee, User, Currency, PurchaseInvoice.
- Design reference for upcoming work (purchase/sales invoices, returns, quotations): `Week2_ERP_DB_Design_Purchase_Sales.md`. `PurchaseInvoice` and `Currency` have models but no API module yet.

## Conventions

- IDs are `cuid()` strings. Business `code` fields are unique and **always server-generated** with `generateCode(prefix)`. Prefixes: `branch`, `category`, `unit`, `PRD`, `CUS`, `SUP`, `EMP`. In Create DTOs `code` is `@IsOptional()` and the service ignores the client value, so clients never need to send it. Follow this pattern for new modules.
- **Soft delete everywhere, no hard deletes:** DELETE sets `deletedAt = new Date()`. All reads filter `deletedAt: null`, and get-by-id uses `findFirst` and returns 404 for deleted rows. Never call `prisma.*.delete()` or `deleteMany()`. Categories and item-unit can't be deleted (400) while an *active* product uses them. `ProductsService` rejects a soft-deleted category/unit with 400 `"categoryId does not exist"` / `"primaryIteamUnitId does not exist"`.
- Money is `Decimal(18,2)`. Prices and quantities are `Decimal(18,4)`, including `ProductInventory.quantity` and `costPrice` (migration `20261121013011_week1_cleanup`, which also dropped `PurchaseInvoice.isDeleted` and added `createdAt`/`updatedAt`/`deletedAt` to Categories and ItemUnit).
- **Response shape:** every success response is exactly `{ message, data }`, built with `ok(message, data)` from `src/utils/response/response.ts` (no interceptor). Create, update and get-one return the record; get-all returns an array; delete returns `null`; login returns `{ access_token, user: { id, username, role } }`. Error responses keep the Nest default shape and the `PrismaExceptionFilter` shape.
- **Never pass a raw DTO to Prisma.** Build the `data` object field by field, so only known fields reach the DB. `code` is never copied from a DTO (always `generateCode`), on create or update.
- Never return a user's `password`: use `select: safeUserSelect` in every query that returns a user. `lastLoginDate` is set only on login.
- Errors: `NotFoundException` or `BadRequestException` from the services.
- `PATCH /prodcut-inventory/:id` (sets quantity/costPrice directly) is **intentional**: the admin uses it to manually correct a wrong opening quantity or cost. Don't remove or restrict it.
- Some names are misspelled but real, so don't "fix" them without a migration and a refactor: `prodcut-inventory`, `primaryIteamUnitId`, `codeGenratror`, Role value `ACCOUNTENT`.
- Roles: `SUPERADMIN | ADMIN | ACCOUNTENT | SALES | USER`. The Prisma enum and `src/utils/enum/enum.ts` must stay identical. `SALLES` was renamed to `SALES` in migration `20261119000000_rename_role_salles_to_sales`.
- **Frontend API docs** live in `doc/weekN/`, with one `.txt` file per module (`doc/week1/00-overview.txt` is the index plus general rules). `doc/week1` covers the current modules, and `week2`–`week6` are for later work (e.g. purchase/sales invoices go in week2). Whenever an endpoint, DTO or response shape changes, update its doc file in the same change. Docs must describe the **real** behavior (exact response shapes, status codes, Decimals returned as strings), not the intended behavior. `requests.http` has sample requests.

## Known issues / gotchas

- **Unique columns still count soft-deleted rows** (the schema is unchanged on purpose). How each case is handled:
  - `ProductInventory` (`@@unique([productId, inventoryId])`): `POST /prodcut-inventory/inventory/:id` **restores** a soft-deleted row. It sets `deletedAt = null` plus the new quantity/costPrice, keeps the same id, and returns 201 `"Product inventory restored successfully"`. An active row still gives 400 `"Product inventory already exists"`.
  - `Employee.nationalId`, `User.username` / `email` / `employeeId`, `Product.barcode`: before every create **and** update (including signup), call `assertNotUsedByDeleted(this.prisma.<model>, '<entity>', { field: value })` from `src/utils/unique/deleted-unique.ts`. A value held by a deleted row gives 409 `"<field> belongs to a deleted <entity>"`, and nothing is auto-restored. A value held by an active row is left to the PrismaExceptionFilter (409 `"<field> already exists"`). Any new unique non-`code` column on a soft-delete model needs the same call.
- Always throw Nest HTTP exceptions (`NotFoundException`, `BadRequestException`…), never a plain `Error`, which becomes a 500.
- Check that parent rows exist before creating children (e.g. `InventoryService.create` checks the branch), so the client gets a 404 instead of a 500 from the FK error.
- `UsersService.update` hashes `password` when it is sent. Any new code that writes passwords must use `hashPassword`.
- `PrismaService` constructor logs `DATABASE_URL` (password included) to stdout.
- Locally, `dist/` can come out incomplete because of `incremental` + `deleteOutDir`. If that happens, delete `dist/` and `*.tsbuildinfo` and rebuild.
