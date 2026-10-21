import i18n from '@/i18n';

const localeMap: Record<string, string> = { en: 'en-US', fr: 'fr-FR', rw: 'rw-RW' };

const currentLocale = () => localeMap[i18n.language?.slice(0, 2) ?? 'en'] || 'en-US';

export const formatDate = (d: Date | string | number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
  new Intl.DateTimeFormat(currentLocale(), opts).format(new Date(d));

export const formatDateTime = (d: Date | string | number) =>
  new Intl.DateTimeFormat(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));

export const formatNumber = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat(currentLocale(), opts).format(n);

export const formatPercent = (n: number, digits = 0) =>
  new Intl.NumberFormat(currentLocale(), { style: 'percent', maximumFractionDigits: digits }).format(n);
