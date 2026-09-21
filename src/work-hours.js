import { toKey } from "./holidays.js";

export const WORKDAY_HOURS = 8;

const round2 = (n) => Math.round(n * 100) / 100;

// Statystyka godzin dla miesiąca (month: 0-11).
// * dzień roboczy = pon–pt, który nie jest świętem; norma to WORKDAY_HOURS h dziennie,
// * dzień wolny  = dzień roboczy przed `todayKey` bez żadnych przepracowanych godzin
//   (dzisiejszy i przyszłe dni jeszcze się nie liczą jako wolne),
// * nadgodziny   = godziny ponad normę w dni robocze + wszystkie godziny w weekendy i święta.
export function monthHoursStats(year, month, days, holidays, todayKey) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let workingDays = 0, workedHours = 0, daysOff = 0, overtime = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key = toKey(date);
    const weekday = date.getDay(); // 0 = Nd, 6 = Sb
    const isWorkingDay = weekday !== 0 && weekday !== 6 && !holidays.has(key);
    const hours = days[key]?.hours ?? 0;

    workedHours += hours;
    if (isWorkingDay) {
      workingDays++;
      if (hours === 0 && key < todayKey) daysOff++;
      overtime += Math.max(0, hours - WORKDAY_HOURS);
    } else {
      overtime += hours;
    }
  }

  return {
    workingDays,
    workingHours: workingDays * WORKDAY_HOURS,
    workedHours: round2(workedHours),
    daysOff,
    offHours: daysOff * WORKDAY_HOURS,
    overtime: round2(overtime),
  };
}
