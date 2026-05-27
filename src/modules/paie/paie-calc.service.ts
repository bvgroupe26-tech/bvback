import { Injectable } from '@nestjs/common';

export interface CalcInput {
  salaireBase: number;
  primeTransport: number;
  primeLogement: number;
  primePerformance: number;
  autresPrimes: number;
  defTauxCnss: number | null;
  defTauxImpot: number | null;
  autresRetenues: number;
  cnssManuel?: number | null;
  impotManuel?: number | null;
}

export interface CalcResult {
  brut: number;
  cnss: number;
  impot: number;
  salaireNet: number;
}

@Injectable()
export class PaieCalcService {
  calcSalaireNet(input: CalcInput): CalcResult {
    const {
      salaireBase,
      primeTransport,
      primeLogement,
      primePerformance,
      autresPrimes,
      defTauxCnss,
      defTauxImpot,
      autresRetenues,
      cnssManuel,
      impotManuel,
    } = input;

    const brut =
      salaireBase +
      primeTransport +
      primeLogement +
      primePerformance +
      autresPrimes;

    const cnss =
      cnssManuel != null
        ? Math.round(cnssManuel)
        : defTauxCnss != null
          ? Math.round(salaireBase * defTauxCnss)
          : 0;

    const impot =
      impotManuel != null
        ? Math.round(impotManuel)
        : defTauxImpot != null
          ? Math.round(brut * defTauxImpot)
          : 0;

    const salaireNet = Math.round(brut - cnss - impot - autresRetenues);

    return { brut, cnss, impot, salaireNet };
  }
}
