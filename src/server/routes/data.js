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

// --- Dodatkowe przychody (per miesiąc, z własną stawką VAT) ---

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VAT_RATES = ["23", "8", "5", "0", "zw"];

const toExtraIncome = (r) => ({
  id: r.id,
  month: r.month_key,
  description: r.description,
  netAmount: Number(r.net_amount),
  vatRate: r.vat_rate,
});

function parseExtraIncome(body) {
  const { month, description = "", netAmount, vatRate } = body ?? {};
  if (typeof month !== "string" || !MONTH_KEY_RE.test(month)) return null;
  if (typeof description !== "string" || description.length > 200) return null;
  if (!isNum(netAmount) || netAmount <= 0 || netAmount >= 1e10) return null;
  if (!VAT_RATES.includes(vatRate)) return null;
  return { month, description: description.trim(), netAmount, vatRate };
}

router.get("/extra-income", async (req, res) => {
  const { rows } = await query(
    `select id, month_key, description, net_amount, vat_rate from earnings_extra_income
     where user_id = $1 order by created_at`,
    [req.user.id],
  );
  res.json({ items: rows.map(toExtraIncome) });
});

router.post("/extra-income", async (req, res) => {
  const e = parseExtraIncome(req.body);
  if (!e) return res.status(400).json({ error: "Nieprawidłowy przychód." });
  const { rows } = await query(
    `insert into earnings_extra_income (user_id, month_key, description, net_amount, vat_rate)
     values ($1, $2, $3, $4, $5)
     returning id, month_key, description, net_amount, vat_rate`,
    [req.user.id, e.month, e.description, e.netAmount, e.vatRate],
  );
  res.status(201).json({ item: toExtraIncome(rows[0]) });
});

router.put("/extra-income/:id", async (req, res) => {
  const e = parseExtraIncome(req.body);
  if (!UUID_RE.test(req.params.id) || !e) return res.status(400).json({ error: "Nieprawidłowy przychód." });
  const { rowCount } = await query(
    `update earnings_extra_income set
       month_key = $3, description = $4, net_amount = $5, vat_rate = $6, updated_at = now()
     where id = $1 and user_id = $2`,
    [req.params.id, req.user.id, e.month, e.description, e.netAmount, e.vatRate],
  );
  if (!rowCount) return res.status(404).json({ error: "Nie znaleziono" });
  res.status(204).end();
});

router.delete("/extra-income/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: "Nieprawidłowy identyfikator." });
  await query("delete from earnings_extra_income where id = $1 and user_id = $2", [req.params.id, req.user.id]);
  res.status(204).end();
});

export default router;
