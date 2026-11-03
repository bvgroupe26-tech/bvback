import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BudgetCategorie, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategorieDto } from './dto/create-categorie.dto';
import { UpdateCategorieDto } from './dto/update-categorie.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<BudgetCategorie[]> {
    return this.prisma.budgetCategorie.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: number): Promise<BudgetCategorie> {
    const categorie = await this.prisma.budgetCategorie.findFirst({
      where: { id, deletedAt: null },
    });

    if (!categorie) {
      throw new NotFoundException(`Catégorie budgétaire #${id} introuvable`);
    }

    return categorie;
  }

  async create(dto: CreateCategorieDto): Promise<BudgetCategorie> {
    const code = dto.code.trim();
    await this.assertCodeLibre(code);
    return this.prisma.budgetCategorie.create({
      data: {
        code,
        libelle: dto.libelle,
        description: dto.description,
        compteSyscohada: dto.compteSyscohada,
      },
    });
  }

  async update(id: number, dto: UpdateCategorieDto): Promise<BudgetCategorie> {
    await this.findOne(id);
    if (dto.code !== undefined) await this.assertCodeLibre(dto.code.trim(), id);

    return this.prisma.budgetCategorie.update({
      where: { id },
      data: this.toUpdateInput(dto),
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);

    const usageCount = await this.prisma.budgetDepense.count({
      where: { categorieId: id, deletedAt: null },
    });

    if (usageCount > 0) {
      throw new ConflictException(
        'Cette catégorie est utilisée par des dépenses',
      );
    }

    await this.prisma.budgetCategorie.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async assertCodeLibre(code: string, excludeId?: number): Promise<void> {
    const existing = await this.prisma.budgetCategorie.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Le code de catégorie « ${code} » existe déjà.`);
    }
  }

  private toUpdateInput(
    dto: UpdateCategorieDto,
  ): Prisma.BudgetCategorieUpdateInput {
    const data: Prisma.BudgetCategorieUpdateInput = {};

    if (dto.code !== undefined) data.code = dto.code.trim();
    if (dto.libelle !== undefined) data.libelle = dto.libelle;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.compteSyscohada !== undefined) data.compteSyscohada = dto.compteSyscohada;

    return data;
  }
}
