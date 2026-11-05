import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ValidationError } from '../domain/errors.js';

/** Validates a request part with a shared zod schema; usage: `@Body(new ZodPipe(Schema))`. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError(
        'Request validation failed',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}
