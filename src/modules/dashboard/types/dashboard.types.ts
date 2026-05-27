export interface DashboardStatsResponse {
  employes: {
    total: number;
    actifs: number;
    nouveauxCeMois: number;
  };
  presences: {
    tauxAujourdhui: number;
    presents: number;
    absents: number;
  };
  paie: {
    masseSalarialeTotal: number;
    bulletinsEnAttente: number;
  };
  recrutement: {
    offresOuvertes: number;
    candidaturesEnCours: number;
  };
}

export interface PublicStatsResponse {
  employes: {
    total: number;
    actifs: number;
  };
  presences: {
    tauxAujourdhui: number;
  };
  recrutement: {
    offresOuvertes: number;
    candidaturesEnCours: number;
  };
}

export interface PresencesChartDay {
  date: string;
  presents: number;
  absents: number;
  retards: number;
}

export interface DepartementStats {
  departement: string;
  effectif: number;
  masseSalariale: number;
  tauxPresence: number;
}

export interface RecrutementPipeline {
  recu: number;
  en_cours: number;
  retenu: number;
  rejete: number;
}

export interface ActiviteRecente {
  id: number;
  type: string;
  description: string;
  createdAt: Date;
  employe: {
    nom: string;
    prenom: string;
  } | null;
}

export interface EmployeeDashboardResponse {
  employe: {
    id: number;
    nom: string;
    prenom: string;
    poste: string | null;
    departement: string | null;
  };
  conges: {
    soldeRestant: number;
    demandesEnCours: number;
  };
  dernierePaie: {
    mois: string;
    annee: number;
    salaireNet: number | null;
  } | null;
  notificationsNonLues: number;
}

export interface StatistiquesSyntheseResponse {
  effectifs: {
    total: number;
    actifs: number;
    inactifs: number;
    suspendus: number;
  };
  paie: {
    masseSalariale12mois: Array<{
      mois: string;
      annee: number;
      montant: number;
    }>;
  };
  presences: {
    tauxMoyen30j: number;
  };
  formations: {
    total: number;
    certifications: number;
  };
  evaluations: {
    moyenneGlobale: number;
  };
}
