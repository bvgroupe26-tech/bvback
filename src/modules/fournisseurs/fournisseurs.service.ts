import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Fournisseur, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFournisseurDto,
  QueryFournisseursDto,
  UpdateFournisseurDto,
} from './dto/fournisseur.dto';

@Injectable()
export class FournisseursService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryFournisseursDto): Promise<Fournisseur[]> {
    const where: Prisma.FournisseurWhereInput = { deletedAt: null };
    if (!query.inactifs) where.actif = true;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { nom: { contains: q, mode: 'insensitive' } },
        { niu: { contains: q, mode: 'insensitive' } },
        { rccm: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.fournisseur.findMany({ where, orderBy: { nom: 'asc' }, take: 500 });
  }

  async findOne(id: number): Promise<Fournisseur> {
    const f = await this.prisma.fournisseur.findFirst({ where: { id, deletedAt: null } });
    if (!f) throw new NotFoundException(`Fournisseur #${id} introuvable`);
    return f;
  }

  async create(dto: CreateFournisseurDto): Promise<Fournisseur> {
    await this.assertNiuLibre(dto.niu);
    return this.prisma.fournisseur.create({
      data: { ...dto, nom: dto.nom.trim(), niu: dto.niu?.trim() || null },
    });
  }

  async update(id: number, dto: UpdateFournisseurDto): Promise<Fournisseur> {
    await this.findOne(id);
    if (dto.niu !== undefined) await this.assertNiuLibre(dto.niu, id);
    return this.prisma.fournisseur.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.nom !== undefined ? { nom: dto.nom.trim() } : {}),
        ...(dto.niu !== undefined ? { niu: dto.niu.trim() || null } : {}),
      },
    });
  }

  /** Archive ; les dépenses gardent la référence pour l'historique. */
  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.fournisseur.update({
      where: { id },
      data: { deletedAt: new Date(), actif: false },
    });
  }

  private async assertNiuLibre(niu: string | undefined, excludeId?: number): Promise<void> {
    const value = niu?.trim();
    if (!value) return;
    const existing = await this.prisma.fournisseur.findFirst({
      where: {
        niu: { equals: value, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { nom: true },
    });
    if (existing) {
      throw new ConflictException(`Ce NIU est déjà utilisé par le fournisseur « ${existing.nom} ».`);
    }
  }
}
