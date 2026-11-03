import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, StatutBudgetDepense, UserRole } from '@prisma/client';
import {
  endOfDayUTC,
  parseDateOnly,
  startOfDayUTC,
} from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UserPayload } from '../auth/types/auth.types';
import { BudgetStorageService } from './budget-storage.service';
import {
  assertPeriodeOuverte,
  calculerMontants,
  estGestionnaire,
  STATUTS_CONSOMMES,
  STATUTS_MODIFIABLES,
} from './depense-rules';
import { CreateDepenseDto } from './dto/create-depense.dto';
import { QueryDepensesDto } from './dto/query-depenses.dto';
import { UpdateDepenseDto } from './dto/update-depense.dto';
import { ParametresFinanceService } from './parametres-finance.service';
import {
  DepenseDetail,
  depenseDetailInclude,
  DepensesPage,
  depenseWithRelationsInclude,
} from './types/budget.types';

const STAFF_LECTURE: UserRole[] = [UserRole.admin, UserRole.rh, UserRole.manager];
const STATUTS_PIECES_AJOUT: StatutBudgetDepense[] = [
  StatutBudgetDepense.brouillon,
  StatutBudgetDepense.refusee,
  StatutBudgetDepense.soumise,
];
const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function voitToutesLesDepenses(role: UserRole): boolean {
  return STAFF_LECTURE.includes(role);
}

/** Somme TTC engagée + réalisée sur une enveloppe, hors dépense `excludeId`. */
export async function consommeEnveloppe(
  prisma: PrismaService,
  enveloppeId: number,
  excludeId?: number,
): Promise<number> {
  const agg = await prisma.budgetDepense.aggregate({
    where: {
      enveloppeId,
      deletedAt: null,
      statut: { in: STATUTS_CONSOMMES },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    _sum: { montantTtc: true },
  });
  return agg._sum.montantTtc?.toNumber() ?? 0;
}

@Injectable()
export class DepensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametres: ParametresFinanceService,
    private readonly storage: BudgetStorageService,
  ) {}

  async findAll(query: QueryDepensesDto, user: UserPayload): Promise<DepensesPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where = this.buildWhere(query, user);

    const [items, total] = await Promise.all([
      this.prisma.budgetDepense.findMany({
        where,
        include: depenseWithRelationsInclude,
        orderBy: [{ dateDepense: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.budgetDepense.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** Lecture brute avec contrôle d'accès ; ne signe pas les URLs. */
  async getForUser(id: number, user: UserPayload): Promise<DepenseDetail> {
    const depense = await this.prisma.budgetDepense.findFirst({
      where: { id, deletedAt: null },
      include: depenseDetailInclude,
    });
    if (!depense) {
      throw new NotFoundException(`Dépense budgétaire #${id} introuvable`);
    }
    if (!voitToutesLesDepenses(user.role) && depense.demandeurId !== user.id) {
      throw new NotFoundException(`Dépense budgétaire #${id} introuvable`);
    }
    return depense;
  }

  async findOne(id: number, user: UserPayload): Promise<DepenseDetail> {
    return this.withSignedUrls(await this.getForUser(id, user));
  }

  async withSignedUrls(depense: DepenseDetail): Promise<DepenseDetail> {
    const piecesJointes = await Promise.all(
      depense.piecesJointes.map(async (p) => ({
        ...p,
        url: (await this.storage.signedUrl(p.url)) ?? '',
      })),
    );
    return { ...depense, piecesJointes };
  }

  async create(dto: CreateDepenseDto, user: UserPayload): Promise<DepenseDetail> {
    const params = await this.parametres.valeurs();
    await this.assertEnveloppeExists(dto.enveloppeId);
    if (dto.categorieId !== undefined) await this.assertCategorieExists(dto.categorieId);
    if (dto.fournisseurId !== undefined) await this.assertFournisseurActif(dto.fournisseurId);

    const dateDepense = parseDateOnly(dto.dateDepense);
    assertPeriodeOuverte(dateDepense, params.periodeCloseJusquau);

    const montants = this.resolveMontants(dto, params.tauxTvaDefaut);

    const created = await this.prisma.$transaction(async (tx) => {
      const depense = await tx.budgetDepense.create({
        data: {
          enveloppeId: dto.enveloppeId,
          categorieId: dto.categorieId ?? null,
          fournisseurId: dto.fournisseurId ?? null,
          libelle: dto.libelle,
          ...montants,
          dateDepense,
          fournisseur: dto.fournisseur,
          referencePiece: dto.referencePiece,
          commentaire: dto.commentaire,
          statut: StatutBudgetDepense.brouillon,
          demandeurId: user.id,
        },
      });
      await tx.budgetDepenseHistorique.create({
        data: {
          depenseId: depense.id,
          deStatut: null,
          versStatut: StatutBudgetDepense.brouillon,
          userId: user.id,
          commentaire: 'Création',
        },
      });
      return depense;
    });

    return this.findOne(created.id, user);
  }

  async update(id: number, dto: UpdateDepenseDto, user: UserPayload): Promise<DepenseDetail> {
    const existing = await this.getForUser(id, user);
    this.assertPeutModifier(existing, user);

    const params = await this.parametres.valeurs();

    if (dto.enveloppeId !== undefined && dto.enveloppeId !== existing.enveloppeId) {
      await this.assertEnveloppeExists(dto.enveloppeId);
    }
    if (dto.categorieId !== undefined && dto.categorieId !== null) {
      await this.assertCategorieExists(dto.categorieId);
    }
    if (dto.fournisseurId !== undefined && dto.fournisseurId !== null) {
      await this.assertFournisseurActif(dto.fournisseurId);
    }

    const data: Prisma.BudgetDepenseUncheckedUpdateInput = {};
    if (dto.enveloppeId !== undefined) data.enveloppeId = dto.enveloppeId;
    if (dto.categorieId !== undefined) data.categorieId = dto.categorieId;
    if (dto.fournisseurId !== undefined) data.fournisseurId = dto.fournisseurId;
    if (dto.libelle !== undefined) data.libelle = dto.libelle;
    if (dto.fournisseur !== undefined) data.fournisseur = dto.fournisseur;
    if (dto.referencePiece !== undefined) data.referencePiece = dto.referencePiece;
    if (dto.commentaire !== undefined) data.commentaire = dto.commentaire;
    if (dto.dateDepense !== undefined) {
      const date = parseDateOnly(dto.dateDepense);
      assertPeriodeOuverte(date, params.periodeCloseJusquau);
      data.dateDepense = date;
    } else {
      assertPeriodeOuverte(existing.dateDepense, params.periodeCloseJusquau);
    }

    if (dto.montantHt !== undefined || dto.montant !== undefined || dto.tauxTva !== undefined) {
      Object.assign(
        data,
        this.resolveMontants(
          {
            montantHt: dto.montantHt ?? (dto.montant === undefined ? existing.montantHt.toNumber() : undefined),
            montant: dto.montant,
            tauxTva: dto.tauxTva ?? existing.tauxTva.toNumber(),
          },
          params.tauxTvaDefaut,
        ),
      );
    }

    const repasseEnBrouillon = existing.statut === StatutBudgetDepense.refusee;
    if (repasseEnBrouillon) data.statut = StatutBudgetDepense.brouillon;

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.budgetDepense.updateMany({
        where: { id, statut: existing.statut, deletedAt: null },
        data,
      });
      if (res.count === 0) {
        throw new ConflictException('La dépense a été modifiée entre-temps, rechargez-la.');
      }
      if (repasseEnBrouillon) {
        await tx.budgetDepenseHistorique.create({
          data: {
            depenseId: id,
            deStatut: StatutBudgetDepense.refusee,
            versStatut: StatutBudgetDepense.brouillon,
            userId: user.id,
            commentaire: 'Correction après refus',
          },
        });
      }
    });

    return this.findOne(id, user);
  }

  /** Suppression réservée aux brouillons ; au-delà, utiliser l'annulation (tracée). */
  async remove(id: number, user: UserPayload): Promise<void> {
    const existing = await this.getForUser(id, user);
    if (existing.statut !== StatutBudgetDepense.brouillon) {
      throw new ConflictException(
        'Seul un brouillon peut être supprimé ; annulez la dépense pour garder la trace.',
      );
    }
    this.assertProprietaireOuGestionnaire(existing, user);
    await this.prisma.budgetDepense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async addPiece(
    id: number,
    file: Express.Multer.File | undefined,
    user: UserPayload,
  ): Promise<DepenseDetail> {
    if (!file) throw new BadRequestException('Fichier manquant (champ « file »).');
    const ext = MIME_EXT[file.mimetype];
    if (!ext) throw new BadRequestException('Formats acceptés : PDF, JPEG, PNG.');

    const depense = await this.getForUser(id, user);
    this.assertProprietaireOuGestionnaire(depense, user);
    if (!STATUTS_PIECES_AJOUT.includes(depense.statut)) {
      throw new ConflictException(
        'Les pièces justificatives ne peuvent plus être ajoutées après validation.',
      );
    }

    const path = `depenses/${id}/${randomUUID()}.${ext}`;
    await this.storage.upload(path, file.buffer, file.mimetype);
    await this.prisma.budgetPieceJointe.create({
      data: {
        depenseId: id,
        url: path,
        nom: file.originalname.slice(0, 255),
        mime: file.mimetype,
        taille: file.size,
        uploadedById: user.id,
      },
    });
    return this.findOne(id, user);
  }

  async removePiece(pieceId: number, user: UserPayload): Promise<void> {
    const piece = await this.prisma.budgetPieceJointe.findUnique({ where: { id: pieceId } });
    if (!piece) throw new NotFoundException(`Pièce justificative #${pieceId} introuvable`);

    const depense = await this.getForUser(piece.depenseId, user);
    this.assertProprietaireOuGestionnaire(depense, user);
    if (!STATUTS_MODIFIABLES.includes(depense.statut)) {
      throw new ConflictException(
        'Une pièce ne peut être retirée que sur un brouillon ou une dépense refusée.',
      );
    }

    await this.prisma.budgetPieceJointe.delete({ where: { id: pieceId } });
    await this.storage.remove(piece.url);
  }

  private resolveMontants(
    input: { montantHt?: number; montant?: number; tauxTva?: number },
    tauxDefaut: number,
  ): { montantHt: number; tauxTva: number; montantTva: number; montantTtc: number } {
    if (input.montantHt !== undefined) {
      return calculerMontants(input.montantHt, input.tauxTva ?? tauxDefaut);
    }
    if (input.montant !== undefined) {
      const ttc = Math.round(input.montant);
      return { montantHt: ttc, tauxTva: 0, montantTva: 0, montantTtc: ttc };
    }
    throw new BadRequestException('Le montant HT (montantHt) est obligatoire.');
  }

  private assertPeutModifier(depense: DepenseDetail, user: UserPayload): void {
    if (!STATUTS_MODIFIABLES.includes(depense.statut)) {
      throw new ConflictException(
        'Seuls un brouillon ou une dépense refusée peuvent être modifiés.',
      );
    }
    this.assertProprietaireOuGestionnaire(depense, user);
  }

  private assertProprietaireOuGestionnaire(depense: DepenseDetail, user: UserPayload): void {
    if (depense.demandeurId !== user.id && !estGestionnaire(user.role)) {
      throw new ForbiddenException('Vous ne pouvez agir que sur vos propres dépenses.');
    }
  }

  private buildWhere(query: QueryDepensesDto, user: UserPayload): Prisma.BudgetDepenseWhereInput {
    const where: Prisma.BudgetDepenseWhereInput = { deletedAt: null };

    if (query.mine || !voitToutesLesDepenses(user.role)) where.demandeurId = user.id;
    if (query.enveloppe_id !== undefined) where.enveloppeId = query.enveloppe_id;
    if (query.categorie_id !== undefined) where.categorieId = query.categorie_id;
    if (query.fournisseur_id !== undefined) where.fournisseurId = query.fournisseur_id;
    if (query.statut) where.statut = query.statut;

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { libelle: { contains: q, mode: 'insensitive' } },
        { fournisseur: { contains: q, mode: 'insensitive' } },
        { referencePiece: { contains: q, mode: 'insensitive' } },
        { fournisseurRef: { nom: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (query.date_from || query.date_to) {
      where.dateDepense = {
        ...(query.date_from ? { gte: startOfDayUTC(query.date_from) } : {}),
        ...(query.date_to ? { lte: endOfDayUTC(query.date_to) } : {}),
      };
    }

    return where;
  }

  private async assertEnveloppeExists(enveloppeId: number): Promise<void> {
    const enveloppe = await this.prisma.budgetEnveloppe.findFirst({
      where: { id: enveloppeId, deletedAt: null },
      select: { id: true },
    });
    if (!enveloppe) {
      throw new NotFoundException(`Enveloppe budgétaire #${enveloppeId} introuvable`);
    }
  }

  private async assertCategorieExists(categorieId: number): Promise<void> {
    const categorie = await this.prisma.budgetCategorie.findFirst({
      where: { id: categorieId, deletedAt: null },
      select: { id: true },
    });
    if (!categorie) {
      throw new NotFoundException(`Catégorie budgétaire #${categorieId} introuvable`);
    }
  }

  private async assertFournisseurActif(fournisseurId: number): Promise<void> {
    const f = await this.prisma.fournisseur.findFirst({
      where: { id: fournisseurId, deletedAt: null },
      select: { actif: true },
    });
    if (!f) throw new NotFoundException(`Fournisseur #${fournisseurId} introuvable`);
    if (!f.actif) throw new BadRequestException('Ce fournisseur est désactivé.');
  }
}
