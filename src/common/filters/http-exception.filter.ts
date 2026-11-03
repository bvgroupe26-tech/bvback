import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

export interface ApiErrorResponse {
  ok: false;
  error: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erreur interne du serveur';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = this.extractMessage(exception);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      status = HttpStatus.CONFLICT;
      message = 'Cet enregistrement existe déjà';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      status = HttpStatus.NOT_FOUND;
      message = 'Ressource introuvable';
    }

    // Le détail des erreurs serveur (Prisma, stack) reste dans les logs, jamais dans la réponse.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request?.method} ${request?.originalUrl ?? request?.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        message = 'Erreur interne du serveur';
      }
    }

    const body: ApiErrorResponse = {
      ok: false,
      error: message,
    };

    response.status(status).json(body);
  }

  private extractMessage(exception: HttpException): string {
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, unknown>;

      if (Array.isArray(resp['message'])) {
        return resp['message'].map(String).join(', ');
      }

      if (typeof resp['message'] === 'string') {
        return resp['message'];
      }
    }

    return exception.message;
  }
}
