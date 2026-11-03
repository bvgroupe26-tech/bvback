export const MOIS_LABELS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const;

export function moisLabel(mois: number | string): string {
  const n = typeof mois === 'string' ? parseInt(mois, 10) : mois;
  return MOIS_LABELS[n - 1] ?? String(mois);
}

export function periodeLabel(mois: number | string, annee: number): string {
  return `${moisLabel(mois)} ${annee}`;
}

/** Espace simple (et non U+202F de Intl) : les polices standard pdfkit sont en WinAnsi. */
export function formatNombre(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatFcfa(value: number): string {
  return `${formatNombre(value)} FCFA`;
}

export function formatTaux(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const fixed = Number(value.toFixed(3));
  return `${fixed.toString().replace('.', ',')} %`;
}

export function formatDateFr(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function anciennete(
  dateEmbauche: Date | string | null | undefined,
  dateRef: Date,
): string {
  if (!dateEmbauche) return '—';
  const debut = typeof dateEmbauche === 'string' ? new Date(dateEmbauche) : dateEmbauche;
  if (Number.isNaN(debut.getTime()) || debut > dateRef) return '—';
  let mois =
    (dateRef.getUTCFullYear() - debut.getUTCFullYear()) * 12 +
    (dateRef.getUTCMonth() - debut.getUTCMonth());
  if (dateRef.getUTCDate() < debut.getUTCDate()) mois -= 1;
  mois = Math.max(0, mois);
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  const parts: string[] = [];
  if (ans > 0) parts.push(`${ans} an${ans > 1 ? 's' : ''}`);
  if (reste > 0 || ans === 0) parts.push(`${reste} mois`);
  return parts.join(' ');
}

/** « Jean-Paul Dupont » → « J*** D*** » : seule donnée nominative de la page de vérification. */
export function maskName(prenom: string | null | undefined, nom: string | null | undefined): string {
  const mask = (s: string | null | undefined) => {
    const t = (s ?? '').trim();
    return t ? `${t.charAt(0).toUpperCase()}***` : '';
  };
  return [mask(prenom), mask(nom)].filter(Boolean).join(' ') || '***';
}

/** Garde les 4 derniers caractères significatifs d'un RIB ou d'un numéro de téléphone. */
export function maskAccount(value: string | null | undefined): string {
  const compact = (value ?? '').replace(/\s+/g, '');
  if (!compact) return '—';
  if (compact.length <= 4) return '****';
  return `****${compact.slice(-4)}`;
}

const UNITES = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
];
const DIZAINES = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0..99 ; `final` = le nombre termine l'expression (accord de « quatre-vingts »). */
function deuxChiffres(n: number, final: boolean): string {
  if (n <= 16) return UNITES[n];
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    const prefix = d === 7 ? 'soixante' : 'quatre-vingt';
    const reste = n - (d === 7 ? 60 : 80);
    if (d === 7 && reste === 11) return 'soixante et onze';
    return `${prefix}-${deuxChiffres(reste, true)}`;
  }
  if (d === 8) {
    if (u === 0) return final ? 'quatre-vingts' : 'quatre-vingt';
    return `quatre-vingt-${UNITES[u]}`;
  }
  if (u === 0) return DIZAINES[d];
  if (u === 1) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** 0..999 ; `final` = vrai sauf devant « mille » (qui n'accorde ni « cent » ni « vingt »). */
function troisChiffres(n: number, final: boolean): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (c > 0) {
    if (c === 1) parts.push('cent');
    else parts.push(r === 0 && final ? `${UNITES[c]} cents` : `${UNITES[c]} cent`);
  }
  if (r > 0 || c === 0) parts.push(deuxChiffres(r, final));
  return parts.join(' ');
}

/** Montant entier en toutes lettres (orthographe traditionnelle), ex. 1 250 000 → « un million deux cent cinquante mille ». */
export function nombreEnLettres(value: number): string {
  let n = Math.round(Math.abs(value));
  if (n === 0) return 'zéro';
  const groupes: Array<[number, string, string]> = [
    [1_000_000_000, 'milliard', 'milliards'],
    [1_000_000, 'million', 'millions'],
  ];
  const parts: string[] = [];
  for (const [unite, sing, plur] of groupes) {
    const q = Math.floor(n / unite);
    if (q > 0) {
      parts.push(`${troisChiffres(q, true)} ${q > 1 ? plur : sing}`);
      n -= q * unite;
    }
  }
  const milliers = Math.floor(n / 1000);
  if (milliers > 0) {
    parts.push(milliers === 1 ? 'mille' : `${troisChiffres(milliers, false)} mille`);
    n -= milliers * 1000;
  }
  if (n > 0) parts.push(troisChiffres(n, true));
  const text = parts.join(' ');
  return value < 0 ? `moins ${text}` : text;
}

export function montantEnLettresFcfa(value: number): string {
  const text = nombreEnLettres(value);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} francs CFA`;
}
