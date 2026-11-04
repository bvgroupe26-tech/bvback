import { ConflictException } from '@nestjs/common';
import { StatutPaie, StatutPeriodePaie, TypeRubrique } from '@prisma/client';
import {
  assertPeriodeAction,
  buildNumero,
  computeCompteurs,
  isRecalculable,
  negateLines,
  nextPeriodeStatut,
} from './payroll-workflow.rules';

describe('payroll-workflow.rules', () => {
  it('enchaîne ouverte → calculee → validee → payee → cloturee', () => {
    expect(() => assertPeriodeAction(StatutPeriodePaie.ouverte, 'calculer')).not.toThrow();
    expect(() => assertPeriodeAction(StatutPeriodePaie.calculee, 'calculer')).not.toThrow();
    expect(() => assertPeriodeAction(StatutPeriodePaie.calculee, 'valider')).not.toThrow();
    expect(() => assertPeriodeAction(StatutPeriodePaie.validee, 'payer')).not.toThrow();
    expect(() => assertPeriodeAction(StatutPeriodePaie.payee, 'cloturer')).not.toThrow();
  });

  it('refuse les sauts d’étape', () => {
    expect(() => assertPeriodeAction(StatutPeriodePaie.ouverte, 'valider')).toThrow(ConflictException);
    expect(() => assertPeriodeAction(StatutPeriodePaie.calculee, 'payer')).toThrow(ConflictException);
    expect(() => assertPeriodeAction(StatutPeriodePaie.validee, 'calculer')).toThrow(ConflictException);
    expect(() => assertPeriodeAction(StatutPeriodePaie.validee, 'variables')).toThrow(ConflictException);
  });

  it('une période clôturée est en lecture seule', () => {
    for (const action of ['calculer', 'valider', 'payer', 'cloturer', 'variables'] as const) {
      expect(() => assertPeriodeAction(StatutPeriodePaie.cloturee, action)).toThrow(/clôturée/);
    }
  });

  it('ne recalcule que les bulletins non validés', () => {
    expect(isRecalculable(StatutPaie.brouillon)).toBe(true);
    expect(isRecalculable(StatutPaie.calcule)).toBe(true);
    expect(isRecalculable(StatutPaie.valide)).toBe(false);
    expect(isRecalculable(StatutPaie.paye)).toBe(false);
  });

  it('numérote BV-AAAA-MM-NNNNNN', () => {
    expect(buildNumero(2026, '5', 123)).toBe('BV-2026-05-000123');
    expect(buildNumero(2026, 11, 1)).toBe('BV-2026-11-000001');
  });

  it('déduit le statut de période des bulletins actifs', () => {
    const { calculee, validee, payee, ouverte } = StatutPeriodePaie;
    expect(nextPeriodeStatut(ouverte, [])).toBe(ouverte);
    expect(nextPeriodeStatut(ouverte, [StatutPaie.calcule])).toBe(calculee);
    expect(nextPeriodeStatut(calculee, [StatutPaie.valide, StatutPaie.calcule])).toBe(calculee);
    expect(nextPeriodeStatut(calculee, [StatutPaie.valide, StatutPaie.annule])).toBe(validee);
    expect(nextPeriodeStatut(validee, [StatutPaie.paye, StatutPaie.paye])).toBe(payee);
  });

  it('compte les bulletins et exclut les annulés des masses', () => {
    const c = computeCompteurs([
      { statut: StatutPaie.calcule, brut: '100000', netAPayer: '80000', totalCotisPat: '20000' },
      { statut: StatutPaie.annule, brut: '50000', netAPayer: '40000', totalCotisPat: '10000' },
    ]);
    expect(c).toMatchObject({ total: 2, calcule: 1, annule: 1, masseBrute: 100000, masseNette: 80000, chargesPatronales: 20000 });
  });

  it('contre-bulletin : montants opposés, taux conservé', () => {
    const [l] = negateLines([
      {
        payRuleId: 1,
        code: 'CNSS',
        libelle: 'CNSS',
        ordre: 100,
        type: TypeRubrique.cotisation,
        base: '200000',
        taux: '4',
        quantite: null,
        montantSalarial: '8000',
        montantPatronal: '16000',
        imposable: false,
      },
    ]);
    expect(l).toMatchObject({ base: -200000, taux: 4, montantSalarial: -8000, montantPatronal: -16000, quantite: null });
  });
});
