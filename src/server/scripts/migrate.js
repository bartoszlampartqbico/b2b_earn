// Uruchamia src/server/sql/001_app_users.sql na bazie z DATABASE_URL.
// Użycie: npm run db:migrate
import { readFile } from "node:fs/promises";
import { pool } from "../db.js";

const file = new URL("../sql/001_app_users.sql", import.meta.url);

try {
  await pool.query(await readFile(file, "utf8"));
  const { rows } = await pool.query(
    "select email, password_hash is not null as has_password from app_users order by created_at",
  );
  console.log("Migracja zakończona. Użytkownicy w app_users:");
  for (const r of rows) console.log(`  ${r.email}  ${r.has_password ? "(hasło ustawione)" : "(BEZ HASŁA — uruchom npm run user:password)"}`);
} catch (err) {
  console.error("Migracja nie powiodła się (transakcja wycofana, nic nie zmieniono):");
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
