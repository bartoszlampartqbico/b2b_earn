export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Błąd ${res.status}`);
  return data;
}

// Zwraca zalogowanego użytkownika albo null, gdy nie ma sesji.
export async function fetchCurrentUser() {
  try {
    return (await request("GET", "/auth/me")).user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function login(email, password) {
  return (await request("POST", "/auth/login", { email, password })).user;
}

export function logout() {
  return request("POST", "/auth/logout");
}

export async function loadSettings() {
  return (await request("GET", "/settings")).settings;
}

export function saveSettings(s) {
  return request("PUT", "/settings", s);
}

export async function loadDays() {
  return (await request("GET", "/days")).days;
}

export function upsertDay(dateKey, hours, rate) {
  return request("PUT", `/days/${dateKey}`, { hours, rate });
}

export function deleteDay(dateKey) {
  return request("DELETE", `/days/${dateKey}`);
}
