import { Response } from 'express';

// ============================================
// STANDARDIZED API ERROR RESPONSES
// ============================================

export interface ApiError {
  error: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Error codes for consistent error handling
export const ErrorCodes = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE: 'UNPROCESSABLE_ENTITY',
  INTERNAL_ERROR: 'INTERNAL_SERVER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE: 'DUPLICATE_RESOURCE',
} as const;

// ============================================
// ERROR RESPONSE BUILDERS
// ============================================

export function badRequest(
  res: Response,
  message: string,
  details?: Record<string, unknown>
): Response {
  return res.status(400).json({
    error: 'Bad Request',
    code: ErrorCodes.BAD_REQUEST,
    message,
    ...(details && { details }),
  });
}

export function unauthorized(res: Response, message: string = 'Unauthorized'): Response {
  return res.status(401).json({
    error: 'Unauthorized',
    code: ErrorCodes.UNAUTHORIZED,
    message,
  });
}

export function forbidden(res: Response, message: string = 'Forbidden'): Response {
  return res.status(403).json({
    error: 'Forbidden',
    code: ErrorCodes.FORBIDDEN,
    message,
  });
}

export function notFound(res: Response, resource: string): Response {
  return res.status(404).json({
    error: 'Not Found',
    code: ErrorCodes.NOT_FOUND,
    message: `${resource} not found`,
  });
}

export function conflict(
  res: Response,
  message: string,
  details?: Record<string, unknown>
): Response {
  return res.status(409).json({
    error: 'Conflict',
    code: ErrorCodes.CONFLICT,
    message,
    ...(details && { details }),
  });
}

export function unprocessable(
  res: Response,
  message: string,
  details?: Record<string, unknown>
): Response {
  return res.status(422).json({
    error: 'Unprocessable Entity',
    code: ErrorCodes.UNPROCESSABLE,
    message,
    ...(details && { details }),
  });
}

export function validationError(
  res: Response,
  errors: Array<{ field: string; message: string }>
): Response {
  return res.status(400).json({
    error: 'Validation Error',
    code: ErrorCodes.VALIDATION_ERROR,
    message: 'Request validation failed',
    details: { errors },
  });
}

export function serverError(
  res: Response,
  message: string = 'An unexpected error occurred',
  error?: Error
): Response {
  // Log the actual error for debugging
  if (error) {
    console.error('Server Error:', error);
  }

  return res.status(500).json({
    error: 'Internal Server Error',
    code: ErrorCodes.INTERNAL_ERROR,
    message: process.env.NODE_ENV === 'development' ? message : 'An unexpected error occurred',
  });
}

// ============================================
// SUCCESS RESPONSE BUILDERS
// ============================================

export function success<T>(res: Response, data: T, statusCode: number = 200): Response {
  return res.status(statusCode).json(data);
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json(data);
}

export function accepted<T>(res: Response, data: T): Response {
  return res.status(202).json(data);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

// ============================================
// PRISMA ERROR HANDLER
// ============================================

export function handlePrismaError(res: Response, error: any, context: string): Response {
  // Unique constraint violation
  if (error.code === 'P2002') {
    const fields = error.meta?.target?.join(', ') || 'field';
    return conflict(res, `A ${context} with this ${fields} already exists`, {
      constraintFields: error.meta?.target,
    });
  }

  // Record not found
  if (error.code === 'P2025') {
    return notFound(res, context);
  }

  // Foreign key constraint failed
  if (error.code === 'P2003') {
    return unprocessable(res, `Cannot complete operation: related ${context} reference is invalid`, {
      field: error.meta?.field_name,
    });
  }

  // Required field missing
  if (error.code === 'P2012') {
    return badRequest(res, `Missing required field for ${context}`, {
      field: error.meta?.column,
    });
  }

  // Default to server error
  return serverError(res, `Failed to process ${context}`, error);
}
