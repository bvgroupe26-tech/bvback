import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

interface AbsenceDateFields {
  dateDebut?: string;
  dateFin?: string;
}

@ValidatorConstraint({ name: 'absenceDateRange', async: false })
export class AbsenceDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as AbsenceDateFields;
    const { dateDebut, dateFin } = object;

    if (!dateDebut || !dateFin) {
      return true;
    }

    return new Date(dateFin).getTime() >= new Date(dateDebut).getTime();
  }

  defaultMessage(): string {
    return 'dateFin doit être postérieure ou égale à dateDebut';
  }
}
