import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, StatutBudgetDepense as S, UserRole } from '@prisma/client';
import { UserPayload } from '../auth/types/auth.types';
import { DepenseWorkflowService } from './depense-workflow.service';

const dec = (n: number) => new Prisma.Decimal(n);

function user(id: number, role: UserRole): UserPayload {
  return { id, role, email: `u${id}@x.cg`, nom: 'N', prenom: 'P' } as UserPayload;
}

function makeDepense(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    enveloppeId: 4,
    libelle: 'Licences',
    statut: S.soumise,
    demandeurId: 10,
    valideurN1Id: null,
    montantTtc: dec(100_000),
    dateDepense: new Date(Date.UTC(2026, 4, 8)),
    piecesJointes: [],
    ...over,
  };
}

function setup(depense = makeDepense(), params: Record<string, unknown> = {}) {
  const tx = {
    budgetDepense: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    budgetDepenseHistorique: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    budgetEnveloppe: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        statut: 'actif',
        annee: 2026,
        montantPrevu: dec(1_000_000),
        bloquerDepassement: false,
        seuilAlertePct: 80,
      }),
    },
    budgetDepense: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { montantTtc: dec(0) } }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const depenses = {
    getForUser: jest.fn().mockResolvedValue(depense),
    findOne: jest.fn().mockResolvedValue(depense),
  };
  const parametres = {
    valeurs: jest.fn().mockResolvedValue({
      tauxTvaDefaut: 18,
      seuilJustificatif: 0,
      seuilValidationN2: 0,
      periodeCloseJusquau: null,
      ...params,
    }),
  };
  const notifications = {
    safeNotifyRhTeam: jest.fn().mockResolvedValue(undefined),
    notifyUser: jest.fn().mockResolvedValue({}),
  };
  const service = new DepenseWorkflowService(
    prisma as never,
    depenses as never,
    parametres as never,
    notifications as never,
  );
  return { service, tx, prisma, notifications };
}

describe('DepenseWorkflowService', () => {
  it('refuse que le demandeur valide sa propre dépense (aucune écriture)', async () => {
    const { service, tx } = setup(makeDepense({ demandeurId: 30 }));
    await expect(service.transition(1, 'valider', user(30, UserRole.rh))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.budgetDepense.updateMany).not.toHaveBeenCalled();
  });

  it('valide, trace l’historique et notifie le demandeur', async () => {
    const { service, tx, notifications } = setup();
    const res = await service.transition(1, 'valider', user(20, UserRole.manager));
    expect(tx.budgetDepense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, statut: S.soumise, deletedAt: null },
        data: expect.objectContaining({ statut: S.validee, valideurId: 20 }),
      }),
    );
    expect(tx.budgetDepenseHistorique.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ deStatut: S.soumise, versStatut: S.validee, userId: 20 }),
    });
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      10,
      expect.any(String),
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ depenseId: 1 }),
    );
    expect(res.alerte).toBe('ok');
  });

  it('au-delà du seuil N2 : passe en validee_n1 et notifie les valideurs', async () => {
    const { service, tx, notifications } = setup(
      makeDepense({ montantTtc: dec(2_000_000) }),
      { seuilValidationN2: 1_000_000 },
    );
    await service.transition(1, 'valider', user(20, UserRole.manager));
    expect(tx.budgetDepense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statut: S.validee_n1, valideurN1Id: 20 }),
      }),
    );
    expect(notifications.safeNotifyRhTeam).toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('soumission : pièce obligatoire au-delà du seuil', async () => {
    const { service } = setup(makeDepense({ statut: S.brouillon }), { seuilJustificatif: 50_000 });
    await expect(service.transition(1, 'soumettre', user(10, UserRole.employee))).rejects.toThrow(
      /pièce justificative/,
    );
  });

  it('soumission : notifie les valideurs en excluant le demandeur', async () => {
    const { service, notifications } = setup(makeDepense({ statut: S.brouillon }));
    await service.transition(1, 'soumettre', user(10, UserRole.employee));
    expect(notifications.safeNotifyRhTeam).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.anything(),
      expect.anything(),
      [10],
    );
  });

  it('soumission : dépassement bloqué', async () => {
    const { service, prisma } = setup(makeDepense({ statut: S.brouillon }));
    prisma.budgetEnveloppe.findUniqueOrThrow.mockResolvedValue({
      statut: 'actif',
      annee: 2026,
      montantPrevu: dec(100_000),
      bloquerDepassement: true,
      seuilAlertePct: 80,
    });
    prisma.budgetDepense.aggregate.mockResolvedValue({ _sum: { montantTtc: dec(50_000) } });
    await expect(service.transition(1, 'soumettre', user(10, UserRole.employee))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('soumission : période close refusée', async () => {
    const { service } = setup(makeDepense({ statut: S.brouillon }), {
      periodeCloseJusquau: new Date(Date.UTC(2026, 5, 30, 23, 59, 59)),
    });
    await expect(service.transition(1, 'soumettre', user(10, UserRole.employee))).rejects.toThrow(
      /clôturée/,
    );
  });

  it('conflit si le statut a changé entre-temps', async () => {
    const { service, tx } = setup();
    tx.budgetDepense.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.transition(1, 'valider', user(20, UserRole.manager))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('paiement : enregistre mode, référence et date', async () => {
    const { service, tx } = setup(makeDepense({ statut: S.validee }));
    await service.transition(1, 'payer', user(30, UserRole.rh), {
      paiement: { modePaiement: 'mobile_money', referencePaiement: 'MM-1', datePaiement: '2026-05-12' },
    });
    expect(tx.budgetDepense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statut: S.payee,
          payeurId: 30,
          modePaiement: 'mobile_money',
          referencePaiement: 'MM-1',
          datePaiement: new Date(Date.UTC(2026, 4, 12)),
        }),
      }),
    );
  });
});
