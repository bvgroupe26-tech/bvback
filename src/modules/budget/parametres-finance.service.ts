import { Injectable } from '@nestjs/common';
import { ParametresFinance, Prisma } from '@prisma/client';
import { endOfDayUTC } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateParametresFinanceDto } from './dto/parametres-finance.dto';

export interface ParametresFinanceValeurs {
  tauxTvaDefaut: number;
  seuilJustificatif: number;
  seuilValidationN2: number;
  periodeCloseJusquau: Date | null;
}

const ID = 1;

@Injectable()
export class ParametresFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  get(): Promise<ParametresFinance> {
    return this.prisma.parametresFinance.upsert({
      where: { id: ID },
      create: { id: ID },
      update: {},
    });
  }

  async valeurs(): Promise<ParametresFinanceValeurs> {
    const p = await this.get();
    return {
      tauxTvaDefaut: p.tauxTvaDefaut.toNumber(),
      seuilJustificatif: p.seuilJustificatif.toNumber(),
      seuilValidationN2: p.seuilValidationN2.toNumber(),
      periodeCloseJusquau: p.periodeCloseJusquau,
    };
  }

  update(dto: UpdateParametresFinanceDto): Promise<ParametresFinance> {
    const data: Prisma.ParametresFinanceUpdateInput = {};
    if (dto.tauxTvaDefaut !== undefined) data.tauxTvaDefaut = dto.tauxTvaDefaut;
    if (dto.seuilJustificatif !== undefined) data.seuilJustificatif = dto.seuilJustificatif;
    if (dto.seuilValidationN2 !== undefined) data.seuilValidationN2 = dto.seuilValidationN2;
    if (dto.periodeCloseJusquau !== undefined) {
      // Fin de journée : la date indiquée est incluse dans la période close.
      data.periodeCloseJusquau =
        dto.periodeCloseJusquau === null ? null : endOfDayUTC(dto.periodeCloseJusquau);
    }
    return this.prisma.parametresFinance.upsert({
      where: { id: ID },
      create: { id: ID, ...(data as Prisma.ParametresFinanceCreateInput) },
      update: data,
    });
  }
}
