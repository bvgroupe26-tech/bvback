import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { MoteurPaie, StatutPaie, StatutPeriodePaie, TypeBulletin, TypeRubrique } from '@prisma/client';
import { assertNotSelf } from '../../../common/self-action/self-action';
import { PayrollPeriodsService } from './payroll-periods.service';

jest.mock('../../../common/self-action/self-action', () => ({ assertNotSelf: jest.fn() }));

const mockedAssertNotSelf = assertNotSelf as jest.MockedFunction<typeof assertNotSelf>;

function setup(period: { statut: StatutPeriodePaie }) {
  const prisma = {
    payrollPeriod: {
      findUnique: jest.fn().mockResolvedValue({ id: 1, annee: 2026, mois: 5, ...period }),
      update: jest.fn(),
    },
    paie: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ id: 99 }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    employe: { findMany: jest.fn().mockResolvedValue([]) },
    employeurSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const settings = { statut: jest.fn().mockResolvedValue({ pret: true, parametresManquants: [], baremesManquants: [], employeurIncomplet: [] }) };
  const pdf = { archive: jest.fn().mockResolvedValue({}) };
  const notifications = { safeNotifyEmploye: jest.fn() };
  const activite = { log: jest.fn() };
  const service = new PayrollPeriodsService(
    prisma as never,
    {} as never,
    {} as never,
    settings as never,
    pdf as never,
    notifications as never,
    activite as never,
  );
  return { service, prisma, settings, pdf, notifications };
}

const bulletin = (id: number, employeId: number) => ({
  id,
  employeId,
  annee: 2026,
  mois: '05',
  type: TypeBulletin.normal,
  numero: null,
  statut: StatutPaie.calcule,
  moteur: MoteurPaie.v2,
  brut: '100000',
  brutImposable: '100000',
  netImposable: '100000',
  totalCotisSal: '4000',
  totalCotisPat: '16000',
  netAPayer: '96000',
  employe: { id: employeId, nom: 'N', prenom: 'P', dateEmbauche: null },
  lignes: [],
});

describe('PayrollPeriodsService', () => {
  beforeEach(() => mockedAssertNotSelf.mockReset().mockResolvedValue(undefined));

  it('refuse tout calcul sur une période clôturée', async () => {
    const { service, settings } = setup({ statut: StatutPeriodePaie.cloturee });
    await expect(service.calculer(1)).rejects.toThrow(ConflictException);
    expect(settings.statut).not.toHaveBeenCalled();
  });

  it('renvoie 422 avec les codes si le paramétrage est incomplet', async () => {
    const { service, settings } = setup({ statut: StatutPeriodePaie.ouverte });
    settings.statut.mockResolvedValue({ pret: false, parametresManquants: ['TX_CNSS_PENSION_SAL'], baremesManquants: ['IRPP'], employeurIncomplet: [] });
    const err = await service.calculer(1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).getResponse()).toMatchObject({ codes: ['TX_CNSS_PENSION_SAL', 'IRPP'] });
  });

  it('refuse de payer une période non validée', async () => {
    const { service } = setup({ statut: StatutPeriodePaie.calculee });
    await expect(service.payer(1, { datePaiement: '2026-05-30' }, 7)).rejects.toThrow(ConflictException);
  });

  it('valide sans jamais valider le bulletin du validateur', async () => {
    const { service, prisma, pdf } = setup({ statut: StatutPeriodePaie.calculee });
    prisma.paie.findMany.mockResolvedValueOnce([bulletin(10, 1), bulletin(11, 2)]).mockResolvedValue([]);
    mockedAssertNotSelf.mockImplementation(async (_p, _u, employeId) => {
      if (employeId === 2) throw new ForbiddenException('soi-même');
    });

    const res = await service.valider(1, 7);

    expect(res.valides).toBe(1);
    expect(res.ignoresAutoValidation).toEqual([{ paieId: 11, employeId: 2 }]);
    expect(prisma.paie.update).toHaveBeenCalledTimes(1);
    const data = prisma.paie.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ statut: StatutPaie.valide, numero: 'BV-2026-05-000010', validatedById: 7 });
    expect(data.hashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pdf.archive).toHaveBeenCalledWith(10);
  });

  it('un échec d’archivage n’annule pas la validation', async () => {
    const { service, prisma, pdf } = setup({ statut: StatutPeriodePaie.calculee });
    prisma.paie.findMany.mockResolvedValueOnce([bulletin(10, 1)]).mockResolvedValue([]);
    pdf.archive.mockRejectedValue(new Error('stockage non configuré'));
    const res = await service.valider(1, 7);
    expect(res.valides).toBe(1);
    expect(res.archivageEchoue).toEqual([{ paieId: 10, message: 'stockage non configuré' }]);
  });

  it('contre-bulletin : lignes négatives et original annulé', async () => {
    const { service, prisma } = setup({ statut: StatutPeriodePaie.payee });
    prisma.paie.findFirst.mockResolvedValue({
      ...bulletin(10, 1),
      statut: StatutPaie.paye,
      numero: 'BV-2026-05-000010',
      periodId: 1,
      period: { statut: StatutPeriodePaie.payee },
      contreBulletins: [],
      salaireBase: 100000,
      cnss: 4000,
      impot: 0,
      autresRetenues: 0,
      salaireNet: 96000,
      datePaiement: new Date('2026-05-30'),
      employeSnapshot: { nom: 'N' },
      employeurSnapshot: {},
      lignes: [
        {
          payRuleId: 1,
          code: 'SAL_BASE',
          libelle: 'Salaire',
          ordre: 10,
          type: TypeRubrique.gain,
          base: null,
          taux: null,
          quantite: null,
          montantSalarial: '100000',
          montantPatronal: '0',
          imposable: true,
        },
      ],
    });
    prisma.paie.create.mockResolvedValue({ ...bulletin(20, 1), type: TypeBulletin.contre_bulletin, lignes: [] });

    await service.contreBulletin(10, 7);

    const data = prisma.paie.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      type: TypeBulletin.contre_bulletin,
      annuleBulletinId: 10,
      statut: StatutPaie.paye,
      netAPayer: -96000,
      brut: -100000,
    });
    expect(data.lignes.create[0]).toMatchObject({ code: 'SAL_BASE', montantSalarial: -100000 });
    expect(prisma.paie.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { statut: StatutPaie.annule } });
  });

  it('refuse un contre-bulletin sur un bulletin seulement calculé', async () => {
    const { service, prisma } = setup({ statut: StatutPeriodePaie.calculee });
    prisma.paie.findFirst.mockResolvedValue({ ...bulletin(10, 1), period: null, contreBulletins: [] });
    await expect(service.contreBulletin(10, 7)).rejects.toThrow(ConflictException);
  });

  it('refuse un contre-bulletin sur son propre bulletin', async () => {
    const { service, prisma } = setup({ statut: StatutPeriodePaie.payee });
    prisma.paie.findFirst.mockResolvedValue({ ...bulletin(10, 1), statut: StatutPaie.paye, period: null, contreBulletins: [], lignes: [] });
    mockedAssertNotSelf.mockRejectedValue(new ForbiddenException('soi-même'));
    await expect(service.contreBulletin(10, 7)).rejects.toThrow(ForbiddenException);
    expect(prisma.paie.create).not.toHaveBeenCalled();
  });
});
