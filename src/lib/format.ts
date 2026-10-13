import { dateLocale } from './i18n';

export const formatPrice = (grosze: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(grosze / 100);

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });

export const formatDateTime = (iso: string) => `${formatDay(iso)}, ${formatTime(iso)}`;

/** Ключ для группировки по дням в локальном часовом поясе. */
export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** "2026-10-20 18:00" → Date в локальном времени телефона; null при неверном формате. */
export function parseLocalDateTime(input: string): Date | null {
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  return Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1 ? null : date;
}
