import { PaieCalcService } from './paie-calc.service';

describe('PaieCalcService', () => {
  let service: PaieCalcService;

  beforeEach(() => {
    service = new PaieCalcService();
  });

  describe('calcSalaireNet', () => {
    it('calcule normalement lorsque les taux sont définis', () => {
      const result = service.calcSalaireNet({
        salaireBase: 100_000,
        primeTransport: 10_000,
        primeLogement: 5_000,
        primePerformance: 3_000,
        autresPrimes: 2_000,
        defTauxCnss: 0.05,
        defTauxImpot: 0.1,
        autresRetenues: 0,
      });

      expect(result.brut).toBe(120_000);
      expect(result.cnss).toBe(Math.round(100_000 * 0.05));
      expect(result.impot).toBe(Math.round(120_000 * 0.1));
      expect(result.salaireNet).toBe(
        Math.round(result.brut - result.cnss - result.impot - 0),
      );
      expect(result).toEqual({
        brut: 120_000,
        cnss: 5_000,
        impot: 12_000,
        salaireNet: 103_000,
      });
    });

    it('retourne cnss=0 et impot=0 lorsque les taux sont null', () => {
      const result = service.calcSalaireNet({
        salaireBase: 80_000,
        primeTransport: 5_000,
        primeLogement: 0,
        primePerformance: 0,
        autresPrimes: 0,
        defTauxCnss: null,
        defTauxImpot: null,
        autresRetenues: 1_000,
      });

      expect(result.brut).toBe(85_000);
      expect(result.cnss).toBe(0);
      expect(result.impot).toBe(0);
      expect(result.salaireNet).toBe(84_000);
    });

    it('avec primes nulles, salaireNet égale salaireBase si pas de retenues', () => {
      const result = service.calcSalaireNet({
        salaireBase: 50_000,
        primeTransport: 0,
        primeLogement: 0,
        primePerformance: 0,
        autresPrimes: 0,
        defTauxCnss: null,
        defTauxImpot: null,
        autresRetenues: 0,
      });

      expect(result.brut).toBe(50_000);
      expect(result.salaireNet).toBe(50_000);
    });

    it('applique Math.round à chaque étape (taux et montants manuels)', () => {
      const salaireBase = 100_333;
      const defTauxCnss = 0.051;
      const brut = 100_333;
      const defTauxImpot = 0.123;

      const result = service.calcSalaireNet({
        salaireBase,
        primeTransport: 0,
        primeLogement: 0,
        primePerformance: 0,
        autresPrimes: 0,
        defTauxCnss,
        defTauxImpot,
        autresRetenues: 0,
      });

      expect(result.cnss).toBe(Math.round(salaireBase * defTauxCnss));
      expect(result.cnss).toBe(5_117);
      expect(result.impot).toBe(Math.round(brut * defTauxImpot));
      expect(result.impot).toBe(12_341);
      expect(result.salaireNet).toBe(
        Math.round(brut - result.cnss - result.impot - 0),
      );

      const manuel = service.calcSalaireNet({
        salaireBase: 50_000,
        primeTransport: 0,
        primeLogement: 0,
        primePerformance: 0,
        autresPrimes: 0,
        defTauxCnss: 0.1,
        defTauxImpot: 0.1,
        autresRetenues: 0,
        cnssManuel: 1_234.6,
        impotManuel: 5_678.4,
      });

      expect(manuel.cnss).toBe(Math.round(1_234.6));
      expect(manuel.cnss).toBe(1_235);
      expect(manuel.impot).toBe(Math.round(5_678.4));
      expect(manuel.impot).toBe(5_678);
      expect(manuel.salaireNet).toBe(
        Math.round(50_000 - manuel.cnss - manuel.impot - 0),
      );
    });
  });
});
