// Number / date formatting that matches the website (build.py fmt_num, fmt_pct, fmt_date; tracker.py usd_short).
import type { Lang } from './i18n';

const MONTHS_HR = ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'];
const MONTHS_HR_NOM = ['Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj', 'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtNum(x: number, lang: Lang, dec = 2): string {
  const [int, frac] = Math.abs(x).toFixed(dec).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'hr' ? '.' : ',');
  return (x < 0 ? '−' : '') + grouped + (frac ? (lang === 'hr' ? ',' : '.') + frac : '');
}
export function fmtPct(x: number, lang: Lang): string {
  const sign = x > 0 ? '+' : x < 0 ? '−' : '±';
  return sign + fmtNum(Math.abs(x), lang, 2) + (lang === 'hr' ? ' %' : '%');
}
export function fmtPrice(x: number, lang: Lang): string { return fmtNum(x, lang, x < 1 ? 4 : 2); }
export function usdShort(x: number, lang: Lang): string {
  const steps: [number, string, string][] = [[1e9, ' mlrd.', 'bn'], [1e6, ' mil.', 'm'], [1e3, ' tis.', 'k']];
  for (const [lim, hr, en] of steps) {
    if (Math.abs(x) >= lim) { const v = x / lim; const d = Math.abs(v) < 100 ? 1 : 0; return lang === 'hr' ? `${fmtNum(v, lang, d)}${hr} $` : `$${fmtNum(v, lang, d)}${en}`; }
  }
  return lang === 'hr' ? `${fmtNum(x, lang, 0)} $` : `$${fmtNum(x, lang, 0)}`;
}
/** "2026-11-16" → "16. studenoga 2026." / "16 November 2026" */
export function fmtDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return lang === 'hr' ? `${d}. ${MONTHS_HR[m - 1]} ${y}.` : `${d} ${MONTHS_EN[m - 1]} ${y}`;
}
export function fmtMonth(ym: string, lang: Lang): string {
  const [y, m] = ym.split('-').map(Number);
  return lang === 'hr' ? `${MONTHS_HR_NOM[m - 1]} ${y}.` : `${MONTHS_EN[m - 1]} ${y}`;
}
/** Whole days from today (local) to an ISO date; negative = past. */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}
