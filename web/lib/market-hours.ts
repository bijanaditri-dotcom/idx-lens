import type { MarketSession } from './types';
/** Regular board continuous sessions only. Holidays must come from a maintained provider calendar. */
export function marketSession(now = new Date(), holidays: string[] | null = null): MarketSession {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`, minute = +parts.hour * 60 + +parts.minute;
  const base = { calendarVerified: holidays !== null, timeZone: 'Asia/Jakarta' };
  if (['Sat', 'Sun'].includes(parts.weekday) || holidays?.includes(day)) return { ...base, status: 'CLOSED', phase: 'Non-trading day' };
  const friday = parts.weekday === 'Fri', morningEnd = friday ? 690 : 720, afternoonStart = friday ? 840 : 810;
  if (minute >= 540 && minute < morningEnd || minute >= afternoonStart && minute < 950) return { ...base, status: 'OPEN', phase: 'Continuous session' };
  if (minute >= morningEnd && minute < afternoonStart) return { ...base, status: 'BREAK', phase: 'Session break' };
  if (minute >= 525 && minute < 540) return { ...base, status: 'CLOSED', phase: 'Pre-opening auction' };
  if (minute >= 950 && minute < 962) return { ...base, status: 'CLOSED', phase: 'Closing auction' };
  if (minute >= 962 && minute < 975) return { ...base, status: 'CLOSED', phase: 'Post-closing' };
  return { ...base, status: 'CLOSED', phase: 'Outside continuous session' };
}
