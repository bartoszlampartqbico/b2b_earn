import { Router } from "express";
import { query } from "../db.js";
import { requireUser } from "../session.js";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const router = Router();
router.use(requireUser);

// pg zwraca kolumny numeric jako stringi, a frontend liczy na liczbach — stąd Number().

router.get("/settings", async (req, res) => {
  const { rows } = await query(
    "select hourly_rate, tax_rate, zus_amount, currency from earnings_settings where user_id = $1",
    [req.user.id],
  );
  const r = rows[0];
  res.json({
    settings: r && {
      hourlyRate: Number(r.hourly_rate),
      taxRate: Number(r.tax_rate),
      zusAmount: Number(r.zus_amount),
      currency: r.currency,
    },
  });
});

router.put("/settings", async (req, res) => {
  const { hourlyRate, taxRate, zusAmount, currency } = req.body ?? {};
  if (!isNum(hourlyRate) || !isNum(taxRate) || !isNum(zusAmount) || typeof currency !== "string") {
    return res.status(400).json({ error: "Nieprawidłowe ustawienia." });
  }
  await query(
    `insert into earnings_settings (id, user_id, hourly_rate, tax_rate, zus_amount, currency, updated_at)
     values ($1, $1, $2, $3, $4, $5, now())
     on conflict (user_id) do update set
       hourly_rate = excluded.hourly_rate,
       tax_rate = excluded.tax_rate,
       zus_amount = excluded.zus_amount,
       currency = excluded.currency,
       updated_at = now()`,
    [req.user.id, hourlyRate, taxRate, zusAmount, currency],
  );
  res.status(204).end();
});

router.get("/days", async (req, res) => {
  const { rows } = await query(
    "select date_key::text as date_key, hours, rate from earnings_days where user_id = $1",
    [req.user.id],
  );
  const days = {};
  for (const r of rows) days[r.date_key] = { hours: Number(r.hours), rate: Number(r.rate) };
  res.json({ days });
});

router.put("/days/:dateKey", async (req, res) => {
  const { dateKey } = req.params;
  const { hours, rate } = req.body ?? {};
  if (!DATE_KEY_RE.test(dateKey) || !isNum(hours) || hours <= 0 || !isNum(rate) || rate <= 0) {
    return res.status(400).json({ error: "Nieprawidłowy wpis." });
  }
  await query(
    `insert into earnings_days (user_id, date_key, hours, rate, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id, date_key) do update set
       hours = excluded.hours,
       rate = excluded.rate,
       updated_at = now()`,
    [req.user.id, dateKey, hours, rate],
  );
  res.status(204).end();
});

router.delete("/days/:dateKey", async (req, res) => {
  const { dateKey } = req.params;
  if (!DATE_KEY_RE.test(dateKey)) return res.status(400).json({ error: "Nieprawidłowa data." });
  await query("delete from earnings_days where user_id = $1 and date_key = $2", [req.user.id, dateKey]);
  res.status(204).end();
});

export default router;
