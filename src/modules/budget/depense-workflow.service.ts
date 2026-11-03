import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  StatutBudgetDepense,
  TypeNotification,
} from '@prisma/client';
import { parseDateOnly } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UserPayload } from '../auth/types/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AlerteBudget,
  assertPeriodeOuverte,
  controlerDepassement,
  controlerSoumission,
  DepenseAction,
  resoudreTransition,
} from './depense-rules';
import { consommeEnveloppe, DepensesService } from './depenses.service';
import { PayerDepenseDto } from './dto/depense-actions.dto';
import { ParametresFinanceService } from './parametres-finance.service';
import { DepenseDetail } from './types/budget.types';

export interface TransitionPayload {
  commentaire?: string;
  motif?: string;
  paiement?: PayerDepenseDto;
}

export type DepenseAvecAlerte = DepenseDetail & { alerte: AlerteBudget | null };

const LIBELLES_ACTION: Record<DepenseAction, string> = {
  soumettre: 'soumise',
  valider: 'validée',
  refuser: 'refusée',
  payer: 'payée',
  annuler: 'annulée',
};

@Injectable()
export class DepenseWorkflowService {
  private readonly logger = new Logger(DepenseWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly depenses: DepensesService,
    private readonly parametres: ParametresFinanceService,
    private readonly notifications: NotificationsService,
  ) {}

  async transition(
    id: number,
    action: DepenseAction,
    user: UserPayload,
    payload: TransitionPayload = {},
  ): Promise<DepenseAvecAlerte> {
    const depense = await this.depenses.getForUser(id, user);
    const params = await this.parametres.valeurs();
    const montantTtc = depense.montantTtc.toNumber();

    const cible = resoudreTransition(
      action,
      {
        statut: depense.statut,
        demandeurId: depense.demandeurId,
        valideurN1Id: depense.valideurN1Id,
        montantTtc,
      },
      { id: user.id, role: user.role },
      params.seuilValidationN2,
    );

    let alerte: AlerteBudget | null = null;
    const data: Prisma.BudgetDepenseUncheckedUpdateInput = { statut: cible };

    if (action === 'soumettre' || action === 'valider') {
      const enveloppe = await this.prisma.budgetEnveloppe.findUniqueOrThrow({
        where: { id: depense.enveloppeId },
      });
      const controle = {
        enveloppe: {
          statut: enveloppe.statut,
          annee: enveloppe.annee,
          montantPrevu: enveloppe.montantPrevu.toNumber(),
          bloquerDepassement: enveloppe.bloquerDepassement,
          seuilAlertePct: enveloppe.seuilAlertePct,
        },
        montantTtc,
        consommeHorsDepense: await consommeEnveloppe(this.prisma, depense.enveloppeId, id),
      };
      alerte =
        action === 'soumettre'
          ? controlerSoumission({
              ...controle,
              dateDepense: depense.dateDepense,
              nbPiecesJointes: depense.piecesJointes.length,
              seuilJustificatif: params.seuilJustificatif,
              periodeCloseJusquau: params.periodeCloseJusquau,
            })
          : controlerDepassement(controle);
    }

    if (action === 'valider') {
      if (cible === StatutBudgetDepense.validee_n1) {
        data.valideurN1Id = user.id;
      } else {
        data.valideurId = user.id;
        data.valideLe = new Date();
      }
    }
    if (action === 'refuser') data.motifRefus = payload.motif;
    if (action === 'payer' && payload.paiement) {
      const datePaiement = parseDateOnly(payload.paiement.datePaiement);
      assertPeriodeOuverte(datePaiement, params.periodeCloseJusquau);
      data.payeurId = user.id;
      data.modePaiement = payload.paiement.modePaiement;
      data.referencePaiement = payload.paiement.referencePaiement ?? null;
      data.datePaiement = datePaiement;
    }

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.budgetDepense.updateMany({
        where: { id, statut: depense.statut, deletedAt: null },
        data,
      });
      if (res.count === 0) {
        throw new ConflictException('La dépense a été modifiée entre-temps, rechargez-la.');
      }
      await tx.budgetDepenseHistorique.create({
        data: {
          depenseId: id,
          deStatut: depense.statut,
          versStatut: cible,
          userId: user.id,
          commentaire: payload.motif ?? payload.commentaire ?? null,
        },
      });
    });

    await this.notifier(action, cible, depense, user, payload.motif);

    const updated = await this.depenses.findOne(id, user);
    return { ...updated, alerte };
  }

  private async notifier(
    action: DepenseAction,
    cible: StatutBudgetDepense,
    depense: DepenseDetail,
    acteur: UserPayload,
    motif?: string,
  ): Promise<void> {
    const montant = `${depense.montantTtc.toNumber().toLocaleString('fr-FR')} FCFA`;
    const meta = { depenseId: depense.id, statut: cible };

    if (action === 'soumettre' || (action === 'valider' && cible === StatutBudgetDepense.validee_n1)) {
      const titre =
        cible === StatutBudgetDepense.validee_n1
          ? 'Dépense à valider (niveau 2)'
          : 'Nouvelle dépense à valider';
      const exclus = [...new Set([acteur.id, depense.demandeurId])].filter(
        (v): v is number => v !== null,
      );
      await this.notifications.safeNotifyRhTeam(
        titre,
        `« ${depense.libelle} » — ${montant}`,
        TypeNotification.info,
        meta,
        exclus,
      );
      return;
    }

    const notifieDemandeur: DepenseAction[] = ['valider', 'refuser', 'payer'];
    if (!notifieDemandeur.includes(action) || !depense.demandeurId) return;
    if (depense.demandeurId === acteur.id) return;

    const message =
      action === 'refuser'
        ? `« ${depense.libelle} » a été refusée : ${motif ?? ''}`.trim()
        : `« ${depense.libelle} » (${montant}) a été ${LIBELLES_ACTION[action]}.`;
    try {
      await this.notifications.notifyUser(
        depense.demandeurId,
        `Dépense ${LIBELLES_ACTION[action]}`,
        message,
        TypeNotification.info,
        meta,
      );
    } catch (error) {
      this.logger.warn(
        `Notification dépense #${depense.id} non envoyée`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
