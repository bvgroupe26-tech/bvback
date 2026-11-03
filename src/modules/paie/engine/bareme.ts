import Decimal from 'decimal.js';
import { EngineTaxBracket } from './types';

/** Impôt progressif : chaque tranche [borneMin, borneMax[ est taxée à son taux (en %). */
export function applyProgressiveBareme(assiette: Decimal.Value, tranches: EngineTaxBracket[]): Decimal {
  const x = new Decimal(assiette);
  if (x.lte(0)) return new Decimal(0);

  const sorted = [...tranches].sort((a, b) => new Decimal(a.borneMin).cmp(new Decimal(b.borneMin)));
  let impot = new Decimal(0);
  for (const t of sorted) {
    const min = new Decimal(t.borneMin);
    if (x.lte(min)) break;
    const max = t.borneMax == null ? null : new Decimal(t.borneMax);
    const haut = max == null ? x : Decimal.min(x, max);
    if (haut.gt(min)) {
      impot = impot.plus(haut.minus(min).times(new Decimal(t.taux)).div(100));
    }
  }
  return impot;
}
