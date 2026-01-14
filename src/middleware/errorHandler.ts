import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { config } from '../config/env';
import crypto from 'crypto';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errorId = (() => {
    try {
      return crypto.randomUUID();
    } catch {
      return `err_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  })();

  // Log error
  console.error('Error:', {
    errorId,
    message: err.message,
    stack: config.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Handle known AppError
  if (err instanceof AppError) {
    const response: any = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    // Add details for 409 conflicts with reasons
    if (err.statusCode === 409 && err.details) {
      response.error.reason = err.details.reason || err.details;
      response.error.details = err.details;
    } else if (err.details) {
      response.error.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // Handle unknown errors
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      errorId,
      message: config.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message,
    },
  });
};


