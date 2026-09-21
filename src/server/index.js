import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import app from "./app.js";

const port = Number(process.env.PORT) || 3001;

// Produkcja (własny serwer Node): ten sam proces serwuje zbudowany frontend (npm run build).
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, () => console.log(`API nasłuchuje na http://localhost:${port}`));
