import { createHash } from 'crypto';

type Num = number | string | { toString(): string } | null | undefined;

export interface HashablePayslip {
  numero: string | null;
  employeId: number;
  annee: number;
  mois: string;
  type: string;
  brut: Num;
  brutImposable: Num;
  netImposable: Num;
  totalCotisSal: Num;
  totalCotisPat: Num;
  netAPayer: Num;
  lignes: Array<{
    code: string;
    ordre: number;
    base: Num;
    taux: Num;
    quantite: Num;
    montantSalarial: Num;
    montantPatronal: Num;
  }>;
}

function canon(v: Num): string | null {
  if (v === null || v === undefined) return null;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n.toFixed(4) : null;
}

/**
 * Empreinte SHA-256 du contenu d'un bulletin. À calculer à la validation (vague 3) et
 * à stocker dans `Paie.hashSha256` : la page de vérification compare cette valeur.
 */
export function computePayslipHash(p: HashablePayslip): string {
  const lignes = [...p.lignes]
    .sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code))
    .map((l) => [
      l.code,
      canon(l.base),
      canon(l.taux),
      canon(l.quantite),
      canon(l.montantSalarial),
      canon(l.montantPatronal),
    ]);
  const payload = JSON.stringify({
    numero: p.numero,
    employeId: p.employeId,
    annee: p.annee,
    mois: String(parseInt(p.mois, 10)).padStart(2, '0'),
    type: p.type,
    totaux: [
      canon(p.brut),
      canon(p.brutImposable),
      canon(p.netImposable),
      canon(p.totalCotisSal),
      canon(p.totalCotisPat),
      canon(p.netAPayer),
    ],
    lignes,
  });
  return createHash('sha256').update(payload).digest('hex');
}
