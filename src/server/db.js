import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("Brak DATABASE_URL (patrz .env.example)");
}

// Supabase wymaga TLS; lokalny Postgres można uruchomić z DATABASE_SSL=false.
const ssl = process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false };

// Na Vercelu (serverless) działa wiele instancji naraz, więc każda dostaje małą pulę.
const max = process.env.VERCEL ? 3 : 10;

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max });

export const query = (text, params) => pool.query(text, params);
