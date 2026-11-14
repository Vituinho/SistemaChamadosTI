import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import { ApiError } from '../common/http/api-error';
import { MAX_IMAGE_BYTES } from './image.service';

const FIELDS = ['name', 'department', 'state', 'location', 'category', 'affected_system', 'title', 'description'];

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: FIELDS.length, fieldSize: 20_000, parts: FIELDS.length + 1, headerPairs: 50 },
}).single('attachment');

/**
 * Optional single image upload for POST /tickets (multipart). Only the
 * "attachment" file field and the known text fields are accepted; multer
 * errors become PT-BR { detail } responses. JSON requests pass through.
 */
@Injectable()
export class TicketUploadInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    if (req.is('multipart/form-data')) {
      await new Promise<void>((resolve, reject) => {
        parser(req, http.getResponse<Response>(), (error: unknown) => {
          if (!error) return resolve();
          const code = (error as { code?: string }).code;
          if (code === 'LIMIT_FILE_SIZE') return reject(new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'A imagem deve ter até 5 MB.'));
          if (code === 'LIMIT_UNEXPECTED_FILE' || code === 'LIMIT_FILE_COUNT') {
            return reject(new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'Anexo inválido'));
          }
          reject(new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'Confira os campos obrigatórios, setores, categorias e limites de tamanho.'));
        });
      });
    }
    return next.handle();
  }
}
