/**
 * TOUS LES TAUX, PLAFONDS ET BARÈMES DE CE FICHIER SONT FICTIFS (valeurs de test).
 * Ils ne représentent PAS la législation congolaise.
 */
import Decimal from 'decimal.js';
import { applyProgressiveBareme } from './bareme';
import { computePayslip } from './compute-payslip';
import { MissingPayrollParameterError, NetNegatifError, PayrollRuleConfigError } from './errors';
import { EngineRule, EngineTaxBracket, PayslipInput } from './types';

const FICTIF_PARAMS: Record<string, number> = {
  TX_FICTIF_SAL: 4,
  TX_FICTIF_PAT: 8,
  PLAF_FICTIF: 500_000,
  TX_FICTIF_TAXE_PAT: 2,
  ABATTEMENT_FRAIS_PRO: 20,
  HEURES_MOIS: 200,
  MAJ_FICTIVE_HS1: 10,
  MAJ_FICTIVE_HS2: 25,
  MT_FICTIF_TAXE_FIXE: 1_000,
};

const FICTIF_BAREME: EngineTaxBracket[] = [
  { borneMin: 0, borneMax: 1_000_000, taux: 0 },
  { borneMin: 1_000_000, borneMax: 3_000_000, taux: 10 },
  { borneMin: 3_000_000, borneMax: null, taux: 20 },
];

const R = (r: Partial<EngineRule> & Pick<EngineRule, 'code' | 'type' | 'mode'>): EngineRule => ({
  libelle: r.code,
  ordre: 0,
  imposable: false,
  soumisCnss: false,
  ...r,
});

const RULES: EngineRule[] = [
  R({ code: 'SAL_BASE', type: 'gain', mode: 'fixe', ordre: 10, imposable: true, soumisCnss: true }),
  R({ code: 'IND_TRANSPORT', type: 'gain', mode: 'fixe', ordre: 50 }),
  R({ code: 'HS_1', type: 'gain', mode: 'variable', ordre: 40, imposable: true, soumisCnss: true, baseCode: 'TAUX_HORAIRE', tauxSalarialCode: 'MAJ_FICTIVE_HS1' }),
  R({ code: 'ABS_NON_PAYEE', type: 'retenue', mode: 'variable', ordre: 60, imposable: true, soumisCnss: true, baseCode: 'SAL_BASE' }),
  R({ code: 'COTIS_FICTIVE', type: 'cotisation', mode: 'base_x_taux', ordre: 100, baseCode: 'BRUT_CNSS', tauxSalarialCode: 'TX_FICTIF_SAL', tauxPatronalCode: 'TX_FICTIF_PAT', plafondCode: 'PLAF_FICTIF' }),
  R({ code: 'TAXE_PAT_FICTIVE', type: 'impot', mode: 'base_x_taux', ordre: 140, baseCode: 'BRUT', tauxPatronalCode: 'TX_FICTIF_TAXE_PAT' }),
  R({ code: 'IRPP', type: 'impot', mode: 'bareme', ordre: 200, baseCode: 'NET_IMPOSABLE', baremeCode: 'IRPP' }),
  R({ code: 'AVANCE', type: 'retenue', mode: 'variable', ordre: 300 }),
];

function input(over: Partial<PayslipInput> = {}): PayslipInput {
  return {
    periode: { annee: 2026, mois: 5, dateDebut: new Date('2026-05-01'), dateFin: new Date('2026-05-31') },
    employe: { id: 1, salaireBase: 300_000, situationFamiliale: 'celibataire', nbEnfants: 0 },
    rubriques: RULES,
    elementsFixes: [{ ruleCode: 'IND_TRANSPORT', montant: 20_000 }],
    variables: [],
    parametres: new Map(Object.entries(FICTIF_PARAMS)),
    baremes: new Map([['IRPP', FICTIF_BAREME]]),
    joursPeriode: 30,
    joursTravailles: 30,
    ...over,
  };
}

const line = (res: ReturnType<typeof computePayslip>, code: string) => res.lignes.find((l) => l.code === code);
const n = (d: Decimal | undefined | null) => (d == null ? null : d.toNumber());

describe('applyProgressiveBareme (barème fictif)', () => {
  it('ne taxe que la part de chaque tranche', () => {
    expect(n(applyProgressiveBareme(500_000, FICTIF_BAREME))).toBe(0);
    expect(n(applyProgressiveBareme(2_000_000, FICTIF_BAREME))).toBe(100_000);
    expect(n(applyProgressiveBareme(4_000_000, FICTIF_BAREME))).toBe(200_000 + 200_000);
  });

  it('renvoie 0 pour une assiette négative ou nulle', () => {
    expect(n(applyProgressiveBareme(-10, FICTIF_BAREME))).toBe(0);
  });
});

describe('computePayslip (paramètres fictifs)', () => {
  it('calcule un bulletin complet cohérent', () => {
    const res = computePayslip(input());
    expect(n(res.totaux.brut)).toBe(320_000);
    expect(n(res.totaux.brutImposable)).toBe(300_000);
    expect(n(res.totaux.brutCnss)).toBe(300_000);
    expect(n(line(res, 'COTIS_FICTIVE')?.montantSalarial)).toBe(12_000);
    expect(n(line(res, 'COTIS_FICTIVE')?.montantPatronal)).toBe(24_000);
    expect(n(res.totaux.netImposable)).toBe(288_000);
    // 288 000 × 12 × 0,8 = 2 764 800 → 176 480 / an → 14 707 / mois
    expect(n(line(res, 'IRPP')?.montantSalarial)).toBe(14_707);
    expect(n(line(res, 'TAXE_PAT_FICTIVE')?.montantPatronal)).toBe(6_400);
    expect(n(res.totaux.totalCotisPat)).toBe(30_400);
    expect(n(res.totaux.netAPayer)).toBe(320_000 - 12_000 - 14_707);
  });

  it('le net est égal au brut moins les déductions salariales', () => {
    const res = computePayslip(input({ variables: [{ ruleCode: 'AVANCE', montant: 50_000 }] }));
    const deductions = res.lignes
      .filter((l) => l.type !== 'gain')
      .reduce((s, l) => s.plus(l.montantSalarial), new Decimal(0));
    expect(n(res.totaux.netAPayer)).toBe(res.totaux.brut.minus(deductions).toNumber());
  });

  it('applique le prorata aux gains fixes uniquement', () => {
    const res = computePayslip(
      input({ joursTravailles: 15, variables: [{ ruleCode: 'HS_1', quantite: 10 }] }),
    );
    expect(n(line(res, 'SAL_BASE')?.montantSalarial)).toBe(150_000);
    expect(n(line(res, 'IND_TRANSPORT')?.montantSalarial)).toBe(10_000);
    // HS sur le salaire mensuel complet : 300 000 / 200 × 1,10 × 10
    expect(n(line(res, 'HS_1')?.montantSalarial)).toBe(16_500);
    expect(res.warnings.some((w) => w.includes('Prorata'))).toBe(true);
  });

  it('plafonne la base de cotisation', () => {
    const res = computePayslip(input({ employe: { id: 1, salaireBase: 800_000 } }));
    const cotis = line(res, 'COTIS_FICTIVE')!;
    expect(n(cotis.base)).toBe(500_000);
    expect(n(cotis.montantSalarial)).toBe(20_000);
  });

  it('un plafond à 0 signifie « sans plafond »', () => {
    const p = new Map(Object.entries({ ...FICTIF_PARAMS, PLAF_FICTIF: 0 }));
    const res = computePayslip(input({ employe: { id: 1, salaireBase: 800_000 }, parametres: p }));
    expect(n(line(res, 'COTIS_FICTIVE')?.base)).toBe(800_000);
  });

  it('exclut la rubrique non imposable du brut imposable mais pas du brut', () => {
    const res = computePayslip(input());
    expect(n(line(res, 'IND_TRANSPORT')?.montantSalarial)).toBe(20_000);
    expect(res.totaux.brut.minus(res.totaux.brutImposable).toNumber()).toBe(20_000);
  });

  it('déduit les absences non payées du brut (taux journalier sur BASE_JOURS_MOIS)', () => {
    const res = computePayslip(input({ variables: [{ ruleCode: 'ABS_NON_PAYEE', quantite: 3 }] }));
    expect(n(line(res, 'ABS_NON_PAYEE')?.montantSalarial)).toBe(30_000);
    expect(n(res.totaux.brut)).toBe(290_000);
    expect(n(res.totaux.brutImposable)).toBe(270_000);
  });

  it('applique le quotient familial quand il est paramétré', () => {
    const p = new Map(
      Object.entries({ ...FICTIF_PARAMS, QF_PARTS_CELIBATAIRE: 1, QF_PARTS_MARIE: 2, QF_PART_PAR_ENFANT: 0.5 }),
    );
    const celib = computePayslip(input({ parametres: p, employe: { id: 1, salaireBase: 1_000_000 } }));
    const marie = computePayslip(
      input({ parametres: p, employe: { id: 1, salaireBase: 1_000_000, situationFamiliale: 'marie', nbEnfants: 2 } }),
    );
    // NI 980 000 × 12 × 0,8 = 9 408 000 ; ÷ 3 parts = 3 136 000 → 227 200 × 3 = 681 600 / an
    expect(n(line(marie, 'IRPP')?.quantite)).toBe(3);
    expect(n(line(marie, 'IRPP')?.montantSalarial)).toBe(56_800);
    expect(n(marie.totaux.netAPayer)!).toBeGreaterThan(n(celib.totaux.netAPayer)!);
    expect(celib.warnings.some((w) => w.includes('Quotient familial'))).toBe(false);
  });

  it('IRPP mensuel non annualisé quand IRPP_ANNUALISER = 0', () => {
    const p = new Map(Object.entries({ ...FICTIF_PARAMS, IRPP_ANNUALISER: 0, ABATTEMENT_FRAIS_PRO: 0 }));
    const res = computePayslip(input({ parametres: p, employe: { id: 1, salaireBase: 2_000_000 } }));
    // NI = 2 000 000 − 20 000 (cotisation plafonnée) = 1 980 000 → 98 000
    expect(n(line(res, 'IRPP')?.montantSalarial)).toBe(98_000);
  });

  it('cumule avec les bulletins antérieurs', () => {
    const res = computePayslip(
      input({ cumulsAnterieurs: { brut: 1_000_000, brutImposable: 900_000, netImposable: 800_000, irpp: 50_000, net: 700_000 } }),
    );
    expect(n(res.cumuls.brut)).toBe(1_320_000);
    expect(n(res.cumuls.irpp)).toBe(50_000 + 14_707);
    expect(n(res.cumuls.net)).toBe(700_000 + n(res.totaux.netAPayer)!);
  });

  it('arrondit chaque ligne au franc (demi supérieur)', () => {
    const p = new Map(Object.entries({ ...FICTIF_PARAMS, TX_FICTIF_SAL: 3.333 }));
    const res = computePayslip(input({ employe: { id: 1, salaireBase: 100_015 }, parametres: p }));
    // 100 015 × 3,333 % = 3 333,49995 → 3 333
    expect(n(line(res, 'COTIS_FICTIVE')?.montantSalarial)).toBe(3_333);
    expect(res.lignes.every((l) => l.montantSalarial.isInteger() && l.montantPatronal.isInteger())).toBe(true);
  });

  it('lève NetNegatifError si les retenues dépassent le net', () => {
    expect(() => computePayslip(input({ variables: [{ ruleCode: 'AVANCE', montant: 1_000_000 }] }))).toThrow(
      NetNegatifError,
    );
  });

  it('lève MissingPayrollParameterError avec la liste complète des paramètres absents', () => {
    const p = new Map(Object.entries(FICTIF_PARAMS));
    p.delete('TX_FICTIF_SAL');
    p.delete('ABATTEMENT_FRAIS_PRO');
    try {
      computePayslip(input({ parametres: p }));
      fail('erreur attendue');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingPayrollParameterError);
      expect((e as MissingPayrollParameterError).codes).toEqual(['ABATTEMENT_FRAIS_PRO', 'TX_FICTIF_SAL']);
    }
  });

  it('refuse un paramètre marqué « À CONFIRMER », même à 0', () => {
    try {
      computePayslip(input({ parametresAConfirmer: new Set(['TX_FICTIF_PAT']) }));
      fail('erreur attendue');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingPayrollParameterError);
      expect((e as MissingPayrollParameterError).aConfirmer).toEqual(['TX_FICTIF_PAT']);
    }
  });

  it('accepte un paramètre confirmé à 0', () => {
    const p = new Map(Object.entries({ ...FICTIF_PARAMS, TX_FICTIF_TAXE_PAT: 0 }));
    const res = computePayslip(input({ parametres: p }));
    expect(line(res, 'TAXE_PAT_FICTIVE')).toBeUndefined();
  });

  it("n'exige pas les paramètres de rubriques non utilisées (HS sans heures)", () => {
    const p = new Map(Object.entries(FICTIF_PARAMS));
    p.delete('HEURES_MOIS');
    p.delete('MAJ_FICTIVE_HS1');
    expect(() => computePayslip(input({ parametres: p }))).not.toThrow();
  });

  it('signale un barème manquant', () => {
    expect(() => computePayslip(input({ baremes: new Map() }))).toThrow(/BAREME:IRPP/);
  });

  it('refuse une base calculée après la rubrique qui l’utilise', () => {
    const rules = [
      ...RULES,
      R({ code: 'PRIME_SUR_BRUT', type: 'gain', mode: 'base_x_taux', ordre: 70, baseCode: 'BRUT', tauxSalarialCode: 'TX_FICTIF_SAL' }),
    ];
    expect(() => computePayslip(input({ rubriques: rules }))).toThrow(PayrollRuleConfigError);
  });

  it('applique un taux propre à l’employé (élément fixe) en priorité sur le paramètre', () => {
    const rules = [
      ...RULES,
      R({ code: 'PRIME_ANCIENNETE', type: 'gain', mode: 'base_x_taux', ordre: 30, imposable: true, soumisCnss: true, baseCode: 'SAL_BASE', tauxSalarialCode: 'TX_FICTIF_SAL' }),
    ];
    const res = computePayslip(
      input({ rubriques: rules, elementsFixes: [{ ruleCode: 'PRIME_ANCIENNETE', taux: 10 }] }),
    );
    expect(n(line(res, 'PRIME_ANCIENNETE')?.montantSalarial)).toBe(30_000);
  });

  it('une rubrique fixe non-gain (taxe fixe) n’est pas proratisée', () => {
    const rules = [
      ...RULES,
      R({ code: 'TAXE_FIXE', type: 'impot', mode: 'fixe', ordre: 210, tauxSalarialCode: 'MT_FICTIF_TAXE_FIXE' }),
    ];
    const res = computePayslip(input({ rubriques: rules, joursTravailles: 10 }));
    expect(n(line(res, 'TAXE_FIXE')?.montantSalarial)).toBe(1_000);
  });
});
