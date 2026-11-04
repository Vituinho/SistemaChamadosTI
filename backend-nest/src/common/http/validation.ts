import { ValidationError, ValidationPipe } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { validationFailed } from './api-error';

function flatten(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap(error => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    return error.children?.length ? flatten(error.children, path) : [path];
  });
}

/**
 * Global DTO validation: unknown properties are rejected (like the legacy
 * Pydantic extra="forbid"), payloads are transformed into DTO instances and
 * failures return 422 { detail, fields } without echoing the received values.
 */
export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    stopAtFirstError: true,
    exceptionFactory: errors => validationFailed([...new Set(flatten(errors))]),
  });
}

/** Trims strings; leaves other types untouched so validators can reject them. */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Optional text: null/undefined become '' and strings are trimmed. */
export const OptionalText = () =>
  Transform(({ value }) => (value === null || value === undefined ? '' : typeof value === 'string' ? value.trim() : value));

/** Optional enum-like value: null/'' become undefined. */
export const OptionalValue = () => Transform(({ value }) => (value === null || value === '' ? undefined : value));
