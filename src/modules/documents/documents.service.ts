import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentRh } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { requireEmployeForUser } from '../../common/employe-link/employe-link';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: number): Promise<DocumentRh[]> {
    const employe = await this.findEmployeByUserId(userId);

    return this.prisma.documentRh.findMany({
      where: { employeId: employe.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: number): Promise<DocumentRh> {
    const doc = await this.prisma.documentRh.findUnique({ where: { id } });

    if (!doc) {
      throw new NotFoundException(`Document #${id} introuvable`);
    }

    return doc;
  }

  async getFileBuffer(id: number): Promise<{ buffer: Buffer; document: DocumentRh }> {
    const document = await this.findOneOrThrow(id);
    const absolutePath = path.join(process.cwd(), document.fichierPath);

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Le fichier associé est introuvable sur le serveur');
    }

    return { buffer: fs.readFileSync(absolutePath), document };
  }

  private findEmployeByUserId(userId: number) {
    return requireEmployeForUser(this.prisma, userId);
  }
}
