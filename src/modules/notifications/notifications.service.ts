import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: number): Promise<Notification[]> {
    const employe = await this.findEmployeByUserId(userId);

    return this.prisma.notification.findMany({
      where: { employeId: employe.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: number): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }

    return this.prisma.notification.update({
      where: { id },
      data: { lu: true, luAt: new Date() },
    });
  }

  async countUnreadByEmployeId(employeId: number): Promise<number> {
    return this.prisma.notification.count({
      where: { employeId, lu: false },
    });
  }

  async create(
    employeId: number,
    titre: string,
    message: string,
    type: 'info' | 'conge' | 'paie' | 'document' | 'systeme',
  ): Promise<Notification> {
    return this.prisma.notification.create({
      data: { employeId, titre, message, type },
    });
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
