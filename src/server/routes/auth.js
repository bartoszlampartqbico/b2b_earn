import { Router } from "express";
import { query } from "../db.js";
import { DUMMY_HASH, verifyPassword } from "../password.js";
import { endSession, requireUser, startSession } from "../session.js";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map(); // ip -> { count, resetAt }

function tooManyAttempts(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

const router = Router();

router.post("/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) return res.status(400).json({ error: "Podaj email i hasło." });

  if (tooManyAttempts(req.ip)) {
    return res.status(429).json({ error: "Zbyt wiele prób logowania. Spróbuj ponownie za kilkanaście minut." });
  }

  const { rows } = await query("select id, email, password_hash from app_users where email = $1", [email]);
  const user = rows[0];
  // Zawsze liczymy hash, żeby czas odpowiedzi nie zdradzał, czy konto istnieje.
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !user.password_hash || !ok) {
    recordFailure(req.ip);
    return res.status(401).json({ error: "Nieprawidłowy email lub hasło." });
  }

  attempts.delete(req.ip);
  startSession(res, user);
  res.json({ user: { id: user.id, email: user.email } });
});

router.post("/logout", (_req, res) => {
  endSession(res);
  res.status(204).end();
});

router.get("/me", requireUser, (req, res) => {
  res.json({ user: req.user });
});

export default router;
