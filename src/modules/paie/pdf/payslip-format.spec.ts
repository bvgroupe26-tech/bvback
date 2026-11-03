import {
  anciennete,
  formatFcfa,
  maskAccount,
  maskName,
  montantEnLettresFcfa,
  nombreEnLettres,
} from './payslip-format';
import { computePayslipHash, HashablePayslip } from './payslip-hash';

describe('nombreEnLettres', () => {
  it.each([
    [0, 'zéro'],
    [1, 'un'],
    [16, 'seize'],
    [17, 'dix-sept'],
    [21, 'vingt et un'],
    [32, 'trente-deux'],
    [70, 'soixante-dix'],
    [71, 'soixante et onze'],
    [77, 'soixante-dix-sept'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [90, 'quatre-vingt-dix'],
    [91, 'quatre-vingt-onze'],
    [99, 'quatre-vingt-dix-neuf'],
    [100, 'cent'],
    [101, 'cent un'],
    [180, 'cent quatre-vingts'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [1000, 'mille'],
    [1001, 'mille un'],
    [2000, 'deux mille'],
    [80000, 'quatre-vingt mille'],
    [200000, 'deux cent mille'],
    [250000, 'deux cent cinquante mille'],
    [1000000, 'un million'],
    [2000000, 'deux millions'],
    [80000000, 'quatre-vingts millions'],
    [200000000, 'deux cents millions'],
    [1250000, 'un million deux cent cinquante mille'],
    [1234567, 'un million deux cent trente-quatre mille cinq cent soixante-sept'],
    [1000000000, 'un milliard'],
  ])('%i → %s', (n, attendu) => {
    expect(nombreEnLettres(n)).toBe(attendu);
  });

  it('arrondit au franc', () => {
    expect(nombreEnLettres(99.6)).toBe('cent');
  });

  it('formule le net en francs CFA avec majuscule', () => {
    expect(montantEnLettresFcfa(375500)).toBe('Trois cent soixante-quinze mille cinq cents francs CFA');
  });
});

describe('formats du bulletin', () => {
  it('sépare les milliers sans espace insécable étroit (police WinAnsi)', () => {
    expect(formatFcfa(1234567)).toBe('1 234 567 FCFA');
    expect(formatFcfa(0)).toBe('0 FCFA');
    expect(formatFcfa(-1500)).toBe('-1 500 FCFA');
  });

  it('masque nom et comptes', () => {
    expect(maskName('Jean-Paul', 'dupont')).toBe('J*** D***');
    expect(maskName(null, null)).toBe('***');
    expect(maskAccount('CG39 3000 1000 1212 3456')).toBe('****3456');
    expect(maskAccount('')).toBe('—');
  });

  it('calcule l’ancienneté', () => {
    const ref = new Date(Date.UTC(2026, 4, 31));
    expect(anciennete(new Date(Date.UTC(2023, 1, 15)), ref)).toBe('3 ans 3 mois');
    expect(anciennete(new Date(Date.UTC(2026, 4, 1)), ref)).toBe('0 mois');
    expect(anciennete(null, ref)).toBe('—');
  });
});

describe('computePayslipHash', () => {
  const base: HashablePayslip = {
    numero: 'BV-2026-05-000001',
    employeId: 7,
    annee: 2026,
    mois: '5',
    type: 'normal',
    brut: 300000,
    brutImposable: 300000,
    netImposable: 280000,
    totalCotisSal: 12000,
    totalCotisPat: 40000,
    netAPayer: 260000,
    lignes: [
      { code: 'SAL_BASE', ordre: 10, base: null, taux: null, quantite: null, montantSalarial: 300000, montantPatronal: 0 },
      { code: 'CNSS_PENSION', ordre: 100, base: 300000, taux: 4, quantite: null, montantSalarial: 12000, montantPatronal: 24000 },
    ],
  };

  it('est stable (ordre des lignes, "5" = "05", nombre vs chaîne)', () => {
    const variante: HashablePayslip = {
      ...base,
      mois: '05',
      brut: '300000.00',
      lignes: [...base.lignes].reverse(),
    };
    expect(computePayslipHash(variante)).toBe(computePayslipHash(base));
  });

  it('change si un montant change', () => {
    expect(computePayslipHash({ ...base, netAPayer: 260001 })).not.toBe(computePayslipHash(base));
  });
});
