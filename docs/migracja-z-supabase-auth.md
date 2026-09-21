# Własne logowanie zamiast Supabase Auth

Aplikacja nie używa już Supabase Auth ani `supabase-js`. Logowanie (email + hasło) i API obsługuje
własny backend w `src/server/`. **Baza danych nadal jest w Supabase (Postgres)** — zmienił się tylko
sposób uwierzytelniania i dostępu do niej.

## Jak to działa

```
przeglądarka ──/api (cookie sesji)──▶ backend Express ──DATABASE_URL──▶ Postgres (Supabase)
```

- Przeglądarka nie ma już dostępu do bazy. Rozmawia tylko z `/api`.
- Hasła są haszowane algorytmem scrypt. W bazie leży wyłącznie hasz.
- Sesja to podpisany JWT w ciasteczku `httpOnly` (`SameSite=Lax`, `Secure` w produkcji), ważny 30 dni.
- Użytkownicy żyją w tabeli `app_users`. Rejestracji przez API nie ma — konta tworzy się skryptem.
- Po 10 nieudanych logowaniach z jednego IP logowanie jest blokowane na 15 minut (limit w pamięci procesu).

## Zachowanie danych (bartosz.lampart@qbico.pl)

Dane w `earnings_settings` i `earnings_days` są powiązane z użytkownikiem przez `user_id` — UUID z
`auth.users`. Migracja **kopiuje istniejących użytkowników do `app_users` z tymi samymi UUID** i przepina
klucze obce na nową tabelę. Żaden wiersz z danymi nie jest kopiowany, zmieniany ani usuwany;
`auth.users` i polityki RLS zostają nietknięte. Konto dostaje tylko nowe hasło.

## Wdrożenie krok po kroku

1. **Kopia zapasowa** (zalecana): Supabase → Database → Backups albo
   `pg_dump "<DATABASE_URL>" -Fc -f backup.dump`.
2. **Konfiguracja**: skopiuj `.env.example` do `.env` i uzupełnij:
   - `DATABASE_URL` — Supabase → Project Settings → Database → Connection string (URI), z hasłem do bazy,
   - `SESSION_SECRET` — min. 32 znaki, np. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
3. **Migracja bazy** (jednorazowo, dopóki schemat `auth` istnieje):
   ```
   npm run db:migrate
   ```
   Skrypt działa w jednej transakcji i można go bezpiecznie uruchomić ponownie. Na końcu wypisuje
   użytkowników z `app_users` — Twoje konto powinno być na liście z dopiskiem „BEZ HASŁA”.
4. **Ustaw hasło** (hasło wpisujesz interaktywnie, nie trafia do historii powłoki):
   ```
   npm run user:password -- bartosz.lampart@qbico.pl
   ```
   Skrypt aktualizuje istniejące konto (zachowuje UUID). Ten sam skrypt tworzy nowych użytkowników.
5. **Uruchomienie lokalnie**: w dwóch terminalach `npm run server` oraz `npm run dev`
   (Vite przekazuje `/api` na port 3001).
6. **Uruchomienie w produkcji**: `npm run build`, potem `NODE_ENV=production npm start` (albo
   `NODE_ENV=production` w `.env`). Jeden proces serwuje frontend z `dist/` i API. Wymaga HTTPS
   (ciasteczko `Secure`); za reverse proxy ustaw `TRUST_PROXY=1`.
7. **Sprawdź** logowanie i czy widać dotychczasowe wpisy.

## Sprzątanie po Supabase (dopiero gdy wszystko działa)

- Klucz `anon` był zapisany w kodzie w historii gita. Frontend go już nie używa. Dopóki RLS jest włączone,
  a Supabase Auth wyłączone (Authentication → Providers → wyłącz Email), nie da się z nim dostać do danych.
  Po weryfikacji możesz dodatkowo wyrotować klucze w Project Settings → API.
- **Nie usuwaj** tabeli `auth.users` ani nie kasuj projektu, dopóki nie masz pewności, że migracja
  się udała. Sama migracja nie zależy od `auth.users` po wykonaniu, ale to Twoja siatka bezpieczeństwa.
- Backend łączy się jako rola `postgres`, która omija RLS — izolację użytkowników zapewnia kod backendu
  (każde zapytanie filtruje po `user_id` z sesji).

## Uwagi i ograniczenia

- **Brak resetu hasła.** Zapomniane hasło ustawia się ponownie: `npm run user:password -- <email>`.
- **Wylogowanie nie unieważnia tokenu po stronie serwera** — JWT jest bezstanowy i wygasa po 30 dniach.
  Zmiana hasła nie wylogowuje istniejących sesji; zmiana `SESSION_SECRET` unieważnia wszystkie.
- **Limiter prób logowania** jest w pamięci: resetuje się po restarcie i nie działa między instancjami.
  Bez `TRUST_PROXY` za reverse proxy wszyscy użytkownicy dzielą jeden IP.
- Migracja zakłada tabele `earnings_settings` (klucz `user_id`) i `earnings_days` (`user_id`, `date_key`).
  Dodaje unikalne indeksy potrzebne do `INSERT ... ON CONFLICT`; jeśli w danych są duplikaty tych kluczy,
  migracja zgłosi błąd i niczego nie zmieni.
