import { Pipe, PipeTransform } from '@angular/core';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

/**
 * Pure: pass the active language as the argument so a language switch
 * re-renders (`value | relativeTime: lang()`).
 */
@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(
    value: string | number | Date | undefined,
    lang: string | undefined,
    now: number = Date.now(),
  ): string {
    if (value === undefined || value === '') return '';
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return '';
    const diff = Math.round((time - now) / 1000);
    const abs = Math.abs(diff);
    const fmt = new Intl.RelativeTimeFormat(lang ?? 'es', { numeric: 'auto' });
    for (const [unit, secs] of UNITS) {
      if (abs >= secs || unit === 'second') {
        return fmt.format(Math.trunc(diff / secs), unit);
      }
    }
    return '';
  }
}
