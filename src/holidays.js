// Polskie dni ustawowo wolne od pracy. Ruchome święta liczone od Wielkanocy, więc działa dla dowolnego roku.

const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Wielkanoc (kalendarz gregoriański, algorytm Meeusa/Jonesa/Butchera).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Zwraca Map: "YYYY-MM-DD" -> nazwa święta.
export function polishHolidays(year) {
  const holidays = new Map();
  const add = (date, name) => holidays.set(toKey(date), name);

  add(new Date(year, 0, 1), "Nowy Rok");
  add(new Date(year, 0, 6), "Trzech Króli");
  add(new Date(year, 4, 1), "Święto Pracy");
  add(new Date(year, 4, 3), "Święto Konstytucji 3 Maja");
  add(new Date(year, 7, 15), "Wniebowzięcie NMP");
  add(new Date(year, 10, 1), "Wszystkich Świętych");
  add(new Date(year, 10, 11), "Święto Niepodległości");
  if (year >= 2025) add(new Date(year, 11, 24), "Wigilia Bożego Narodzenia");
  add(new Date(year, 11, 25), "Boże Narodzenie");
  add(new Date(year, 11, 26), "Drugi dzień Bożego Narodzenia");

  const easter = easterSunday(year);
  const fromEaster = (offset) => new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + offset);
  add(easter, "Wielkanoc");
  add(fromEaster(1), "Poniedziałek Wielkanocny");
  add(fromEaster(49), "Zielone Świątki");
  add(fromEaster(60), "Boże Ciało");

  return holidays;
}
