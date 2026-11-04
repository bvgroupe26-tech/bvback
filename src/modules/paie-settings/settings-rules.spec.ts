import {
  findInForce,
  parameterIssue,
  planDatedInsert,
  requiredParameters,
  SettingsRuleError,
  validateBrackets,
} from './settings-rules';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('planDatedInsert (historisation des paramètres)', () => {
  it('première valeur : ouverte, rien à clore', () => {
    expect(planDatedInsert([], d('2026-01-01'))).toEqual({ dateFin: null, closePrevious: null });
  });

  it('nouvelle valeur après une valeur ouverte : clôt la précédente à la date d’effet', () => {
    const plan = planDatedInsert([{ id: 1, dateDebut: d('2026-01-01'), dateFin: null }], d('2026-07-01'));
    expect(plan).toEqual({ dateFin: null, closePrevious: { id: 1, dateFin: d('2026-07-01') } });
  });

  it('insertion entre deux valeurs : bornée par la suivante, la précédente est raccourcie', () => {
    const rows = [
      { id: 1, dateDebut: d('2026-01-01'), dateFin: d('2027-01-01') },
      { id: 2, dateDebut: d('2027-01-01'), dateFin: null },
    ];
    expect(planDatedInsert(rows, d('2026-07-01'))).toEqual({
      dateFin: d('2027-01-01'),
      closePrevious: { id: 1, dateFin: d('2026-07-01') },
    });
  });

  it('valeur rétroactive avant toutes les autres : bornée par la première', () => {
    const plan = planDatedInsert([{ id: 1, dateDebut: d('2026-01-01'), dateFin: null }], d('2025-01-01'));
    expect(plan).toEqual({ dateFin: d('2026-01-01'), closePrevious: null });
  });

  it('ne rallonge pas une valeur déjà close avant la nouvelle date', () => {
    const plan = planDatedInsert([{ id: 1, dateDebut: d('2025-01-01'), dateFin: d('2025-06-01') }], d('2026-01-01'));
    expect(plan.closePrevious).toBeNull();
  });

  it('refuse deux valeurs le même jour', () => {
    expect(() =>
      planDatedInsert([{ id: 1, dateDebut: d('2026-01-01'), dateFin: null }], d('2026-01-01')),
    ).toThrow(SettingsRuleError);
  });

  it('findInForce : dateFin exclusive', () => {
    const rows = [
      { id: 1, dateDebut: d('2026-01-01'), dateFin: d('2026-07-01') },
      { id: 2, dateDebut: d('2026-07-01'), dateFin: null },
    ];
    expect(findInForce(rows, d('2026-06-30'))?.id).toBe(1);
    expect(findInForce(rows, d('2026-07-01'))?.id).toBe(2);
    expect(findInForce(rows, d('2025-12-31'))).toBeNull();
  });
});

describe('validateBrackets (barèmes)', () => {
  it('accepte un barème contigu commençant à 0 et terminé par une tranche ouverte', () => {
    expect(
      validateBrackets([
        { borneMin: 0, borneMax: 464000, taux: 1 },
        { borneMin: 464000, borneMax: 1000000, taux: 10 },
        { borneMin: 1000000, borneMax: null, taux: 40 },
      ]),
    ).toEqual([]);
  });

  it('accepte des tranches non triées', () => {
    expect(
      validateBrackets([
        { borneMin: 100, borneMax: null, taux: 20 },
        { borneMin: 0, borneMax: 100, taux: 0 },
      ]),
    ).toEqual([]);
  });

  it('détecte un trou', () => {
    const errors = validateBrackets([
      { borneMin: 0, borneMax: 100, taux: 0 },
      { borneMin: 150, borneMax: null, taux: 10 },
    ]);
    expect(errors.join(' ')).toMatch(/trou/);
  });

  it('détecte un chevauchement', () => {
    const errors = validateBrackets([
      { borneMin: 0, borneMax: 100, taux: 0 },
      { borneMin: 80, borneMax: null, taux: 10 },
    ]);
    expect(errors.join(' ')).toMatch(/chevauche/);
  });

  it('exige une première borne à 0, une dernière tranche ouverte et des bornes croissantes', () => {
    expect(validateBrackets([{ borneMin: 10, borneMax: null, taux: 5 }]).join(' ')).toMatch(/commencer à 0/);
    expect(validateBrackets([{ borneMin: 0, borneMax: 100, taux: 5 }]).join(' ')).toMatch(/ouverte/);
    expect(
      validateBrackets([
        { borneMin: 0, borneMax: 0, taux: 5 },
        { borneMin: 0, borneMax: null, taux: 5 },
      ]).join(' '),
    ).toMatch(/supérieure/);
  });

  it('refuse une tranche ouverte au milieu, un taux hors bornes et un barème vide', () => {
    expect(
      validateBrackets([
        { borneMin: 0, borneMax: null, taux: 5 },
        { borneMin: 100, borneMax: null, taux: 5 },
      ]).join(' '),
    ).toMatch(/seule la dernière/);
    expect(validateBrackets([{ borneMin: 0, borneMax: null, taux: 120 }]).join(' ')).toMatch(/entre 0 et 100/);
    expect(validateBrackets([])).toHaveLength(1);
  });
});

describe('état de préparation', () => {
  it('recense les paramètres utilisés, hors agrégats et codes de rubrique', () => {
    const needed = requiredParameters([
      { code: 'SAL_BASE', baseCode: null, tauxSalarialCode: null, tauxPatronalCode: null, plafondCode: null, baremeCode: null },
      {
        code: 'CNSS_PENSION',
        baseCode: 'BRUT_CNSS',
        tauxSalarialCode: 'TX_SAL',
        tauxPatronalCode: 'TX_PAT',
        plafondCode: 'PLAF',
        baremeCode: null,
      },
      { code: 'HS_1', baseCode: 'TAUX_HORAIRE', tauxSalarialCode: 'MAJ_HS_1', tauxPatronalCode: null, plafondCode: null, baremeCode: null },
      { code: 'PRIME', baseCode: 'SAL_BASE', tauxSalarialCode: 'TX_PRIME', tauxPatronalCode: null, plafondCode: null, baremeCode: null },
    ]);
    expect([...needed.keys()].sort()).toEqual(['HEURES_MOIS', 'MAJ_HS_1', 'PLAF', 'TX_PAT', 'TX_PRIME', 'TX_SAL']);
    expect(needed.get('TX_SAL')).toEqual(['CNSS_PENSION']);
  });

  it('qualifie un paramètre absent ou à confirmer ; 0 est une valeur valide', () => {
    expect(parameterIssue(null)).toBe('absent');
    expect(parameterIssue({ valeur: 0, description: 'Plafond' })).toBeNull();
    expect(parameterIssue({ valeur: 0, description: 'Plafond — À CONFIRMER' })).toBe('a_confirmer');
    expect(parameterIssue({ valeur: 4, description: 'Taux — À CONFIRMER par le comptable' })).toBe('a_confirmer');
    expect(parameterIssue({ valeur: 4, description: 'Taux salarial' })).toBeNull();
  });
});
