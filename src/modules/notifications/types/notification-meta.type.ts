export interface NotificationMeta {
  absenceId?: number;
  paieId?: number;
  employeId?: number;
  mois?: string;
  annee?: number;
  statut?: string;
  [key: string]: unknown;
}
