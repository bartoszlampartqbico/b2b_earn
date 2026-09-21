import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import authRoutes from "./routes/auth.js";
import dataRoutes from "./routes/data.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

// Za reverse proxy (np. nginx, Render, Fly) ustaw TRUST_PROXY=1, żeby req.ip był prawdziwym IP klienta.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api", dataRoutes);

app.use("/api", (_req, res) => res.status(404).json({ error: "Nie znaleziono" }));

// Produkcja: ten sam proces serwuje zbudowany frontend (npm run build).
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// Express 5 przekazuje tu też odrzucone promisy z handlerów async.
// eslint-disable-next-line no-unused-vars -- Express rozpoznaje handler błędów po 4 argumentach
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Błąd serwera" });
});

app.listen(port, () => console.log(`API nasłuchuje na http://localhost:${port}`));
