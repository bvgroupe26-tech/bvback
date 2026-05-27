import { type TypeContrat } from '../../../prisma/type-contrat';

export interface EmployesStatsResponse {
  total: number;
  actifs: number;
  inactifs: number;
  suspendus: number;
  parDepartement: Array<{ departement: string; count: number }>;
  parContrat: Array<{ typeContrat: TypeContrat; count: number }>;
  masseSalariale: number;
}

export interface DepartementCount {
  departement: string;
  count: number;
}

export interface ContratCount {
  typeContrat: TypeContrat;
  count: number;
}
