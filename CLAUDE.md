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

- `src/main.ts`: global `ValidationPipe` (no whitelist/transform options), CORS for any origin, port `PORT` or 3000.
- `src/app.module.ts`: global `ConfigModule` and global `JwtModule` (secret `JWT_SECRET`, fallback `'defaultSecret'`, expiry 3650d). Two global guards: `AuthGuard` then `RolesGuard`.
- **Auth:** every route requires `Authorization: Bearer <token>` unless it is marked `@Public()` (`src/decorators/public.decorator.ts`). The only public routes are `POST /auth/login` and `POST /users/login` (identical behavior). `@Roles(...)` (`src/decorators/roles.decorator.ts`) is available but not used anywhere yet. The JWT payload is `{ sub, username, role }` and is put on `request.user`.
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
  - `auth`: `/auth/login`
- `src/utils/`: `codeGenratror/code.generator.ts` (`generateCode('PRD')` gives `PRD-123456`, a random 6-digit number with no uniqueness guarantee), `hash/hash.ts` (bcrypt, 10 rounds), `enum/enum.ts` (TS `Role` enum).

## Database / Prisma

- Prisma 7 **multi-file schema**: `prisma/schema.prisma` (generator + datasource) plus one file per model in `prisma/models/*.prisma`. `prisma.config.ts` points `schema` at the `prisma/` directory and reads `DATABASE_URL`.
- The client is generated to `generated/prisma` (gitignored, `moduleFormat = "cjs"`). Import it from `../../generated/prisma/client.js`.
- Migrations live in `prisma/migrations/`. When you change a model, run `npx prisma migrate dev --name <name>` and commit the migration. Docker applies migrations with `migrate deploy`.
- Models: Branch, Inventory, Categories, ItemUnit, Product, ProductInventory, Customer, Supplier, Employee, User, Currency, PurchaseInvoice.
- Design reference for upcoming work (purchase/sales invoices, returns, quotations): `Week2_ERP_DB_Design_Purchase_Sales.md`. `PurchaseInvoice` and `Currency` have models but no API module yet.

## Conventions

- IDs are `cuid()` strings. Business `code` fields are unique and **always server-generated** with `generateCode(prefix)`. Prefixes: `branch`, `category`, `unit`, `PRD`, `CUS`, `SUP`, `EMP`. In Create DTOs `code` is `@IsOptional()` and the service ignores the client value, so clients never need to send it. Follow this pattern for new modules.
- **Soft delete:** set `deletedAt`. Queries filter `deletedAt: null` and use `findFirst` for lookups by id. Exception: PurchaseInvoice also has `isDeleted`.
- Money is `Decimal(18,2)`. Prices and quantities are `Decimal(18,4)`.
- Responses are usually `{ data, message }`. Products use `{ message, product(s) }` instead.
- Errors: `NotFoundException` or `BadRequestException` from the services.
- Some names are misspelled but real, so don't "fix" them without a migration and a refactor: `prodcut-inventory`, `primaryIteamUnitId`, `codeGenratror`, Role value `ACCOUNTENT`.
- Roles: `SUPERADMIN | ADMIN | ACCOUNTENT | SALES | USER`. The Prisma enum and `src/utils/enum/enum.ts` must stay identical. `SALLES` was renamed to `SALES` in migration `20261119000000_rename_role_salles_to_sales`.
- **Frontend API docs** live in `doc/weekN/`, with one `.txt` file per module (`doc/week1/00-overview.txt` is the index plus general rules). `doc/week1` covers the current modules, and `week2`–`week6` are for later work (e.g. purchase/sales invoices go in week2). Whenever an endpoint, DTO or response shape changes, update its doc file in the same change. Docs must describe the **real** behavior (exact response shapes, status codes, Decimals returned as strings), not the intended behavior. `requests.http` has sample requests.

## Known issues / gotchas

- Categories and item-unit use **hard** deletes. Delete is blocked with a 400 while any product (including soft-deleted ones) references the row.
- Always throw Nest HTTP exceptions (`NotFoundException`, `BadRequestException`…), never a plain `Error`, which becomes a 500.
- Check that parent rows exist before creating children (e.g. `InventoryService.create` checks the branch), so the client gets a 404 instead of a 500 from the FK error.
- `UsersService.update` hashes `password` when it is sent. Any new code that writes passwords must use `hashPassword`.
- `PrismaService` constructor logs `DATABASE_URL` (password included) to stdout.
- Locally, `dist/` can come out incomplete because of `incremental` + `deleteOutDir`. If that happens, delete `dist/` and `*.tsbuildinfo` and rebuild.
