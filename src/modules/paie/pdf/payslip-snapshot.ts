import { Employe, EmployeurSettings, ModePaiement, SituationFamiliale } from '@prisma/client';

/** Contenu de `Paie.employeSnapshot` : figé à la validation du bulletin (vague 3 doit utiliser buildEmployeSnapshot). */
export interface EmployeSnapshot {
  nom: string;
  prenom: string;
  matricule: string | null;
  poste: string | null;
  departement: string | null;
  categorie: string | null;
  echelon: string | null;
  dateEmbauche: string | null;
  numeroCnss: string | null;
  niu: string | null;
  situationFamiliale: SituationFamiliale | null;
  nombreEnfants: number;
  modePaiement: ModePaiement | null;
  banque: string | null;
  rib: string | null;
  mobileMoney: string | null;
}

/** Contenu de `Paie.employeurSnapshot`. */
export interface EmployeurSnapshot {
  raisonSociale: string | null;
  adresse: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  niu: string | null;
  rccm: string | null;
  numeroCnssEmployeur: string | null;
  logoUrl: string | null;
  conventionCollective: string | null;
}

export function buildEmployeSnapshot(e: Employe): EmployeSnapshot {
  return {
    nom: e.nom,
    prenom: e.prenom,
    matricule: e.matricule,
    poste: e.poste,
    departement: e.departement,
    categorie: e.categorie,
    echelon: e.echelon,
    dateEmbauche: e.dateEmbauche ? e.dateEmbauche.toISOString() : null,
    numeroCnss: e.numeroCnss,
    niu: e.niu,
    situationFamiliale: e.situationFamiliale,
    nombreEnfants: e.nombreEnfants,
    modePaiement: e.modePaiement,
    banque: e.banque,
    rib: e.rib,
    mobileMoney: e.mobileMoney,
  };
}

export function buildEmployeurSnapshot(s: EmployeurSettings | null): EmployeurSnapshot {
  return {
    raisonSociale: s?.raisonSociale ?? null,
    adresse: s?.adresse ?? null,
    ville: s?.ville ?? null,
    telephone: s?.telephone ?? null,
    email: s?.email ?? null,
    niu: s?.niu ?? null,
    rccm: s?.rccm ?? null,
    numeroCnssEmployeur: s?.numeroCnssEmployeur ?? null,
    logoUrl: s?.logoUrl ?? null,
    conventionCollective: s?.conventionCollective ?? null,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Le snapshot (s'il existe) l'emporte sur les valeurs vivantes : un bulletin validé ne change plus. */
export function resolveEmployeSnapshot(snapshot: unknown, live: Employe): EmployeSnapshot {
  const base = buildEmployeSnapshot(live);
  if (!isRecord(snapshot)) return base;
  return { ...base, ...(snapshot as Partial<EmployeSnapshot>) };
}

export function resolveEmployeurSnapshot(
  snapshot: unknown,
  live: EmployeurSettings | null,
): EmployeurSnapshot {
  const base = buildEmployeurSnapshot(live);
  if (!isRecord(snapshot)) return base;
  return { ...base, ...(snapshot as Partial<EmployeurSnapshot>) };
}
