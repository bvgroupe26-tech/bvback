import { StatutEmploye } from '@prisma/client';
import {
  applyPaieProrata,
  buildProratedPaieAmounts,
  checkPaieEligibility,
  computePaiePeriodOverlap,
  getPaiePeriodBounds,
} from './paie-eligibility.util';

describe('paie-eligibility', () => {
  const baseEmploye = {
    statut: StatutEmploye.actif,
    salaireBase: 450_000,
    dateEmbauche: new Date('2025-01-15'),
    dateFinContrat: null,
    deletedAt: null,
  };

  describe('checkPaieEligibility', () => {
    it('accepte un employé actif embauché avant la période', () => {
      const result = checkPaieEligibility(baseEmploye, '05', 2026);

      expect(result.eligible).toBe(true);
      expect(result.joursTravailles).toBe(31);
      expect(result.joursPeriode).toBe(31);
      expect(result.tauxProrata).toBe(1);
    });

    it('refuse un employé suspendu', () => {
      const result = checkPaieEligibility(
        { ...baseEmploye, statut: StatutEmploye.suspendu },
        '05',
        2026,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('statut_suspendu');
    });

    it('refuse un employé inactif sans date de fin', () => {
      const result = checkPaieEligibility(
        { ...baseEmploye, statut: StatutEmploye.inactif },
        '05',
        2026,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('statut_inactif');
    });

    it('accepte un inactif avec fin de contrat dans le mois', () => {
      const result = checkPaieEligibility(
        {
          ...baseEmploye,
          statut: StatutEmploye.inactif,
          dateFinContrat: new Date('2026-05-15'),
        },
        '05',
        2026,
      );

      expect(result.eligible).toBe(true);
      expect(result.joursTravailles).toBe(15);
      expect(result.tauxProrata).toBeCloseTo(15 / 31);
    });

    it('refuse un inactif dont le contrat est terminé avant le mois', () => {
      const result = checkPaieEligibility(
        {
          ...baseEmploye,
          statut: StatutEmploye.inactif,
          dateFinContrat: new Date('2026-04-30'),
        },
        '05',
        2026,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('depart_avant_periode');
    });

    it('refuse un salaire de base nul', () => {
      const result = checkPaieEligibility(
        { ...baseEmploye, salaireBase: 0 },
        '05',
        2026,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('salaire_zero');
    });

    it('refuse si embauché après la fin du mois cible', () => {
      const result = checkPaieEligibility(
        {
          ...baseEmploye,
          dateEmbauche: new Date('2026-06-01'),
        },
        '05',
        2026,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('non_embauche');
    });

    it('accepte une embauche en cours de mois avec prorata', () => {
      const result = checkPaieEligibility(
        {
          ...baseEmploye,
          dateEmbauche: new Date('2026-05-20'),
        },
        '05',
        2026,
      );

      expect(result.eligible).toBe(true);
      expect(result.joursTravailles).toBe(12);
      expect(result.tauxProrata).toBeCloseTo(12 / 31);
    });

    it('refuse un employé archivé', () => {
      const result = checkPaieEligibility(
        { ...baseEmploye, deletedAt: new Date() },
        '05',
        2026,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('statut_inactif');
    });
  });

  describe('buildProratedPaieAmounts', () => {
    it('applique le prorata sur le salaire et les primes', () => {
      const employe = {
        ...baseEmploye,
        dateEmbauche: new Date('2026-05-20'),
        defPrimeTransport: 30_000,
        defPrimeLogement: 0,
        defPrimePerformance: 0,
        defAutresPrimes: 0,
      };

      const amounts = buildProratedPaieAmounts(employe, '05', 2026);
      const taux = 12 / 31;

      expect(amounts.salaireBase).toBe(applyPaieProrata(450_000, taux));
      expect(amounts.primeTransport).toBe(applyPaieProrata(30_000, taux));
      expect(amounts.joursTravailles).toBe(12);
    });

    it('prorata sur départ en milieu de mois', () => {
      const amounts = buildProratedPaieAmounts(
        {
          ...baseEmploye,
          dateFinContrat: new Date('2026-05-10'),
          defPrimeTransport: 0,
          defPrimeLogement: 0,
          defPrimePerformance: 0,
          defAutresPrimes: 0,
        },
        '05',
        2026,
      );

      expect(amounts.joursTravailles).toBe(10);
      expect(amounts.salaireBase).toBe(
        applyPaieProrata(450_000, 10 / 31),
      );
    });
  });

  describe('getPaiePeriodBounds', () => {
    it('calcule correctement les bornes de mai 2026', () => {
      const { start, end } = getPaiePeriodBounds('05', 2026);

      expect(start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-05-31T23:59:59.999Z');
    });
  });

  describe('computePaiePeriodOverlap', () => {
    it('combine embauche tardive et départ anticipé', () => {
      const overlap = computePaiePeriodOverlap(
        {
          dateEmbauche: new Date('2026-05-05'),
          dateFinContrat: new Date('2026-05-20'),
        },
        '05',
        2026,
      );

      expect(overlap.hasOverlap).toBe(true);
      expect(overlap.joursTravailles).toBe(16);
    });
  });
});
