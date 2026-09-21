import jwt from "jsonwebtoken";

const COOKIE_NAME = "session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  throw new Error("SESSION_SECRET musi mieć co najmniej 32 znaki (patrz .env.example)");
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

export function startSession(res, user) {
  const token = jwt.sign({ email: user.email }, secret, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: Math.floor(MAX_AGE_MS / 1000),
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export function endSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

// Middleware: wymaga ważnej sesji, ustawia req.user = { id, email }.
export function requireUser(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch {
      // wygasły lub sfałszowany token — traktujemy jak brak sesji
    }
  }
  res.status(401).json({ error: "Brak sesji" });
}
