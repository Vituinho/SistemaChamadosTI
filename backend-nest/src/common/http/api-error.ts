import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Error body contract shared with the frontend (and the legacy FastAPI API):
 * { "detail": "mensagem em português", "fields"?: ["campo"] }
 */
export interface ApiErrorBody {
  detail: string;
  fields?: string[];
}

export class ApiError extends HttpException {
  constructor(status: HttpStatus, detail: string, fields?: string[]) {
    super(fields?.length ? { detail, fields } : { detail }, status);
  }
}

export const validationFailed = (fields: string[] = [], detail = 'Confira os campos e seus limites.') =>
  new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, detail, fields);
