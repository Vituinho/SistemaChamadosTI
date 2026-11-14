import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from './api-error';

const GENERIC: Partial<Record<number, string>> = {
  400: 'Requisição inválida.',
  401: 'Faça login para acessar a área da TI.',
  403: 'Acesso não permitido.',
  404: 'Endpoint inexistente.',
  405: 'Método não permitido.',
  409: 'A operação conflita com o estado atual do chamado.',
  413: 'A requisição excede 6 MB.',
  415: 'Tipo de conteúdo não permitido.',
  422: 'Confira os campos e seus limites.',
  429: 'Muitas tentativas. Aguarde alguns minutos.',
  503: 'Serviço temporariamente indisponível.',
};

/** Converts any exception into the { detail } contract without leaking internals. */
export function toErrorBody(exception: unknown): { status: number; body: ApiErrorBody } {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'object' && response && 'detail' in response && typeof response.detail === 'string') {
      return { status, body: response as ApiErrorBody };
    }
    // Nest built-ins ({ message, error, statusCode }) such as "Cannot GET /x" are replaced by stable PT-BR text.
    return { status, body: { detail: GENERIC[status] ?? (status >= 500 ? 'Erro interno. Tente novamente.' : 'Requisição inválida.') } };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { detail: 'Erro interno. Tente novamente.' } };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const { status, body } = toErrorBody(exception);
    if (status >= 500) {
      this.logger.error({
        msg: 'Unhandled error',
        requestId: res.getHeader('x-request-id'),
        method: req.method,
        path: req.path,
        error: exception instanceof Error ? { name: exception.name, message: exception.message, stack: exception.stack } : String(exception),
      });
    }
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json(body);
  }
}
