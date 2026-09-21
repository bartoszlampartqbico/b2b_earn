// Ustawia hasło użytkownika (tworzy konto, jeśli nie istnieje).
// Użycie: npm run user:password -- bartosz.lampart@qbico.pl
// Hasło podaje się interaktywnie (nie trafia do historii powłoki).
import readline from "node:readline";
import { pool, query } from "../db.js";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../password.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
const lines = rl[Symbol.asyncIterator]();
let muted = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); }; // nie pokazuj wpisywanego hasła

async function ask(prompt) {
  muted = false;
  rl.setPrompt(prompt);
  rl.prompt();
  muted = true;
  const { value, done } = await lines.next();
  muted = false;
  rl.output.write("\n");
  if (done) throw new Error("Brak danych wejściowych.");
  return value;
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Użycie: npm run user:password -- <email>");
  process.exit(1);
}

try {
  const password = await ask("Nowe hasło: ");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`);
  }
  if (password !== (await ask("Powtórz hasło: "))) throw new Error("Hasła się różnią.");

  const hash = await hashPassword(password);
  const existing = await query("select id from app_users where lower(email) = $1", [email]);

  if (existing.rows[0]) {
    await query("update app_users set password_hash = $2 where id = $1", [existing.rows[0].id, hash]);
    console.log(`Zaktualizowano hasło dla ${email} (id: ${existing.rows[0].id}).`);
  } else {
    const { rows } = await query(
      "insert into app_users (email, password_hash) values ($1, $2) returning id",
      [email, hash],
    );
    console.log(`Utworzono nowego użytkownika ${email} (id: ${rows[0].id}).`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await pool.end();
}
