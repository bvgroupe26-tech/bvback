import { Transform } from 'class-transformer';

export const MOIS_REGEX = /^(0[1-9]|1[0-2])$/;

/** "3" / 3 / " 03 " → "03" ; les autres valeurs passent telles quelles pour être rejetées par @Matches. */
export function NormalizeMois(): PropertyDecorator {
  return Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return value;
    const raw = String(value).trim();
    return /^\d{1,2}$/.test(raw) ? raw.padStart(2, '0') : raw;
  });
}
