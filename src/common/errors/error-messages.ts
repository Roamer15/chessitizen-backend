import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes.enum';

export const ErrorMessages: Record<ErrorCode, { message: string; status: HttpStatus }> = {
  [ErrorCode.INTERNAL_SERVER_ERROR]: {
    message: 'An internal server error occurred.',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  },
  [ErrorCode.UNAUTHORIZED]: {
    message: 'Authentication required or invalid.',
    status: HttpStatus.UNAUTHORIZED,
  },
  [ErrorCode.FORBIDDEN]: {
    message: 'You do not have permission to access this resource.',
    status: HttpStatus.FORBIDDEN,
  },
  [ErrorCode.NOT_FOUND]: {
    message: 'The requested resource was not found.',
    status: HttpStatus.NOT_FOUND,
  },
  [ErrorCode.BAD_REQUEST]: {
    message: 'The request is invalid.',
    status: HttpStatus.BAD_REQUEST,
  },
  [ErrorCode.VALIDATION_FAILED]: {
    message: 'Data validation failed.',
    status: HttpStatus.BAD_REQUEST,
  },

  // Authentication/user errors
  [ErrorCode.EMAIL_ALREADY_USED]: {
    message: 'This email is already in use.',
    status: HttpStatus.CONFLICT,
  },
  [ErrorCode.USER_NOT_FOUND]: {
    message: 'User not found.',
    status: HttpStatus.NOT_FOUND,
  },
  [ErrorCode.TOO_MANY_REQUESTS]: {
    message: 'OTP limit reached.',
    status: HttpStatus.TOO_MANY_REQUESTS,
  },
  [ErrorCode.INVALID_OTP]: {
    message: 'Invalid OTP.',
    status: HttpStatus.UNAUTHORIZED,
  },
  [ErrorCode.INVALID_CREDENTIALS]: {
    message: 'Invalid email.',
    status: HttpStatus.UNAUTHORIZED,
  },
  [ErrorCode.CACHE_ATTEMPT_FAILED]: {
    message: 'Redis attempt failed.',
    status: HttpStatus.CONFLICT,
  },
  [ErrorCode.GAME_NOT_FOUND]: {
    message: 'Game not found',
    status: HttpStatus.NOT_FOUND,
  },
  [ErrorCode.GAME_INVALID]: {
    message: 'Game already ended',
    status: HttpStatus.BAD_REQUEST,
  },
  [ErrorCode.NOT_YOUR_GAME]: {
    message: 'You are not a participant in this game',
    status: HttpStatus.FORBIDDEN,
  },

  [ErrorCode.INVALID_MOVE]: {
    message: 'Invalid move',
    status: HttpStatus.BAD_REQUEST,
  },
  [ErrorCode.NOT_YOUR_TURN]: {
    message: 'Not your turn',
    status: HttpStatus.FORBIDDEN,
  },
  [ErrorCode.NO_MOVES_TO_UNDO]: {
    message: 'No moves available for undo',
    status: HttpStatus.CONFLICT,
  },
  [ErrorCode.UNAUTHORIZED_MOVE]: {
    message: 'You cannot undo this move',
    status: HttpStatus.BAD_REQUEST,
  },
};
