# DrBa7r ERP: Backend API

ERP backend built with **NestJS 11**, **Prisma 7** and **PostgreSQL**. It covers branches, warehouses, products, product units, stock (item card), currencies, customers, suppliers, employees and users, with JWT login.

> **There is no deployed server.** Everyone runs the backend on their own machine with Docker and uses **http://localhost:3000**.
> The `main` branch is always the version the frontend uses. New work happens on `dev` and is merged into `main` after review.

---

## Run the backend locally (for the frontend developer)

### 0. Install Docker (once)

- **Windows / Mac:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and open it. It must be running whenever you use the backend.
- **Linux:** install Docker Engine plus the Compose plugin.

Check that it works:

```bash
docker --version
docker compose version
```

### 1. First time

```bash
git clone https://github.com/xxmazenxx21/DrBa7r_ERp.git
cd DrBa7r_ERp
git checkout main
docker compose up -d --build
```

The first run takes a few minutes (it downloads images and installs packages). This one command:

1. starts the **PostgreSQL** database (service `db`)
2. builds and starts the API (service `api`)
3. creates or updates all database tables (migrations run automatically on every start)
4. creates the first admin user, **only if the database has no users yet**
5. serves the API on **http://localhost:3000**

Check that it's running:

```bash
docker compose ps            # "db" and "api" should be running ("db" also healthy)
docker compose logs -f api   # wait for "Nest application successfully started" (Ctrl+C to exit the logs)
```

### 2. After each backend update

When the backend developer says `main` was updated:

```bash
cd DrBa7r_ERp
git checkout main
git pull origin main
docker compose up -d --build
```

- `--build` is required: it rebuilds the API with the new code.
- New database migrations are applied automatically when the API starts. **Your existing data is kept.**
- The admin user is created only if there are no users at all, so your current users and passwords don't change.
- Then read the newest `doc/FRONTEND_*` file (see [API documentation](#api-documentation-for-the-frontend)).

### 3. Log in

| Base URL                | username | password   | role       |
|-------------------------|----------|------------|------------|
| `http://localhost:3000` | `admin`  | `admin123` | SUPERADMIN |

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

The response looks like `{ "message": "Logged in successfully", "data": { "access_token": "...", "user": { "id", "username", "role" } } }`. Send `data.access_token` on every other request:

```
Authorization: Bearer <access_token>
```

> Right now **every endpoint requires a SUPERADMIN** account. A user with any other role gets `403 Forbidden`.

You can also create your own SUPERADMIN with the **temporary** `POST /auth/signup` (it will be removed before delivery):

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"myname","password":"secret123"}'
```

### 4. See the logs

```bash
docker compose logs -f api   # the API (errors, migrations, startup)
docker compose logs -f db    # the database
```

### 5. Stop

```bash
docker compose down
```

This stops and removes the containers. **Your data is kept** (it lives in the Docker volume `pgdata`). Start again with `docker compose up -d`.

### 6. Reset the database to empty

> ⚠️ **This deletes ALL your local data** (every product, stock, user…). It can't be undone.

```bash
docker compose down -v
docker compose up -d --build
```

`-v` deletes the database volume. On the next start the tables are created again (migrations) and the `admin` / `admin123` user is created again.

### Everyday commands

| What                                  | Command                                                            |
|---------------------------------------|--------------------------------------------------------------------|
| Start                                 | `docker compose up -d`                                             |
| Update to the latest `main`           | `git pull origin main` then `docker compose up -d --build`         |
| See API logs                          | `docker compose logs -f api`                                       |
| Restart only the API                  | `docker compose restart api`                                       |
| Stop (keeps data)                     | `docker compose down`                                              |
| **Delete everything, including data** | `docker compose down -v`                                           |

---

## Configuration (optional)

Everything works with the defaults. To change them, create a `.env` file next to `docker-compose.yml`. Copy `.env.example` as a starting point:

```bash
cp .env.example .env
```

| Variable            | Default                   | Meaning                           |
|---------------------|---------------------------|-----------------------------------|
| `API_PORT`          | `3000`                    | Port of the API on your machine   |
| `DB_PORT`           | `5433`                    | Port of Postgres on your machine  |
| `POSTGRES_USER`     | `erp`                     | Database user                     |
| `POSTGRES_PASSWORD` | `erp_password`            | Database password                 |
| `POSTGRES_DB`       | `erp`                     | Database name                     |
| `JWT_SECRET`        | `change_me_in_production` | Secret used to sign login tokens  |
| `ADMIN_USERNAME`    | `admin`                   | First admin's username            |
| `ADMIN_PASSWORD`    | `admin123`                | First admin's password            |

Then run `docker compose up -d --build` again. If you change `API_PORT`, the base URL changes too (e.g. `http://localhost:3001`).

> `ADMIN_USERNAME` / `ADMIN_PASSWORD` only apply when the database has **no users yet**. To use them on an existing database, reset it (step 6). That deletes all data.

### Connect to the database (optional)

You can use pgAdmin, DBeaver, TablePlus or another database tool:

```
Host: localhost   Port: 5433   User: erp   Password: erp_password   Database: erp
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `port is already allocated` | Another app is using port 3000 or 5433. Set `API_PORT=3001` or `DB_PORT=5434` in `.env`, then run `docker compose up -d`. |
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running. Open it and try again. |
| API keeps restarting | Run `docker compose logs api` to see the error. |
| A new endpoint returns 404 after `git pull` | You forgot `--build`. Run `docker compose up -d --build`. |
| Login returns 401 | Check the username and password. If you changed `ADMIN_*` after the first run, see the note in Configuration. |
| Every request returns 403 | You are logged in with a role other than SUPERADMIN. Log in as a SUPERADMIN. |
| Want a completely fresh start | Step 6: `docker compose down -v`, then `docker compose up -d --build`. |

---

## API documentation (for the frontend)

> **Frontend, read in this order:**
> 1. [`doc/FRONTEND_WEEK1_READ_FIRST.txt`](doc/FRONTEND_WEEK1_READ_FIRST.txt), [`doc/FRONTEND_WEEK1_UPDATE_2.txt`](doc/FRONTEND_WEEK1_UPDATE_2.txt), [`doc/FRONTEND_WEEK1_UPDATE_3.txt`](doc/FRONTEND_WEEK1_UPDATE_3.txt) (Week 1 changes)
> 2. [`doc/FRONTEND_WEEK2_READ_FIRST.txt`](doc/FRONTEND_WEEK2_READ_FIRST.txt) (Week 2 so far; updated with every Week 2 task)
>
> Together they list every change you must handle, including the breaking ones.

The docs are in [`doc/`](doc/), organized by week, with one `.txt` file per module. Start with
[`doc/week1/00-overview.txt`](doc/week1/00-overview.txt) (login, general rules, errors, every Week 1 module) and
[`doc/week2/00-overview.txt`](doc/week2/00-overview.txt) (pagination, new error codes, Week 2 modules).

Every error response has a stable `code` (e.g. `ALREADY_EXISTS`, `NOT_FOUND`) and a `field`. The frontend translates errors with these, not with the English `message`.

`requests.http` has ready-to-run sample requests (VS Code REST Client / JetBrains HTTP client). Its section **"WEEK 2 - THE BIG TEST"** runs the whole purchasing flow in 16 requests on an empty database (step 6 above), from a quotation to the item card.

---

## Run without Docker (backend developers)

Requirements: Node.js 22+ and a running PostgreSQL.

```bash
npm install
# create .env with:
#   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DBNAME?schema=public
#   JWT_SECRET=some_secret
npx prisma migrate dev    # create tables + generate Prisma client
npm run start:dev         # http://localhost:3000, auto-reload
```

Running without Docker doesn't create the admin user automatically. Run `node scripts/seed-admin.js` once, after the migrations.
