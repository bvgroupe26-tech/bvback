import { Transform } from 'class-transformer';

/** Évite les erreurs de validation quand le front envoie "" sur un champ optionnel. */
export function EmptyStringToUndefined(): PropertyDecorator {
  return Transform(({ value }) => (value === '' ? undefined : value));
}
