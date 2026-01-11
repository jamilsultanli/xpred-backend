export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, reason?: string) {
    super(409, 'CONFLICT', message, reason ? { reason } : undefined);
  }
}

export class InsufficientFundsError extends AppError {
  constructor(currency: string) {
    super(400, 'INSUFFICIENT_FUNDS', `Insufficient ${currency} balance`);
  }
}

export class PredictionResolvedError extends AppError {
  constructor() {
    super(400, 'PREDICTION_RESOLVED', 'Prediction is already resolved');
  }
}

export class UserBannedError extends AppError {
  constructor() {
    super(403, 'USER_BANNED', 'User account is banned');
  }
}

export class KYCRequiredError extends AppError {
  constructor() {
    super(403, 'KYC_REQUIRED', 'KYC verification required');
  }
}


