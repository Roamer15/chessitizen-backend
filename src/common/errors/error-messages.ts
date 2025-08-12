import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes.enum';

export const ErrorMessages: Record<ErrorCode, { message: string; status: HttpStatus }> = {
  [ErrorCode.INTERNAL_SERVER_ERROR]: {
    message: 'Une erreur interne du serveur est survenue.',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  },
  [ErrorCode.UNAUTHORIZED]: {
    message: 'Authentification requise ou invalide.',
    status: HttpStatus.UNAUTHORIZED,
  },
  [ErrorCode.FORBIDDEN]: {
    message: "Vous n'avez pas la permission d'accéder à cette ressource.",
    status: HttpStatus.FORBIDDEN,
  },
  [ErrorCode.NOT_FOUND]: {
    message: 'La ressource demandée est introuvable.',
    status: HttpStatus.NOT_FOUND,
  },
  [ErrorCode.BAD_REQUEST]: {
    message: 'La requête est invalide.',
    status: HttpStatus.BAD_REQUEST,
  },
  [ErrorCode.VALIDATION_FAILED]: {
    message: 'La validation des données a échoué.',
    status: HttpStatus.BAD_REQUEST,
  },

  // Erreurs d'authentification/utilisateur
  [ErrorCode.EMAIL_ALREADY_USED]: {
    message: 'Cet email est déjà utilisé.',
    status: HttpStatus.CONFLICT,
  },
  [ErrorCode.USER_NOT_FOUND]: {
    message: 'Utilisateur non trouvé.',
    status: HttpStatus.NOT_FOUND,
  },
};
