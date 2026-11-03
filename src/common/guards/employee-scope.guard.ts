import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { UserPayload } from '../../modules/auth/types/auth.types';
import { findEmployeIdForUser } from '../employe-link/employe-link';

export type EmployeeScopeOptions = {
  /** Rôles non restreints (accès à toutes les fiches). Défaut : admin, rh, manager. */
  staff?: UserRole[];
  /** Ressource désignée par le paramètre `:id`, qui doit appartenir à l'employé connecté. */
  resource?: 'paie' | 'absence' | 'presence' | 'document';
  /** Force `employeId` du corps sur la fiche de l'employé et retire `statut`. */
  body?: boolean;
  /** Force le filtre `employe_id` de la query sur la fiche de l'employé. */
  query?: boolean;
};

const EMPLOYEE_SCOPE_KEY = 'employeeScope';
const DEFAULT_STAFF: UserRole[] = [UserRole.admin, UserRole.rh, UserRole.manager];

/**
 * Sans effet pour les rôles `staff`. Pour les autres, restreint la route à leur propre fiche.
 * À combiner avec un `@Roles(...)` qui inclut ces rôles.
 */
export function EmployeeScope(options: EmployeeScopeOptions) {
  return applyDecorators(
    SetMetadata(EMPLOYEE_SCOPE_KEY, options),
    UseGuards(EmployeeScopeGuard),
  );
}

@Injectable()
export class EmployeeScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<EmployeeScopeOptions | undefined>(
      EMPLOYEE_SCOPE_KEY,
      context.getHandler(),
    );
    const req = context.switchToHttp().getRequest<Request & { user?: UserPayload }>();
    const user = req.user;

    if (!options || !user || (options.staff ?? DEFAULT_STAFF).includes(user.role)) {
      return true;
    }

    const employeId = await findEmployeIdForUser(this.prisma, user);
    if (!employeId) {
      throw new ForbiddenException('Aucune fiche employé associée à ce compte');
    }

    if (options.resource) {
      await this.assertOwnsResource(options.resource, Number(req.params.id), employeId);
    }

    if (options.body && req.body && typeof req.body === 'object') {
      const body = req.body as Record<string, unknown>;
      delete body.employe_id;
      delete body.statut;
      body.employeId = employeId;
    }

    if (options.query) {
      // Express 5 : req.query est un getter recalculé à chaque accès, on le remplace.
      const query: Record<string, unknown> = {
        ...(req.query as Record<string, unknown>),
        employe_id: String(employeId),
      };
      delete query.employeId;
      Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true });
    }

    return true;
  }

  private async assertOwnsResource(
    resource: NonNullable<EmployeeScopeOptions['resource']>,
    id: number,
    employeId: number,
  ): Promise<void> {
    if (!Number.isInteger(id)) {
      throw new NotFoundException('Ressource introuvable');
    }

    const select = { employeId: true, statut: true } as const;
    let row: { employeId: number; statut?: string } | null;

    switch (resource) {
      case 'paie':
        row = await this.prisma.paie.findUnique({ where: { id }, select });
        if (row && row.statut !== 'paye') row = null;
        break;
      case 'absence':
        row = await this.prisma.absence.findUnique({ where: { id }, select });
        if (row && row.employeId === employeId && row.statut !== 'en_attente') {
          throw new ForbiddenException('Seule une demande en attente peut être modifiée');
        }
        break;
      case 'presence':
        row = await this.prisma.presence.findUnique({ where: { id }, select });
        break;
      case 'document':
        row = await this.prisma.documentRh.findUnique({
          where: { id },
          select: { employeId: true },
        });
        break;
    }

    // 404 plutôt que 403 : ne pas révéler l'existence de la ressource d'un autre.
    if (!row || row.employeId !== employeId) {
      throw new NotFoundException('Ressource introuvable');
    }
  }
}
