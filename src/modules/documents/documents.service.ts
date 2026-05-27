import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentRh } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
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

  private async findEmployeByUserId(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const employe = await this.prisma.employe.findFirst({
      where: { email: user.email },
    });

    if (!employe) {
      throw new NotFoundException(
        'Aucun employé associé à ce compte utilisateur',
      );
    }

    return employe;
  }
}
