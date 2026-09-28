// Uruchamia migracje z src/server/sql/ na bazie z DATABASE_URL.
// Użycie: npm run db:migrate                          — wszystkie pliki po kolei
//         npm run db:migrate -- 002_extra_income.sql  — tylko wskazane pliki
import { readdir, readFile } from "node:fs/promises";
import { pool } from "../db.js";

const dir = new URL("../sql/", import.meta.url);
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();

try {
  for (const f of files) {
    console.log(`Uruchamiam ${f}…`);
    await pool.query(await readFile(new URL(f, dir), "utf8"));
  }
  const { rows } = await pool.query(
    "select email, password_hash is not null as has_password from app_users order by created_at",
  );
  console.log("Migracja zakończona. Użytkownicy w app_users:");
  for (const r of rows) console.log(`  ${r.email}  ${r.has_password ? "(hasło ustawione)" : "(BEZ HASŁA — uruchom npm run user:password)"}`);
} catch (err) {
  console.error("Migracja nie powiodła się (transakcja bieżącego pliku wycofana):");
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
