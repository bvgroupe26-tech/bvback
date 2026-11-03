import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { StatutBudgetDepense as S, UserRole } from '@prisma/client';
import {
  calculerAlerte,
  calculerMontants,
  controlerSoumission,
  ControleSoumissionInput,
  DepenseEtat,
  resoudreTransition,
} from './depense-rules';

const DEMANDEUR = { id: 10, role: UserRole.employee };
const MANAGER = { id: 20, role: UserRole.manager };
const RH = { id: 30, role: UserRole.rh };
const ADMIN = { id: 40, role: UserRole.admin };
const ADMIN_2 = { id: 41, role: UserRole.admin };

function depense(over: Partial<DepenseEtat> = {}): DepenseEtat {
  return {
    statut: S.soumise,
    demandeurId: DEMANDEUR.id,
    valideurN1Id: null,
    montantTtc: 100_000,
    ...over,
  };
}

function soumission(over: Partial<ControleSoumissionInput> = {}): ControleSoumissionInput {
  return {
    enveloppe: {
      statut: 'actif',
      annee: 2026,
      montantPrevu: 1_000_000,
      bloquerDepassement: false,
      seuilAlertePct: 80,
    },
    dateDepense: new Date(Date.UTC(2026, 4, 8)),
    montantTtc: 100_000,
    consommeHorsDepense: 0,
    nbPiecesJointes: 0,
    seuilJustificatif: 0,
    periodeCloseJusquau: null,
    ...over,
  };
}

describe('resoudreTransition', () => {
  it('brouillon → soumise par le demandeur', () => {
    expect(
      resoudreTransition('soumettre', depense({ statut: S.brouillon }), DEMANDEUR, 0),
    ).toBe(S.soumise);
  });

  it("refuse la soumission par un autre employé que le demandeur", () => {
    const autre = { id: 11, role: UserRole.employee };
    expect(() =>
      resoudreTransition('soumettre', depense({ statut: S.brouillon }), autre, 0),
    ).toThrow(ForbiddenException);
  });

  describe('interdiction de se valider soi-même', () => {
    it.each(['valider', 'refuser', 'payer'] as const)('%s sur sa propre dépense', (action) => {
      const propre = depense({
        demandeurId: RH.id,
        statut: action === 'payer' ? S.validee : S.soumise,
      });
      expect(() => resoudreTransition(action, propre, RH, 0)).toThrow(ForbiddenException);
    });

    it("s'applique aussi à l'admin", () => {
      expect(() =>
        resoudreTransition('valider', depense({ demandeurId: ADMIN.id }), ADMIN, 0),
      ).toThrow(/propre dépense/);
    });
  });

  it("un employé ne peut pas valider", () => {
    const autre = { id: 12, role: UserRole.employee };
    expect(() => resoudreTransition('valider', depense(), autre, 0)).toThrow(ForbiddenException);
  });

  describe('validation N2 au-delà du seuil', () => {
    it('sans seuil : un seul niveau', () => {
      expect(resoudreTransition('valider', depense({ montantTtc: 5_000_000 }), MANAGER, 0)).toBe(
        S.validee,
      );
    });

    it('sous le seuil : validée directement', () => {
      expect(resoudreTransition('valider', depense({ montantTtc: 500_000 }), MANAGER, 1_000_000)).toBe(
        S.validee,
      );
    });

    it('au-delà du seuil : passe en validee_n1', () => {
      expect(
        resoudreTransition('valider', depense({ montantTtc: 1_500_000 }), MANAGER, 1_000_000),
      ).toBe(S.validee_n1);
    });

    it('N2 réservé à un admin', () => {
      const n1 = depense({ statut: S.validee_n1, valideurN1Id: MANAGER.id, montantTtc: 1_500_000 });
      expect(() => resoudreTransition('valider', n1, RH, 1_000_000)).toThrow(/administrateur/);
      expect(resoudreTransition('valider', n1, ADMIN, 1_000_000)).toBe(S.validee);
    });

    it('N2 par une autre personne que le N1', () => {
      const n1 = depense({ statut: S.validee_n1, valideurN1Id: ADMIN.id, montantTtc: 1_500_000 });
      expect(() => resoudreTransition('valider', n1, ADMIN, 1_000_000)).toThrow(ForbiddenException);
      expect(resoudreTransition('valider', n1, ADMIN_2, 1_000_000)).toBe(S.validee);
    });
  });

  it('paiement réservé à RH/admin et seulement après validation', () => {
    expect(resoudreTransition('payer', depense({ statut: S.validee }), RH, 0)).toBe(S.payee);
    expect(() => resoudreTransition('payer', depense({ statut: S.validee }), MANAGER, 0)).toThrow(
      ForbiddenException,
    );
    expect(() => resoudreTransition('payer', depense({ statut: S.soumise }), RH, 0)).toThrow(
      ConflictException,
    );
  });

  it("annulation : demandeur jusqu'à soumise, RH ensuite, jamais après paiement", () => {
    expect(resoudreTransition('annuler', depense({ statut: S.soumise }), DEMANDEUR, 0)).toBe(
      S.annulee,
    );
    expect(() => resoudreTransition('annuler', depense({ statut: S.validee }), DEMANDEUR, 0)).toThrow(
      ForbiddenException,
    );
    expect(resoudreTransition('annuler', depense({ statut: S.validee }), RH, 0)).toBe(S.annulee);
    expect(() => resoudreTransition('annuler', depense({ statut: S.payee }), ADMIN, 0)).toThrow(
      ConflictException,
    );
  });

  it('transition invalide → 409', () => {
    expect(() => resoudreTransition('valider', depense({ statut: S.brouillon }), RH, 0)).toThrow(
      ConflictException,
    );
  });
});

describe('controlerSoumission', () => {
  it('passe et renvoie ok sous le seuil d’alerte', () => {
    expect(controlerSoumission(soumission())).toBe('ok');
  });

  describe('pièce jointe obligatoire', () => {
    it('exigée au-delà du seuil', () => {
      expect(() =>
        controlerSoumission(soumission({ seuilJustificatif: 50_000, montantTtc: 50_000 })),
      ).toThrow(/pièce justificative/);
    });

    it('acceptée avec une pièce', () => {
      expect(
        controlerSoumission(
          soumission({ seuilJustificatif: 50_000, montantTtc: 80_000, nbPiecesJointes: 1 }),
        ),
      ).toBe('ok');
    });

    it('non exigée si seuil à 0', () => {
      expect(controlerSoumission(soumission({ seuilJustificatif: 0 }))).toBe('ok');
    });
  });

  describe('dépassement', () => {
    it('bloqué si l’enveloppe interdit le dépassement', () => {
      expect(() =>
        controlerSoumission(
          soumission({
            enveloppe: { ...soumission().enveloppe, bloquerDepassement: true },
            consommeHorsDepense: 950_000,
            montantTtc: 100_000,
          }),
        ),
      ).toThrow(ConflictException);
    });

    it('accepté avec alerte sinon', () => {
      expect(
        controlerSoumission(soumission({ consommeHorsDepense: 950_000, montantTtc: 100_000 })),
      ).toBe('depasse');
    });

    it('alerte seuil à 80 %', () => {
      expect(controlerSoumission(soumission({ consommeHorsDepense: 750_000 }))).toBe('seuil');
    });
  });

  it('période close refusée', () => {
    expect(() =>
      controlerSoumission(
        soumission({ periodeCloseJusquau: new Date(Date.UTC(2026, 4, 31, 23, 59, 59)) }),
      ),
    ).toThrow(/clôturée/);
  });

  it('enveloppe non active refusée', () => {
    expect(() =>
      controlerSoumission(soumission({ enveloppe: { ...soumission().enveloppe, statut: 'clos' } })),
    ).toThrow(BadRequestException);
  });

  it("exercice différent de l'enveloppe refusé", () => {
    expect(() =>
      controlerSoumission(soumission({ dateDepense: new Date(Date.UTC(2027, 0, 3)) })),
    ).toThrow(/exercice 2026/);
  });
});

describe('calculs', () => {
  it('HT / TVA / TTC arrondis au franc', () => {
    expect(calculerMontants(100_001, 18)).toEqual({
      montantHt: 100_001,
      tauxTva: 18,
      montantTva: 18_000,
      montantTtc: 118_001,
    });
  });

  it('alerte avec prévu nul', () => {
    expect(calculerAlerte(0, 0, 80)).toBe('ok');
    expect(calculerAlerte(1, 0, 80)).toBe('depasse');
  });
});
