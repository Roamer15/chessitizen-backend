import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes.enum';
import { ErrorMessages } from './error-messages';

export function throwHttpError(code: ErrorCode, details?: Record<string, any>): never {
  const error = ErrorMessages[code];

  throw new HttpException(
    {
      code,
      error: error.message,
      ...(details ? { details } : {}),
    },
    error.status,
  );
}
