export class MissingPayrollParameterError extends Error {
  readonly codes: string[];
  readonly aConfirmer: string[];

  constructor(manquants: string[], aConfirmer: string[] = []) {
    const parts: string[] = [];
    if (manquants.length) parts.push(`paramètres absents : ${manquants.join(', ')}`);
    if (aConfirmer.length) parts.push(`paramètres à confirmer : ${aConfirmer.join(', ')}`);
    super(`Calcul de paie impossible — ${parts.join(' ; ')}`);
    this.name = 'MissingPayrollParameterError';
    this.codes = [...manquants, ...aConfirmer];
    this.aConfirmer = aConfirmer;
  }
}

export class NetNegatifError extends Error {
  readonly net: number;

  constructor(net: number) {
    super(`Net à payer négatif (${net} FCFA) : vérifier les retenues et avances de la période`);
    this.name = 'NetNegatifError';
    this.net = net;
  }
}

export class PayrollRuleConfigError extends Error {
  readonly ruleCode: string;

  constructor(ruleCode: string, message: string) {
    super(`Rubrique ${ruleCode} : ${message}`);
    this.name = 'PayrollRuleConfigError';
    this.ruleCode = ruleCode;
  }
}
