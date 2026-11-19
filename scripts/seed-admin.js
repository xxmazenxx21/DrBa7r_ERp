// Creates the first SUPERADMIN user if the User table is empty.
// Needed because every route except /auth/login requires a JWT and
// POST /users itself is protected — a fresh DB would otherwise be unusable.
// Safe to run on every container start (no-op once any user exists).
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM "User"');
    if (rows[0].n > 0) {
      console.log('[seed] users already exist, skipping admin seed');
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO "User" (id, username, password, role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'SUPERADMIN', NOW(), NOW())`,
      [randomUUID(), username, hash],
    );
    console.log(`[seed] created SUPERADMIN user "${username}"`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
