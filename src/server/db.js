import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("Brak DATABASE_URL (patrz .env.example)");
}

// Supabase wymaga TLS; lokalny Postgres można uruchomić z DATABASE_SSL=false.
const ssl = process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false };

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl });

export const query = (text, params) => pool.query(text, params);
