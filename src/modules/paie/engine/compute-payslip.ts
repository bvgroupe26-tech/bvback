import Decimal from 'decimal.js';
import { applyProgressiveBareme } from './bareme';
import { MissingPayrollParameterError, NetNegatifError, PayrollRuleConfigError } from './errors';
import {
  AGGREGATE_CODES,
  AggregateCode,
  EngineRule,
  OPTIONAL_PARAMETER_DEFAULTS,
  PayslipInput,
  PayslipLineResult,
  PayslipResult,
} from './types';

const ZERO = new Decimal(0);

/** Montant au franc près (FCFA sans centimes), arrondi commercial. */
export function roundFranc(v: Decimal.Value): Decimal {
  return new Decimal(v).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

function round2(v: Decimal.Value): Decimal {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

class ParamReader {
  private readonly manquants = new Set<string>();
  private readonly aConfirmer = new Set<string>();

  constructor(private readonly input: PayslipInput) {}

  private isAConfirmer(code: string): boolean {
    return this.input.parametresAConfirmer?.has(code) ?? false;
  }

  has(code: string): boolean {
    return this.input.parametres.has(code);
  }

  required(code: string): Decimal {
    if (this.isAConfirmer(code)) {
      this.aConfirmer.add(code);
      return ZERO;
    }
    const v = this.input.parametres.get(code);
    if (v === undefined || v === null) {
      this.manquants.add(code);
      return ZERO;
    }
    return new Decimal(v);
  }

  /** Absent → valeur par défaut ; présent mais « À CONFIRMER » → bloquant comme un requis. */
  optional(code: string): Decimal {
    if (this.has(code) || this.isAConfirmer(code)) return this.required(code);
    return new Decimal(OPTIONAL_PARAMETER_DEFAULTS[code] ?? 0);
  }

  missing(code: string): void {
    this.manquants.add(code);
  }

  assertComplete(): void {
    if (this.manquants.size || this.aConfirmer.size) {
      throw new MissingPayrollParameterError([...this.manquants].sort(), [...this.aConfirmer].sort());
    }
  }
}

type Phase = 'brut' | 'cotisation' | 'impot' | 'retenue_net' | 'info';

/** Retenue « sur brut » (absences non payées…) si elle touche l'assiette imposable ou CNSS. */
function isRetenueSurBrut(rule: EngineRule): boolean {
  return rule.type === 'retenue' && (rule.imposable || rule.soumisCnss);
}

function phaseOf(rule: EngineRule): Phase {
  if (rule.type === 'gain' || isRetenueSurBrut(rule)) return 'brut';
  if (rule.type === 'cotisation') return 'cotisation';
  if (rule.type === 'impot') return 'impot';
  if (rule.type === 'retenue') return 'retenue_net';
  return 'info';
}

const PHASE_ORDER: Phase[] = ['brut', 'cotisation', 'impot', 'retenue_net', 'info'];

function isAggregate(code: string): code is AggregateCode {
  return (AGGREGATE_CODES as readonly string[]).includes(code);
}

/**
 * Calcule un bulletin à partir de rubriques paramétrées. Fonction pure (aucun accès base).
 * Conventions : taux en %, plafond ≤ 0 = pas de plafond, montants arrondis au franc par ligne.
 */
export function computePayslip(input: PayslipInput): PayslipResult {
  const params = new ParamReader(input);
  const warnings: string[] = [];
  const rules = [...input.rubriques].sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code));
  const ruleCodes = new Set(rules.map((r) => r.code));

  const fixedMontant = new Map<string, Decimal>();
  const fixedTaux = new Map<string, Decimal>();
  for (const el of input.elementsFixes) {
    if (el.montant != null) {
      fixedMontant.set(el.ruleCode, (fixedMontant.get(el.ruleCode) ?? ZERO).plus(new Decimal(el.montant)));
    }
    if (el.taux != null) fixedTaux.set(el.ruleCode, new Decimal(el.taux));
  }

  const varQuantite = new Map<string, Decimal>();
  const varMontant = new Map<string, Decimal>();
  for (const v of input.variables) {
    if (v.quantite != null) {
      varQuantite.set(v.ruleCode, (varQuantite.get(v.ruleCode) ?? ZERO).plus(new Decimal(v.quantite)));
    }
    if (v.montant != null) {
      varMontant.set(v.ruleCode, (varMontant.get(v.ruleCode) ?? ZERO).plus(new Decimal(v.montant)));
    }
  }

  // Le mode de prorata est appliqué en amont (jours fournis) ; on vérifie seulement qu'il est confirmé.
  params.optional('PRORATA_MODE');
  const joursPeriode = new Decimal(input.joursPeriode);
  const prorata = joursPeriode.gt(0)
    ? Decimal.max(0, Decimal.min(1, new Decimal(input.joursTravailles).div(joursPeriode)))
    : new Decimal(1);
  if (prorata.lt(1)) {
    warnings.push(`Prorata appliqué aux gains fixes : ${input.joursTravailles}/${input.joursPeriode} jours`);
  }

  const computed = new Map<string, Decimal>();
  const fullMonthly = new Map<string, Decimal>();
  const aggregates = new Map<AggregateCode, Decimal>();
  const lignes: PayslipLineResult[] = [];
  const deductibleCotisSal: Decimal[] = [];
  let irpp = ZERO;

  const salaireBaseMensuel = (): Decimal => fullMonthly.get('SAL_BASE') ?? new Decimal(input.employe.salaireBase);

  const baseJours = (): Decimal => {
    const v = params.optional('BASE_JOURS_MOIS');
    if (v.lte(0) && params.has('BASE_JOURS_MOIS')) {
      throw new PayrollRuleConfigError('BASE_JOURS_MOIS', 'doit être strictement positif');
    }
    return v.gt(0) ? v : new Decimal(OPTIONAL_PARAMETER_DEFAULTS.BASE_JOURS_MOIS);
  };

  const resolveAggregate = (code: AggregateCode, rule: EngineRule): Decimal => {
    if (code === 'TAUX_HORAIRE') {
      const heures = params.required('HEURES_MOIS');
      return heures.gt(0) ? salaireBaseMensuel().div(heures) : ZERO;
    }
    if (code === 'TAUX_JOURNALIER') return salaireBaseMensuel().div(baseJours());
    const v = aggregates.get(code);
    if (v === undefined) {
      throw new PayrollRuleConfigError(rule.code, `la base ${code} n'est pas encore calculée à cette étape`);
    }
    return v;
  };

  const resolveBase = (code: string, rule: EngineRule): Decimal => {
    if (isAggregate(code)) return resolveAggregate(code, rule);
    if (computed.has(code)) return computed.get(code)!;
    if (ruleCodes.has(code)) {
      throw new PayrollRuleConfigError(rule.code, `la rubrique de base ${code} est calculée après elle (ordre)`);
    }
    warnings.push(`Rubrique ${rule.code} : base ${code} inconnue, comptée à 0`);
    return ZERO;
  };

  const pushLine = (
    rule: EngineRule,
    sal: Decimal,
    pat: Decimal,
    extra: { base?: Decimal | null; taux?: Decimal | null; quantite?: Decimal | null } = {},
  ) => {
    computed.set(rule.code, sal);
    if (sal.isZero() && pat.isZero()) return;
    lignes.push({
      ruleId: rule.id,
      code: rule.code,
      libelle: rule.libelle,
      type: rule.type,
      ordre: rule.ordre,
      base: extra.base != null ? round2(extra.base) : null,
      taux: extra.taux ?? null,
      quantite: extra.quantite ?? null,
      montantSalarial: sal,
      montantPatronal: pat,
      imposable: rule.imposable,
    });
  };

  const computeFixe = (rule: EngineRule) => {
    let montant: Decimal | null = null;
    if (fixedMontant.has(rule.code)) montant = fixedMontant.get(rule.code)!;
    else if (rule.code === 'SAL_BASE') montant = new Decimal(input.employe.salaireBase);
    else if (rule.tauxSalarialCode) montant = params.required(rule.tauxSalarialCode);
    if (montant === null) {
      computed.set(rule.code, ZERO);
      return;
    }
    fullMonthly.set(rule.code, montant);
    const prorate = phaseOf(rule) === 'brut';
    const sal = roundFranc(prorate ? montant.times(prorata) : montant);
    pushLine(rule, sal, ZERO, { base: montant, quantite: prorate && prorata.lt(1) ? round2(prorata) : null });
  };

  const computeBaseTaux = (rule: EngineRule) => {
    if (!rule.baseCode) throw new PayrollRuleConfigError(rule.code, 'baseCode requis en mode base_x_taux');
    let base = resolveBase(rule.baseCode, rule);
    if (rule.plafondCode) {
      const plafond = params.required(rule.plafondCode);
      if (plafond.gt(0)) base = Decimal.min(base, plafond);
    }
    const tauxSal = fixedTaux.get(rule.code) ?? (rule.tauxSalarialCode ? params.required(rule.tauxSalarialCode) : null);
    const tauxPat = rule.tauxPatronalCode ? params.required(rule.tauxPatronalCode) : null;
    if (tauxSal === null && tauxPat === null) {
      warnings.push(`Rubrique ${rule.code} : aucun taux défini, ignorée`);
      computed.set(rule.code, ZERO);
      return;
    }
    const sal = tauxSal ? roundFranc(base.times(tauxSal).div(100)) : ZERO;
    const pat = tauxPat ? roundFranc(base.times(tauxPat).div(100)) : ZERO;
    if (rule.type === 'cotisation' && !rule.imposable) deductibleCotisSal.push(sal);
    pushLine(rule, sal, pat, { base, taux: tauxSal ?? tauxPat });
  };

  const computeVariable = (rule: EngineRule) => {
    const quantite = varQuantite.get(rule.code) ?? ZERO;
    const montantDirect = varMontant.get(rule.code) ?? ZERO;
    if (quantite.isZero() && montantDirect.isZero()) {
      computed.set(rule.code, ZERO);
      return;
    }
    let unitaire: Decimal | null = null;
    if (!quantite.isZero()) {
      if (!rule.baseCode) {
        warnings.push(`Rubrique ${rule.code} : quantité sans base, comptée comme montant`);
        unitaire = new Decimal(1);
      } else if (isAggregate(rule.baseCode)) {
        unitaire = resolveAggregate(rule.baseCode, rule);
      } else {
        const mensuel = fullMonthly.get(rule.baseCode) ?? (rule.baseCode === 'SAL_BASE' ? salaireBaseMensuel() : null);
        if (mensuel === null) {
          warnings.push(`Rubrique ${rule.code} : base ${rule.baseCode} absente, comptée à 0`);
          unitaire = ZERO;
        } else {
          unitaire = mensuel.div(baseJours());
        }
      }
      if (rule.tauxSalarialCode) {
        unitaire = unitaire.times(new Decimal(1).plus(params.required(rule.tauxSalarialCode).div(100)));
      }
    }
    const sal = roundFranc((unitaire ? quantite.times(unitaire) : ZERO).plus(montantDirect));
    pushLine(rule, sal, ZERO, { base: unitaire, quantite: quantite.isZero() ? null : quantite });
  };

  const computeParts = (): Decimal => {
    const situation = input.employe.situationFamiliale;
    const enfants = Math.max(0, input.employe.nbEnfants ?? 0);
    const qfActif = ['QF_PARTS_CELIBATAIRE', 'QF_PARTS_MARIE', 'QF_PART_PAR_ENFANT', 'QF_PARTS_MAX'].some((c) =>
      params.has(c),
    );
    if (!qfActif) {
      warnings.push('Quotient familial non paramétré : 1 part appliquée');
      return new Decimal(1);
    }
    let parts = params.required(situation === 'marie' ? 'QF_PARTS_MARIE' : 'QF_PARTS_CELIBATAIRE');
    if (enfants > 0) parts = parts.plus(params.required('QF_PART_PAR_ENFANT').times(enfants));
    if (params.has('QF_PARTS_MAX')) {
      const max = params.required('QF_PARTS_MAX');
      if (max.gt(0)) parts = Decimal.min(parts, max);
    }
    return parts.gt(0) ? parts : new Decimal(1);
  };

  const computeBareme = (rule: EngineRule) => {
    const base = resolveBase(rule.baseCode ?? 'NET_IMPOSABLE', rule);
    const baremeCode = rule.baremeCode ?? rule.code;
    const tranches = input.baremes.get(baremeCode) ?? [];
    if (tranches.length === 0) params.missing(`BAREME:${baremeCode}`);

    const facteur = params.optional('IRPP_ANNUALISER').isZero() ? new Decimal(1) : new Decimal(12);
    const abattement = params.required('ABATTEMENT_FRAIS_PRO');
    const parts = computeParts();

    const assiette = Decimal.max(0, base.times(facteur).times(new Decimal(1).minus(abattement.div(100))));
    const impotAnnuel = applyProgressiveBareme(assiette.div(parts), tranches).times(parts);
    const sal = roundFranc(impotAnnuel.div(facteur));
    irpp = irpp.plus(sal);
    pushLine(rule, sal, ZERO, { base, quantite: parts });
  };

  const computeRule = (rule: EngineRule) => {
    switch (rule.mode) {
      case 'fixe':
        return computeFixe(rule);
      case 'base_x_taux':
        return computeBaseTaux(rule);
      case 'variable':
        return computeVariable(rule);
      case 'bareme':
        return computeBareme(rule);
      default:
        throw new PayrollRuleConfigError(rule.code, `mode inconnu ${String(rule.mode)}`);
    }
  };

  const lineSum = (pred: (l: PayslipLineResult, r: EngineRule) => boolean, field: 'montantSalarial' | 'montantPatronal') => {
    let total = ZERO;
    for (const l of lignes) {
      const r = rules.find((x) => x.code === l.code)!;
      if (pred(l, r)) total = total.plus(l[field]);
    }
    return total;
  };

  for (const phase of PHASE_ORDER) {
    for (const rule of rules.filter((r) => phaseOf(r) === phase)) computeRule(rule);

    if (phase === 'brut') {
      const signed = (pred: (r: EngineRule) => boolean) =>
        lineSum((_, r) => r.type === 'gain' && pred(r), 'montantSalarial').minus(
          lineSum((_, r) => isRetenueSurBrut(r) && pred(r), 'montantSalarial'),
        );
      aggregates.set('BRUT', signed(() => true));
      aggregates.set('BRUT_IMPOSABLE', signed((r) => r.imposable));
      aggregates.set('BRUT_CNSS', signed((r) => r.soumisCnss));
    }
    if (phase === 'cotisation') {
      const deductible = deductibleCotisSal.reduce((a, b) => a.plus(b), ZERO);
      aggregates.set('NET_IMPOSABLE', Decimal.max(0, aggregates.get('BRUT_IMPOSABLE')!.minus(deductible)));
    }
  }

  params.assertComplete();

  const brut = aggregates.get('BRUT')!;
  const totalCotisSal = lineSum((_, r) => r.type === 'cotisation', 'montantSalarial');
  const totalCotisPat = lineSum((_, r) => r.type === 'cotisation' || r.type === 'impot', 'montantPatronal');
  const impotsSal = lineSum((_, r) => r.type === 'impot', 'montantSalarial');
  const retenuesNet = lineSum((_, r) => r.type === 'retenue' && !isRetenueSurBrut(r), 'montantSalarial');
  const net = brut.minus(totalCotisSal).minus(impotsSal).minus(retenuesNet);
  if (net.lt(0)) throw new NetNegatifError(net.toNumber());

  const totaux = {
    brut,
    brutImposable: aggregates.get('BRUT_IMPOSABLE')!,
    brutCnss: aggregates.get('BRUT_CNSS')!,
    netImposable: aggregates.get('NET_IMPOSABLE')!,
    totalCotisSal,
    totalCotisPat,
    netAPayer: net,
  };

  const ant = input.cumulsAnterieurs;
  const cumul = (v: Decimal, a?: Decimal.Value) => v.plus(new Decimal(a ?? 0));
  const cumuls = {
    brut: cumul(totaux.brut, ant?.brut),
    brutImposable: cumul(totaux.brutImposable, ant?.brutImposable),
    netImposable: cumul(totaux.netImposable, ant?.netImposable),
    irpp: cumul(irpp, ant?.irpp),
    net: cumul(totaux.netAPayer, ant?.net),
  };

  lignes.sort((a, b) => a.ordre - b.ordre);
  return { lignes, totaux, cumuls, warnings };
}
