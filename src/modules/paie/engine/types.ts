import Decimal from 'decimal.js';

export type EngineRuleType = 'gain' | 'retenue' | 'cotisation' | 'impot' | 'info';
export type EngineRuleMode = 'fixe' | 'base_x_taux' | 'bareme' | 'variable';

/** Agrégats calculés par le moteur, utilisables comme `baseCode`. */
export const AGGREGATE_CODES = [
  'BRUT',
  'BRUT_IMPOSABLE',
  'BRUT_CNSS',
  'NET_IMPOSABLE',
  'TAUX_HORAIRE',
  'TAUX_JOURNALIER',
] as const;
export type AggregateCode = (typeof AGGREGATE_CODES)[number];

/**
 * Paramètres optionnels : absents = valeur par défaut, jamais d'erreur.
 * Tous les taux (paramètres, éléments fixes, barèmes) sont exprimés en POURCENTAGE.
 */
export const OPTIONAL_PARAMETER_DEFAULTS: Record<string, number> = {
  BASE_JOURS_MOIS: 30,
  PRORATA_MODE: 0,
  IRPP_ANNUALISER: 1,
};

export interface EngineRule {
  id?: number;
  code: string;
  libelle: string;
  type: EngineRuleType;
  mode: EngineRuleMode;
  ordre: number;
  imposable: boolean;
  soumisCnss: boolean;
  baseCode?: string | null;
  tauxSalarialCode?: string | null;
  tauxPatronalCode?: string | null;
  plafondCode?: string | null;
  baremeCode?: string | null;
}

export interface EngineFixedElement {
  ruleCode: string;
  montant?: Decimal.Value | null;
  taux?: Decimal.Value | null;
}

export interface EngineVariable {
  ruleCode: string;
  quantite?: Decimal.Value | null;
  montant?: Decimal.Value | null;
}

export interface EngineTaxBracket {
  borneMin: Decimal.Value;
  borneMax?: Decimal.Value | null;
  taux: Decimal.Value;
}

export interface EngineCumuls {
  brut: Decimal.Value;
  brutImposable: Decimal.Value;
  netImposable: Decimal.Value;
  irpp: Decimal.Value;
  net: Decimal.Value;
}

export interface PayslipInput {
  periode: { annee: number; mois: number; dateDebut: Date; dateFin: Date };
  employe: {
    id: number;
    salaireBase: Decimal.Value;
    dateEmbauche?: Date | null;
    dateFin?: Date | null;
    situationFamiliale?: string | null;
    nbEnfants?: number | null;
    categorie?: string | null;
    echelon?: string | null;
  };
  rubriques: EngineRule[];
  elementsFixes: EngineFixedElement[];
  variables: EngineVariable[];
  parametres: Map<string, Decimal.Value>;
  /** Codes dont la valeur porte encore la mention « À CONFIRMER » : inutilisables. */
  parametresAConfirmer?: Set<string>;
  baremes: Map<string, EngineTaxBracket[]>;
  cumulsAnterieurs?: EngineCumuls;
  joursPeriode: number;
  joursTravailles: number;
}

export interface PayslipLineResult {
  ruleId?: number;
  code: string;
  libelle: string;
  type: EngineRuleType;
  ordre: number;
  base: Decimal | null;
  taux: Decimal | null;
  quantite: Decimal | null;
  montantSalarial: Decimal;
  montantPatronal: Decimal;
  imposable: boolean;
}

export interface PayslipTotals {
  brut: Decimal;
  brutImposable: Decimal;
  brutCnss: Decimal;
  netImposable: Decimal;
  totalCotisSal: Decimal;
  totalCotisPat: Decimal;
  netAPayer: Decimal;
}

export interface PayslipResult {
  lignes: PayslipLineResult[];
  totaux: PayslipTotals;
  cumuls: { brut: Decimal; brutImposable: Decimal; netImposable: Decimal; irpp: Decimal; net: Decimal };
  warnings: string[];
}
