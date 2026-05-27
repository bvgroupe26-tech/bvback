import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/** Réponses communes aux routes protégées par JWT. */
export function ApiAuthResponses(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiResponse({
      status: 401,
      description: 'Non authentifié — JWT manquant, expiré ou invalide',
    }),
    ApiResponse({
      status: 403,
      description: 'Accès refusé — droits insuffisants',
    }),
  );
}

/** Erreur de validation class-validator. */
export function ApiBadRequestResponse(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiResponse({
      status: 400,
      description: 'Requête invalide — erreur de validation des données',
    }),
  );
}

/** Ressource introuvable. */
export function ApiNotFoundResponse(
  resource = 'Ressource',
): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiResponse({
      status: 404,
      description: `${resource} introuvable`,
    }),
  );
}

/** Succès sans corps (DELETE). */
export function ApiNoContentResponse(
  description = 'Suppression effectuée avec succès',
): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiResponse({ status: 204, description }),
  );
}

/** Liste ou détail — enveloppe { ok: true, data }. */
export function ApiOkDataResponse(
  description: string,
): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: `${description} (réponse : { ok: true, data })`,
    }),
  );
}

/** Création — enveloppe { ok: true, data }. */
export function ApiCreatedDataResponse(
  description: string,
): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiResponse({
      status: 201,
      description: `${description} (réponse : { ok: true, data })`,
    }),
  );
}
