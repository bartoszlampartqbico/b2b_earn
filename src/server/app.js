import cookieParser from "cookie-parser";
import express from "express";
import authRoutes from "./routes/auth.js";
import dataRoutes from "./routes/data.js";

// Sama aplikacja (bez listen i bez plików statycznych) — używana przez index.js (własny serwer Node)
// oraz przez api/index.js (funkcja serverless na Vercelu).
const app = express();

// Za reverse proxy (Vercel, nginx, Render, Fly) ustaw TRUST_PROXY=1, żeby req.ip był prawdziwym IP klienta.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api", dataRoutes);

app.use("/api", (_req, res) => res.status(404).json({ error: "Nie znaleziono" }));

// Express 5 przekazuje tu też odrzucone promisy z handlerów async.
// eslint-disable-next-line no-unused-vars -- Express rozpoznaje handler błędów po 4 argumentach
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Błąd serwera" });
});

export default app;
