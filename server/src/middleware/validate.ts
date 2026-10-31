import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export interface ValidateSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemaOrSchemas: ZodSchema | ValidateSchemas) {
  const isSingleSchema = typeof (schemaOrSchemas as ZodSchema).safeParse === 'function';
  const schemas: ValidateSchemas = isSingleSchema
    ? { body: schemaOrSchemas as ZodSchema }
    : (schemaOrSchemas as ValidateSchemas);

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: err.issues[0]?.message || 'Request validation failed.',
            details: err.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message
            }))
          }
        });
        return;
      }
      next(err);
    }
  };
}
