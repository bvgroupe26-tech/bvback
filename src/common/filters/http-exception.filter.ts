import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

export interface ApiErrorResponse {
  ok: false;
  error: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erreur interne du serveur';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = this.extractMessage(exception);
    } else if (exception instanceof Error) {
      message = exception.message;
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
