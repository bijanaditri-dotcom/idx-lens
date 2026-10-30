export const number = (n: number | null | undefined, digits = 0) => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const signed = (n: number | null | undefined, digits = 2) => n == null ? '—' : `${n > 0 ? '+' : ''}${number(n, digits)}`;
export const compact = (n: number | null | undefined) => n == null ? '—' : Math.abs(n) >= 1e12 ? `${signed(n / 1e12, 2)}T` : Math.abs(n) >= 1e9 ? `${signed(n / 1e9, 1)}B` : Math.abs(n) >= 1e6 ? `${signed(n / 1e6, 1)}M` : signed(n, 0);
export const timeWib = (s: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(s));
