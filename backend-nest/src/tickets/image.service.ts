import { HttpStatus, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { ApiError } from '../common/http/api-error';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
const ACCEPTED = new Set(['png', 'jpeg', 'webp']);

// Keep memory predictable on small instances: no libvips cache, one worker thread.
sharp.cache(false);
sharp.concurrency(1);

/**
 * Validates the real content (not the declared MIME type or name) and re-encodes
 * the pixels to WEBP, which drops metadata (EXIF/GPS), trailing payloads and polyglots.
 */
@Injectable()
export class ImageService {
  async sanitize(buffer: Buffer): Promise<Buffer> {
    if (buffer.length > MAX_IMAGE_BYTES) throw new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'A imagem deve ter até 5 MB.');
    const invalid = () => new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'Envie uma imagem PNG, JPG ou WEBP válida, de até 16 megapixels.');
    try {
      const options = { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' as const, animated: false };
      const meta = await sharp(buffer, options).metadata();
      if (!meta.format || !ACCEPTED.has(meta.format)) throw invalid();
      if (!meta.width || !meta.height || meta.width * meta.height > MAX_IMAGE_PIXELS) throw invalid();
      if (meta.pages !== undefined && meta.pages > 1) throw invalid();
      return await sharp(buffer, options).rotate().webp({ quality: 85 }).toBuffer();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw invalid();
    }
  }
}
