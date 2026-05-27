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
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: number): Promise<BudgetCategorie> {
    const categorie = await this.prisma.budgetCategorie.findUnique({
      where: { id },
    });

    if (!categorie) {
      throw new NotFoundException(`Catégorie budgétaire #${id} introuvable`);
    }

    return categorie;
  }

  create(dto: CreateCategorieDto): Promise<BudgetCategorie> {
    return this.prisma.budgetCategorie.create({
      data: {
        code: dto.code,
        libelle: dto.libelle,
        description: dto.description,
      },
    });
  }

  async update(id: number, dto: UpdateCategorieDto): Promise<BudgetCategorie> {
    await this.findOne(id);

    return this.prisma.budgetCategorie.update({
      where: { id },
      data: this.toUpdateInput(dto),
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);

    const usageCount = await this.prisma.budgetDepense.count({
      where: { categorieId: id },
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

  private toUpdateInput(
    dto: UpdateCategorieDto,
  ): Prisma.BudgetCategorieUpdateInput {
    const data: Prisma.BudgetCategorieUpdateInput = {};

    if (dto.code !== undefined) data.code = dto.code;
    if (dto.libelle !== undefined) data.libelle = dto.libelle;
    if (dto.description !== undefined) data.description = dto.description;

    return data;
  }
}
