import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import sharp from 'sharp';
import { ImageService, MAX_IMAGE_BYTES } from '../../src/tickets/image.service';
import { ApiError } from '../../src/common/http/api-error';

const images = new ImageService();
const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#ea580c' } });

test('re-encodes PNG, JPEG and WEBP to WEBP', async () => {
  for (const input of [await solid(40, 30).png().toBuffer(), await solid(40, 30).jpeg().toBuffer(), await solid(40, 30).webp().toBuffer()]) {
    const output = await images.sanitize(input);
    const meta = await sharp(output).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 40);
  }
});

test('strips EXIF/GPS metadata', async () => {
  const withExif = await solid(10, 10).jpeg().withExif({ IFD0: { Copyright: 'segredo' } }).toBuffer();
  assert.ok((await sharp(withExif).metadata()).exif);
  const output = await images.sanitize(withExif);
  assert.equal((await sharp(output).metadata()).exif, undefined);
});

test('rejects fake images, unsupported formats and pixel bombs', async () => {
  const reject = async (buffer: Buffer, status: number) => {
    await assert.rejects(images.sanitize(buffer), (error: unknown) => error instanceof ApiError && error.getStatus() === status);
  };
  await reject(Buffer.from('<?php system($_GET["c"]); ?>'), 422);
  await reject(await solid(10, 10).gif().toBuffer(), 422);
  await reject(await solid(10, 10).tiff().toBuffer(), 422);
  await reject(await solid(5000, 4000).png({ compressionLevel: 9 }).toBuffer(), 422);
  await reject(Buffer.alloc(MAX_IMAGE_BYTES + 1), 413);
});

test('rejects truncated files', async () => {
  const png = await solid(200, 200).png().toBuffer();
  await assert.rejects(images.sanitize(png.subarray(0, png.length / 2)));
});
