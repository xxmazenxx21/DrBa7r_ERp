# DrBa7r ERP: Backend API

ERP backend built with **NestJS 11**, **Prisma 7** and **PostgreSQL**. It covers branches, warehouses, products, stock, customers, suppliers, employees and users, with JWT login.

---

## Run with Docker (recommended)

### 1. Install Docker

- **Windows / Mac:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and open it. It must be running.
- **Linux:** install Docker Engine plus the Compose plugin.

Check that it works:

```bash
docker --version
docker compose version
```

### 2. Get the code

```bash
git clone https://github.com/xxmazenxx21/DrBa7r_ERp.git
cd DrBa7r_ERp
```

### 3. Start everything (one command)

```bash
docker compose up -d --build
```

The first run takes a few minutes because it downloads images and installs packages. This command:

1. starts a **PostgreSQL** database
2. builds the API
3. creates all database tables (migrations)
4. creates the first admin user if the database is empty
5. starts the API on **http://localhost:3000**

Check that it's running:

```bash
docker compose ps          # both "db" and "api" should be "running"
docker compose logs -f api # wait for "Nest application successfully started" (Ctrl+C to exit logs)
```

### 4. Log in

There is no signup. Use the admin account that is created automatically:

| username | password   | role       |
|----------|------------|------------|
| `admin`  | `admin123` | SUPERADMIN |

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Copy the `access_token` from the response and send it on every other request:

```
Authorization: Bearer <access_token>
```

To create more users, call `POST /users` with that token.

---

## Everyday commands

| What                                  | Command                          |
|---------------------------------------|----------------------------------|
| Start                                 | `docker compose up -d`           |
| Stop (keeps data)                     | `docker compose down`            |
| See API logs                          | `docker compose logs -f api`     |
| Rebuild after pulling new code        | `docker compose up -d --build`   |
| Restart only the API                  | `docker compose restart api`     |
| **Delete everything, including data** | `docker compose down -v`         |

### About your data

The database is stored in a Docker **volume** named `pgdata`.

- `docker compose down` and deleting or rebuilding containers keep your data.
- Only `docker compose down -v` deletes the data, so use it only when you want a fresh, empty database.

After you pull new code, run `docker compose up -d --build`. New database migrations are applied automatically on start, and existing data is kept.

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

Then run `docker compose up -d --build` again.

> `ADMIN_USERNAME` / `ADMIN_PASSWORD` only apply when the database has **no users yet**. To use them on an existing database, reset it with `docker compose down -v`. That deletes all data.

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
| Login returns 401 | Check the username and password. If you changed `ADMIN_*` after the first run, see the note in Configuration. |
| Want a completely fresh start | `docker compose down -v`, then `docker compose up -d --build`. |

---

## API documentation (for the frontend)

The docs are in [`doc/`](doc/), organized by week, with one `.txt` file per module. Start with
[`doc/week1/00-overview.txt`](doc/week1/00-overview.txt). It explains the login, the general rules and the errors, and links every module.

---

## Run without Docker (developers)

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
