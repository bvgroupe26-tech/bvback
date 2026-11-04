import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DocumentRh,
  Prisma,
  StatutPaie,
  TypeBulletin,
  TypeDocumentRh,
  TypeRubrique,
} from '@prisma/client';
import * as path from 'path';
import { PrivateBucketStorage } from '../../../common/storage/private-bucket.storage';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { computeLeaveBalance, LeaveBalance } from '../../absences/leave-balance';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  anciennete,
  formatDateFr,
  formatFcfa,
  formatNombre,
  formatTaux,
  maskAccount,
  maskName,
  montantEnLettresFcfa,
  periodeLabel,
} from './payslip-format';
import { computePayslipHash } from './payslip-hash';
import {
  EmployeSnapshot,
  EmployeurSnapshot,
  resolveEmployeSnapshot,
  resolveEmployeurSnapshot,
} from './payslip-snapshot';

const paieInclude = {
  employe: true,
  lignes: { orderBy: [{ ordre: 'asc' }, { code: 'asc' }] },
  annuleBulletin: { select: { numero: true } },
  contreBulletins: { where: { deletedAt: null }, select: { id: true, numero: true } },
} satisfies Prisma.PaieInclude;

type PaieFull = Prisma.PaieGetPayload<{ include: typeof paieInclude }>;

interface LigneVue {
  code: string;
  libelle: string;
  type: TypeRubrique;
  base: number | null;
  taux: number | null;
  quantite: number | null;
  gain: number;
  retenue: number;
  patronal: number;
}

interface TotauxVue {
  brut: number;
  cotisationsSalariales: number;
  autresRetenues: number;
  netImposable: number | null;
  impot: number | null;
  impotLabel: string;
  chargesPatronales: number;
  netAPayer: number;
}

interface CumulsVue {
  brut: number;
  netImposable: number | null;
  impots: number;
  net: number;
}

interface BulletinVue {
  paie: PaieFull;
  numero: string | null;
  legacy: boolean;
  employe: EmployeSnapshot;
  employeur: EmployeurSnapshot;
  lignes: LigneVue[];
  totaux: TotauxVue;
  cumuls: CumulsVue;
  conges: LeaveBalance | null;
  dateDebut: Date;
  dateFin: Date;
  annule: boolean;
  provisoire: boolean;
  hashCourt: string | null;
  verifyUrl: string | null;
}

const GROUPES: Array<{ type: TypeRubrique; titre: string }> = [
  { type: TypeRubrique.gain, titre: 'Rémunération' },
  { type: TypeRubrique.retenue, titre: 'Retenues' },
  { type: TypeRubrique.cotisation, titre: 'Cotisations sociales' },
  { type: TypeRubrique.impot, titre: 'Impôts et taxes' },
  { type: TypeRubrique.info, titre: 'Informations' },
];

const MODE_PAIEMENT_LABELS: Record<string, string> = {
  especes: 'Espèces',
  virement: 'Virement',
  cheque: 'Chèque',
  mobile_money: 'Mobile Money',
  carte: 'Carte',
};

const SITUATION_LABELS: Record<string, string> = {
  celibataire: 'Célibataire',
  marie: 'Marié(e)',
  divorce: 'Divorcé(e)',
  veuf: 'Veuf / veuve',
};

const C = {
  primary: '#1F3F73',
  accent: '#F2C94C',
  text: '#0F172A',
  muted: '#64748B',
  line: '#CBD5E1',
  fill: '#F1F5F9',
  fillAlt: '#F8FAFC',
};

const PAGE = { width: 595.28, height: 841.89, margin: 36 };
const CONTENT_W = PAGE.width - PAGE.margin * 2;
const ROW_H = 14;

const COLS = [
  { key: 'code', label: 'Code', width: 76, align: 'left' as const },
  { key: 'libelle', label: 'Libellé', width: 139, align: 'left' as const },
  { key: 'base', label: 'Base', width: 66, align: 'right' as const },
  { key: 'taux', label: 'Taux', width: 44, align: 'right' as const },
  { key: 'gain', label: 'Gains', width: 64, align: 'right' as const },
  { key: 'retenue', label: 'Retenues sal.', width: 66, align: 'right' as const },
  { key: 'patronal', label: 'Part patronale', width: CONTENT_W - 455, align: 'right' as const },
];

function num(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

function n0(v: Prisma.Decimal | number | null | undefined): number {
  return num(v) ?? 0;
}

function readNumber(obj: unknown, key: string): number | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const v = (obj as Record<string, unknown>)[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** pdfkit coupe les mots trop longs même avec lineBreak:false : on tronque à la largeur réelle. */
function fit(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function safeFileName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_');
}

@Injectable()
export class PayslipPdfService {
  private readonly logger = new Logger(PayslipPdfService.name);
  private readonly bulletinsStorage = new PrivateBucketStorage('bulletins-paie');

  constructor(private readonly prisma: PrismaService) {}

  async render(paieId: number): Promise<Buffer> {
    const vue = await this.buildVue(paieId);
    return this.draw(vue);
  }

  /** Génère le PDF et l'enregistre dans les documents RH du salarié (mis à jour s'il existe déjà). */
  async archive(paieId: number): Promise<DocumentRh> {
    const vue = await this.buildVue(paieId);
    const buffer = await this.draw(vue);
    const { paie } = vue;

    const fileName = safeFileName(
      `${vue.numero ?? `bulletin-${paie.annee}-${paie.mois.padStart(2, '0')}-${paie.id}`}.pdf`,
    );
    // Bucket privé : le disque Render est éphémère et /uploads est public.
    const relativePath = await this.bulletinsStorage.put(
      path.posix.join(String(paie.annee), fileName),
      buffer,
      'application/pdf',
    );

    const suffix =
      paie.type === TypeBulletin.rappel
        ? ' (rappel)'
        : paie.type === TypeBulletin.contre_bulletin
          ? ' (contre-bulletin)'
          : '';
    const titre = `Bulletin de paie — ${periodeLabel(paie.mois, paie.annee)}${suffix}`;

    const existing = await this.prisma.documentRh.findFirst({
      where: {
        employeId: paie.employeId,
        type: TypeDocumentRh.bulletin_paie,
        fichierPath: relativePath,
      },
    });
    if (existing) {
      return this.prisma.documentRh.update({
        where: { id: existing.id },
        data: { titre, taille: buffer.length },
      });
    }
    return this.prisma.documentRh.create({
      data: {
        employeId: paie.employeId,
        titre,
        type: TypeDocumentRh.bulletin_paie,
        fichierPath: relativePath,
        taille: buffer.length,
      },
    });
  }

  fileNameFor(paie: { numero: string | null; annee: number; mois: string; id: number }): string {
    return safeFileName(
      `bulletin-${paie.numero ?? `${paie.annee}-${paie.mois.padStart(2, '0')}-${paie.id}`}.pdf`,
    );
  }

  private async buildVue(paieId: number): Promise<BulletinVue> {
    const paie = await this.prisma.paie.findFirst({
      where: { id: paieId },
      include: paieInclude,
    });
    if (!paie) throw new NotFoundException(`Bulletin #${paieId} introuvable`);

    const settings = await this.prisma.employeurSettings.findUnique({ where: { id: 1 } });
    const employe = resolveEmployeSnapshot(paie.employeSnapshot, paie.employe);
    const employeur = resolveEmployeurSnapshot(paie.employeurSnapshot, settings);

    const moisNum = parseInt(paie.mois, 10);
    const dateDebut = new Date(Date.UTC(paie.annee, moisNum - 1, 1));
    const dateFin = new Date(Date.UTC(paie.annee, moisNum, 0));

    const legacy = paie.lignes.length === 0;
    const lignes = legacy ? this.legacyLignes(paie) : paie.lignes.map((l) => this.toLigneVue(l));
    const totaux = legacy ? this.legacyTotaux(paie, lignes) : this.v2Totaux(paie, lignes);
    const cumuls = await this.resolveCumuls(paie, totaux);

    let conges: LeaveBalance | null = null;
    try {
      conges = await computeLeaveBalance(this.prisma, paie.employe, paie.annee);
    } catch (err) {
      this.logger.warn(`Solde de congés indisponible pour le bulletin #${paie.id}: ${String(err)}`);
    }

    const annule = paie.statut === StatutPaie.annule || paie.contreBulletins.length > 0;
    const provisoire =
      paie.statut === StatutPaie.brouillon ||
      paie.statut === StatutPaie.calcule ||
      paie.statut === StatutPaie.en_attente;

    const hash = paie.hashSha256;

    return {
      paie,
      numero: paie.numero,
      legacy,
      employe,
      employeur,
      lignes,
      totaux,
      cumuls,
      conges,
      dateDebut,
      dateFin,
      annule,
      provisoire,
      hashCourt: hash ? hash.slice(0, 16) : null,
      verifyUrl: paie.numero ? this.verifyUrl(paie.numero) : null,
    };
  }

  private verifyUrl(numero: string): string | null {
    const base = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '')
      .split(',')[0]
      .trim()
      .replace(/\/$/, '');
    if (!base) return null;
    return `${base}/verify/paie/${encodeURIComponent(numero)}`;
  }

  private toLigneVue(l: PaieFull['lignes'][number]): LigneVue {
    const sal = n0(l.montantSalarial);
    const pat = n0(l.montantPatronal);
    const isGain = l.type === TypeRubrique.gain;
    return {
      code: l.code,
      libelle: l.libelle,
      type: l.type,
      base: num(l.base),
      taux: num(l.taux),
      quantite: num(l.quantite),
      gain: isGain ? sal : 0,
      retenue: isGain || l.type === TypeRubrique.info ? 0 : sal,
      patronal: l.type === TypeRubrique.info ? 0 : pat,
    };
  }

  private v2Totaux(paie: PaieFull, lignes: LigneVue[]): TotauxVue {
    const sum = (f: (l: LigneVue) => number, types?: TypeRubrique[]) =>
      lignes.filter((l) => !types || types.includes(l.type)).reduce((s, l) => s + f(l), 0);

    const gains = sum((l) => l.gain);
    const retenuesBrut = sum((l) => l.retenue, [TypeRubrique.retenue]);
    const cotisSal = num(paie.totalCotisSal) ?? sum((l) => l.retenue, [TypeRubrique.cotisation]);
    const impots = sum((l) => l.retenue, [TypeRubrique.impot]);
    const irppLigne = lignes.find((l) => l.code === 'IRPP');
    const brut = num(paie.brut) ?? gains - retenuesBrut;
    const net = num(paie.netAPayer) ?? gains - sum((l) => l.retenue);

    return {
      brut,
      cotisationsSalariales: cotisSal,
      // Retenues après brut (avances, prêts) : celles qui réduisent le brut y sont déjà incluses.
      autresRetenues: Math.max(0, Math.round(brut - cotisSal - impots - net)),
      netImposable: num(paie.netImposable),
      impot: irppLigne ? irppLigne.retenue : impots > 0 ? impots : null,
      impotLabel: irppLigne ? 'IRPP' : 'Impôts et taxes',
      chargesPatronales: num(paie.totalCotisPat) ?? sum((l) => l.patronal),
      netAPayer: net,
    };
  }

  private legacyLignes(paie: PaieFull): LigneVue[] {
    const gain = (code: string, libelle: string, montant: number): LigneVue => ({
      code,
      libelle,
      type: TypeRubrique.gain,
      base: null,
      taux: null,
      quantite: null,
      gain: montant,
      retenue: 0,
      patronal: 0,
    });
    const retenue = (code: string, libelle: string, type: TypeRubrique, montant: number): LigneVue => ({
      code,
      libelle,
      type,
      base: null,
      taux: null,
      quantite: null,
      gain: 0,
      retenue: montant,
      patronal: 0,
    });

    const lignes: LigneVue[] = [];
    const base = gain('SAL_BASE', 'Salaire de base', paie.salaireBase);
    if (paie.joursTravailles != null && paie.joursPeriode) {
      base.quantite = paie.joursTravailles;
      base.libelle = `Salaire de base (${paie.joursTravailles}/${paie.joursPeriode} j)`;
    }
    lignes.push(base);
    if (paie.primeTransport > 0) lignes.push(gain('IND_TRANSPORT', 'Prime de transport', paie.primeTransport));
    if (paie.primeLogement > 0) lignes.push(gain('IND_LOGEMENT', 'Prime de logement', paie.primeLogement));
    if (paie.primePerformance > 0) {
      lignes.push(gain('PRIME_PERFORMANCE', 'Prime de performance', paie.primePerformance));
    }
    if (paie.autresPrimes > 0) lignes.push(gain('AUTRES_PRIMES', 'Autres primes', paie.autresPrimes));
    if (paie.cnss > 0) lignes.push(retenue('CNSS', 'Cotisation CNSS', TypeRubrique.cotisation, paie.cnss));
    if (paie.impot > 0) lignes.push(retenue('IMPOT', 'Impôt retenu à la source', TypeRubrique.impot, paie.impot));
    if (paie.autresRetenues > 0) {
      lignes.push(retenue('AUTRES_RET', 'Autres retenues', TypeRubrique.retenue, paie.autresRetenues));
    }
    return lignes;
  }

  private legacyTotaux(paie: PaieFull, lignes: LigneVue[]): TotauxVue {
    const brut = lignes.reduce((s, l) => s + l.gain, 0);
    const retenues = lignes.reduce((s, l) => s + l.retenue, 0);
    return {
      brut,
      cotisationsSalariales: paie.cnss,
      autresRetenues: paie.autresRetenues,
      netImposable: null,
      impot: paie.impot > 0 ? paie.impot : null,
      impotLabel: 'Impôt retenu',
      chargesPatronales: 0,
      netAPayer: paie.salaireNet ?? brut - retenues,
    };
  }

  private async resolveCumuls(paie: PaieFull, totaux: TotauxVue): Promise<CumulsVue> {
    const stored = paie.cumuls;
    const brut = readNumber(stored, 'brut');
    const net = readNumber(stored, 'net');
    if (brut !== null && net !== null) {
      return {
        brut,
        netImposable: readNumber(stored, 'netImposable'),
        impots: readNumber(stored, 'irpp') ?? 0,
        net,
      };
    }

    const moisCourant = parseInt(paie.mois, 10);
    const autres = await this.prisma.paie.findMany({
      where: {
        employeId: paie.employeId,
        annee: paie.annee,
        id: { not: paie.id },
        statut: { not: StatutPaie.annule },
      },
      select: {
        mois: true,
        salaireBase: true,
        primeTransport: true,
        primeLogement: true,
        primePerformance: true,
        autresPrimes: true,
        impot: true,
        salaireNet: true,
        cnss: true,
        autresRetenues: true,
        brut: true,
        netAPayer: true,
        netImposable: true,
      },
    });
    const anterieurs = autres.filter((p) => parseInt(p.mois, 10) <= moisCourant);
    const cumul = anterieurs.reduce(
      (acc, p) => {
        const legacyBrut =
          p.salaireBase + p.primeTransport + p.primeLogement + p.primePerformance + p.autresPrimes;
        const b = num(p.brut) ?? legacyBrut;
        acc.brut += b;
        acc.net += num(p.netAPayer) ?? p.salaireNet ?? b - p.cnss - p.impot - p.autresRetenues;
        acc.impots += p.impot;
        const ni = num(p.netImposable);
        if (ni !== null) acc.netImposable = (acc.netImposable ?? 0) + ni;
        return acc;
      },
      { brut: 0, net: 0, impots: 0, netImposable: null as number | null },
    );
    return {
      brut: cumul.brut + totaux.brut,
      net: cumul.net + totaux.netAPayer,
      impots: cumul.impots + (totaux.impot ?? 0),
      netImposable:
        totaux.netImposable !== null ? (cumul.netImposable ?? 0) + totaux.netImposable : null,
    };
  }

  private async fetchLogo(url: string | null): Promise<Buffer | null> {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const type = res.headers.get('content-type') ?? '';
      if (!/image\/(png|jpe?g)/i.test(type)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > 2_000_000 ? null : buf;
    } catch {
      return null;
    }
  }

  private async draw(vue: BulletinVue): Promise<Buffer> {
    const logo = await this.fetchLogo(vue.employeur.logoUrl);
    const qr = vue.verifyUrl
      ? await QRCode.toBuffer(vue.verifyUrl, { margin: 0, width: 240, errorCorrectionLevel: 'M' })
      : null;

    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE.margin,
      bufferPages: true,
      info: {
        Title: `Bulletin de paie ${periodeLabel(vue.paie.mois, vue.paie.annee)}`,
        Author: vue.employeur.raisonSociale ?? 'BV Groupe',
        Subject: vue.numero ?? `Bulletin #${vue.paie.id}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    let y = this.drawHeader(doc, vue, logo);
    y = this.drawSalarie(doc, vue, y + 10);
    y = this.drawTable(doc, vue, y + 12);
    y = this.ensureSpace(doc, y + 10, 230);
    y = this.drawTotaux(doc, vue, y);
    this.drawFooter(doc, vue, y + 12, qr);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      if (vue.annule) this.watermark(doc, 'ANNULÉ', '#DC2626');
      else if (vue.provisoire) this.watermark(doc, 'PROVISOIRE', '#94A3B8');
      if (range.count > 1) {
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor(C.muted)
          .text(`Page ${i + 1} / ${range.count}`, PAGE.margin, PAGE.height - 24, {
            width: CONTENT_W,
            align: 'right',
            lineBreak: false,
          });
      }
    }

    doc.end();
    return done;
  }

  private watermark(doc: PDFKit.PDFDocument, text: string, color: string): void {
    doc.save();
    doc.rotate(-32, { origin: [PAGE.width / 2, PAGE.height / 2] });
    doc
      .font('Helvetica-Bold')
      .fontSize(88)
      .fillColor(color)
      .fillOpacity(0.1)
      .text(text, 0, PAGE.height / 2 - 50, { width: PAGE.width, align: 'center', lineBreak: false });
    doc.restore();
    doc.fillOpacity(1);
  }

  private drawHeader(doc: PDFKit.PDFDocument, vue: BulletinVue, logo: Buffer | null): number {
    const m = PAGE.margin;
    const e = vue.employeur;
    let textX = m;
    if (logo) {
      try {
        doc.image(logo, m, m, { fit: [56, 56] });
        textX = m + 66;
      } catch {
        textX = m;
      }
    }

    const leftW = CONTENT_W - 220 - (textX - m);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(C.primary)
      .text(e.raisonSociale || 'Raison sociale à renseigner', textX, m, { width: leftW });
    doc.font('Helvetica').fontSize(8).fillColor(C.text);
    const lignes = [
      [e.adresse, e.ville].filter(Boolean).join(', '),
      [e.telephone ? `Tél. ${e.telephone}` : null, e.email].filter(Boolean).join('  ·  '),
      [e.niu ? `NIU : ${e.niu}` : null, e.rccm ? `RCCM : ${e.rccm}` : null].filter(Boolean).join('  ·  '),
      e.numeroCnssEmployeur ? `N° CNSS employeur : ${e.numeroCnssEmployeur}` : null,
      e.conventionCollective ? `Convention collective : ${e.conventionCollective}` : null,
    ].filter((l): l is string => Boolean(l));
    for (const l of lignes) doc.text(l, textX, undefined, { width: leftW });
    const leftBottom = Math.max(doc.y, logo ? m + 56 : m);

    const boxW = 210;
    const boxX = m + CONTENT_W - boxW;
    doc.rect(boxX, m, boxW, 62).fill(C.primary);
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#FFFFFF')
      .text('BULLETIN DE PAIE', boxX, m + 9, { width: boxW, align: 'center', lineBreak: false });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(C.accent)
      .text(periodeLabel(vue.paie.mois, vue.paie.annee), boxX, m + 28, {
        width: boxW,
        align: 'center',
        lineBreak: false,
      });
    doc
      .fontSize(7.5)
      .fillColor('#FFFFFF')
      .text(
        `Du ${formatDateFr(vue.dateDebut)} au ${formatDateFr(vue.dateFin)}`,
        boxX,
        m + 43,
        { width: boxW, align: 'center', lineBreak: false },
      );

    let rightY = m + 68;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.text);
    doc.text(`N° ${vue.numero ?? `${vue.paie.annee}-${vue.paie.mois.padStart(2, '0')}-${vue.paie.id}`}`, boxX, rightY, {
      width: boxW,
      align: 'right',
    });
    rightY = doc.y;
    if (vue.paie.type !== TypeBulletin.normal) {
      const label =
        vue.paie.type === TypeBulletin.rappel
          ? 'RAPPEL DE SALAIRE'
          : `CONTRE-BULLETIN${vue.paie.annuleBulletin?.numero ? ` — annule le n° ${vue.paie.annuleBulletin.numero}` : ''}`;
      doc.fillColor('#B45309').text(label, boxX, rightY, { width: boxW, align: 'right' });
      rightY = doc.y;
    }
    if (vue.paie.datePaiement) {
      doc
        .font('Helvetica')
        .fillColor(C.muted)
        .text(`Payé le ${formatDateFr(vue.paie.datePaiement)}`, boxX, rightY, { width: boxW, align: 'right' });
      rightY = doc.y;
    }

    return Math.max(leftBottom, rightY);
  }

  private drawSalarie(doc: PDFKit.PDFDocument, vue: BulletinVue, y: number): number {
    const s = vue.employe;
    const m = PAGE.margin;
    const situation = s.situationFamiliale ? SITUATION_LABELS[s.situationFamiliale] ?? s.situationFamiliale : '—';
    const enfants = s.nombreEnfants > 0 ? ` · ${s.nombreEnfants} enfant${s.nombreEnfants > 1 ? 's' : ''}` : '';
    const jours =
      vue.paie.joursTravailles != null && vue.paie.joursPeriode
        ? `${vue.paie.joursTravailles} / ${vue.paie.joursPeriode}`
        : '—';

    const left: Array<[string, string]> = [
      ['Salarié', `${s.prenom} ${s.nom}`.trim()],
      ['Matricule', s.matricule ?? '—'],
      ['Emploi', s.poste ?? '—'],
      ['Département', s.departement ?? '—'],
      ['Catégorie / échelon', [s.categorie, s.echelon].filter(Boolean).join(' / ') || '—'],
      ['Situation familiale', `${situation}${enfants}`],
    ];
    const right: Array<[string, string]> = [
      ["Date d'embauche", formatDateFr(s.dateEmbauche)],
      ['Ancienneté', anciennete(s.dateEmbauche, vue.dateFin)],
      ['N° CNSS', s.numeroCnss ?? '—'],
      ['NIU', s.niu ?? '—'],
      ['Jours travaillés', jours],
      ['Type', vue.legacy ? 'Bulletin simplifié' : 'Bulletin détaillé'],
    ];

    const lineH = 12.5;
    const h = left.length * lineH + 14;
    doc.roundedRect(m, y, CONTENT_W, h, 4).fillAndStroke(C.fillAlt, C.line);
    const colW = CONTENT_W / 2;
    const drawCol = (pairs: Array<[string, string]>, x: number) => {
      pairs.forEach(([label, value], i) => {
        const ly = y + 8 + i * lineH;
        doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(label, x, ly, { width: 92, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text);
        doc.text(fit(doc, value, colW - 110), x + 94, ly - 0.5, { width: colW - 110, lineBreak: false });
      });
    };
    drawCol(left, m + 10);
    drawCol(right, m + colW + 6);
    return y + h;
  }

  private drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
    const m = PAGE.margin;
    doc.rect(m, y, CONTENT_W, ROW_H + 2).fill(C.primary);
    let x = m;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');
    for (const col of COLS) {
      doc.text(col.label, x + 4, y + 4.5, { width: col.width - 8, align: col.align, lineBreak: false });
      x += col.width;
    }
    return y + ROW_H + 2;
  }

  private drawRow(
    doc: PDFKit.PDFDocument,
    y: number,
    values: Record<string, string>,
    opts: { bold?: boolean; fill?: string; italic?: boolean } = {},
  ): number {
    const m = PAGE.margin;
    if (opts.fill) doc.rect(m, y, CONTENT_W, ROW_H).fill(opts.fill);
    const font = opts.bold ? 'Helvetica-Bold' : opts.italic ? 'Helvetica-Oblique' : 'Helvetica';
    doc.font(font).fontSize(7.8).fillColor(C.text);
    let x = m;
    for (const col of COLS) {
      const v = values[col.key];
      if (v) {
        if (col.key === 'code') doc.fontSize(7);
        doc.text(fit(doc, v, col.width - 8), x + 4, y + 3.8, {
          width: col.width - 8,
          align: col.align,
          lineBreak: false,
        });
        if (col.key === 'code') doc.fontSize(7.8);
      }
      x += col.width;
    }
    doc
      .moveTo(m, y + ROW_H)
      .lineTo(m + CONTENT_W, y + ROW_H)
      .lineWidth(0.4)
      .strokeColor(C.line)
      .stroke();
    return y + ROW_H;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
    if (y + needed <= PAGE.height - PAGE.margin - 14) return y;
    doc.addPage();
    return PAGE.margin;
  }

  private drawTable(doc: PDFKit.PDFDocument, vue: BulletinVue, startY: number): number {
    let y = this.drawTableHeader(doc, startY);
    const bottom = PAGE.height - PAGE.margin - 20;
    const fmt = (v: number) => (v ? formatNombre(v) : '');

    const nextRow = () => {
      if (y + ROW_H > bottom) {
        doc.addPage();
        y = this.drawTableHeader(doc, PAGE.margin);
      }
    };

    for (const groupe of GROUPES) {
      const lignes = vue.lignes.filter((l) => l.type === groupe.type);
      if (lignes.length === 0) continue;
      nextRow();
      y = this.drawRow(doc, y, { libelle: groupe.titre.toUpperCase() }, { bold: true, fill: C.fill });
      for (const l of lignes) {
        nextRow();
        const base =
          l.base !== null
            ? formatNombre(l.base)
            : l.quantite !== null && groupe.type !== TypeRubrique.gain
              ? formatNombre(l.quantite)
              : '';
        y = this.drawRow(doc, y, {
          code: l.code,
          libelle: l.libelle,
          base,
          taux: formatTaux(l.taux),
          gain: fmt(l.gain),
          retenue: fmt(l.retenue),
          patronal: fmt(l.patronal),
        });
      }
      if (groupe.type !== TypeRubrique.info && lignes.length > 1) {
        nextRow();
        y = this.drawRow(
          doc,
          y,
          {
            libelle: `Sous-total ${groupe.titre.toLowerCase()}`,
            gain: fmt(lignes.reduce((s, l) => s + l.gain, 0)),
            retenue: fmt(lignes.reduce((s, l) => s + l.retenue, 0)),
            patronal: fmt(lignes.reduce((s, l) => s + l.patronal, 0)),
          },
          { italic: true },
        );
      }
    }
    return y;
  }

  private drawTotaux(doc: PDFKit.PDFDocument, vue: BulletinVue, y: number): number {
    const m = PAGE.margin;
    const t = vue.totaux;
    const rows: Array<[string, number]> = [['Salaire brut', t.brut]];
    rows.push(['Cotisations salariales', t.cotisationsSalariales]);
    if (t.autresRetenues > 0) rows.push(['Autres retenues', t.autresRetenues]);
    if (t.netImposable !== null) rows.push(['Net imposable', t.netImposable]);
    if (t.impot !== null) rows.push([t.impotLabel, t.impot]);
    if (t.chargesPatronales > 0) rows.push(['Charges patronales (pour information)', t.chargesPatronales]);

    const leftW = CONTENT_W - 200;
    let ly = y;
    rows.forEach(([label, value], i) => {
      if (i % 2 === 0) doc.rect(m, ly, leftW, 15).fill(C.fillAlt);
      doc.font('Helvetica').fontSize(8.5).fillColor(C.text).text(label, m + 8, ly + 4, {
        width: leftW - 120,
        lineBreak: false,
      });
      doc.font('Helvetica-Bold').text(formatFcfa(value), m + leftW - 120, ly + 4, {
        width: 112,
        align: 'right',
        lineBreak: false,
      });
      ly += 15;
    });

    const boxX = m + leftW + 12;
    const boxW = 188;
    const boxH = Math.max(58, rows.length * 15);
    doc.roundedRect(boxX, y, boxW, boxH, 4).fill(C.primary);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(C.accent)
      .text('NET À PAYER', boxX, y + boxH / 2 - 18, { width: boxW, align: 'center', lineBreak: false });
    doc
      .fontSize(17)
      .fillColor('#FFFFFF')
      .text(formatFcfa(t.netAPayer), boxX, y + boxH / 2 - 4, { width: boxW, align: 'center', lineBreak: false });

    const bottom = Math.max(ly, y + boxH) + 8;
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(C.text)
      .text(
        `Arrêté le présent bulletin à la somme nette de : ${montantEnLettresFcfa(t.netAPayer)}.`,
        m,
        bottom,
        { width: CONTENT_W },
      );
    return doc.y;
  }

  private drawFooter(doc: PDFKit.PDFDocument, vue: BulletinVue, y: number, qr: Buffer | null): void {
    const m = PAGE.margin;
    const qrW = qr ? 92 : 0;
    const gap = 8;
    const boxW = (CONTENT_W - qrW - gap * (qr ? 3 : 2)) / 3;
    const boxH = 80;

    const box = (x: number, titre: string, rows: Array<[string, string]>) => {
      doc.roundedRect(x, y, boxW, boxH, 4).lineWidth(0.6).strokeColor(C.line).stroke();
      doc.font('Helvetica-Bold').fontSize(7.8).fillColor(C.primary).text(titre, x + 7, y + 6, {
        width: boxW - 14,
        lineBreak: false,
      });
      rows.forEach(([label, value], i) => {
        const ry = y + 20 + i * 13;
        const labelW = boxW * 0.36;
        const valueW = boxW - labelW - 14;
        doc.font('Helvetica').fontSize(7.3).fillColor(C.muted);
        doc.text(fit(doc, label, labelW), x + 7, ry, { width: labelW, lineBreak: false });
        doc.font('Helvetica-Bold').fillColor(C.text);
        doc.text(fit(doc, value, valueW), x + 7 + labelW, ry, {
          width: valueW,
          align: 'right',
          lineBreak: false,
        });
      });
    };

    const c = vue.cumuls;
    const cumulRows: Array<[string, string]> = [['Brut', formatFcfa(c.brut)]];
    if (c.netImposable !== null) cumulRows.push(['Net imposable', formatFcfa(c.netImposable)]);
    cumulRows.push(['Impôts', formatFcfa(c.impots)]);
    cumulRows.push(['Net payé', formatFcfa(c.net)]);
    box(m, `Cumuls ${vue.paie.annee}`, cumulRows);

    const cg = vue.conges;
    box(
      m + boxW + gap,
      `Congés ${vue.paie.annee} (jours ouvrés)`,
      cg
        ? [
            ['Acquis', String(cg.droitAnnuel)],
            ['Pris', String(cg.congesPayesPris)],
            ['En attente', String(cg.enAttente)],
            ['Restants', String(cg.soldeRestant)],
          ]
        : [['Solde', 'indisponible']],
    );

    const s = vue.employe;
    const modeLabel = s.modePaiement ? MODE_PAIEMENT_LABELS[s.modePaiement] ?? s.modePaiement : 'Non renseigné';
    const payRows: Array<[string, string]> = [['Mode', modeLabel]];
    if (s.modePaiement === 'virement' || s.modePaiement === 'cheque') {
      if (s.banque) payRows.push(['Banque', s.banque]);
      if (s.rib) payRows.push(['Compte', maskAccount(s.rib)]);
    } else if (s.modePaiement === 'mobile_money' && s.mobileMoney) {
      payRows.push(['Numéro', maskAccount(s.mobileMoney)]);
    }
    payRows.push(['Date', vue.paie.datePaiement ? formatDateFr(vue.paie.datePaiement) : '—']);
    box(m + (boxW + gap) * 2, 'Paiement', payRows);

    if (qr) {
      const qx = m + CONTENT_W - qrW;
      doc.image(qr, qx + 11, y, { width: 70, height: 70 });
      doc
        .font('Helvetica')
        .fontSize(6.3)
        .fillColor(C.muted)
        .text('Scanner pour vérifier', qx, y + 72, { width: qrW, align: 'center', lineBreak: false });
    }

    let fy = y + boxH + 12;
    doc
      .moveTo(m, fy)
      .lineTo(m + CONTENT_W, fy)
      .lineWidth(0.5)
      .strokeColor(C.line)
      .stroke();
    fy += 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(7.8)
      .fillColor(C.text)
      .text('À conserver sans limitation de durée.', m, fy, { width: CONTENT_W, align: 'center' });
    const meta = [
      vue.numero ? `Bulletin n° ${vue.numero}` : null,
      vue.hashCourt ? `Empreinte : ${vue.hashCourt}` : null,
      vue.legacy ? 'Bulletin établi selon l’ancien mode de calcul' : null,
      `Édité le ${formatDateFr(new Date())}`,
    ].filter(Boolean);
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(C.muted)
      .text(meta.join('  ·  '), m, doc.y + 2, { width: CONTENT_W, align: 'center' });
  }

  /** Données publiques de vérification : aucune donnée sensible hors nom masqué, période et net. */
  async verify(numero: string): Promise<{
    valide: boolean;
    statut: 'officiel' | 'provisoire' | 'annule' | 'introuvable';
    numero: string;
    periode: string | null;
    type: TypeBulletin | null;
    employe: string | null;
    netAPayer: number | null;
    hashOk: boolean;
  }> {
    const empty = {
      valide: false,
      statut: 'introuvable' as const,
      numero,
      periode: null,
      type: null,
      employe: null,
      netAPayer: null,
      hashOk: false,
    };
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(numero)) return empty;

    const paie = await this.prisma.paie.findFirst({
      where: { numero },
      include: {
        employe: { select: { nom: true, prenom: true } },
        lignes: true,
        contreBulletins: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    if (!paie) return empty;

    const annule = paie.statut === StatutPaie.annule || paie.contreBulletins.length > 0;
    const officiel = paie.statut === StatutPaie.valide || paie.statut === StatutPaie.paye;
    const hashOk = Boolean(paie.hashSha256) && paie.hashSha256 === computePayslipHash(paie);
    const snap = (paie.employeSnapshot ?? {}) as { nom?: unknown; prenom?: unknown };
    const prenom = typeof snap.prenom === 'string' ? snap.prenom : paie.employe.prenom;
    const nom = typeof snap.nom === 'string' ? snap.nom : paie.employe.nom;

    return {
      valide: officiel && !annule && hashOk,
      statut: annule ? 'annule' : officiel ? 'officiel' : 'provisoire',
      numero,
      periode: periodeLabel(paie.mois, paie.annee),
      type: paie.type,
      employe: maskName(prenom, nom),
      netAPayer: num(paie.netAPayer) ?? paie.salaireNet,
      hashOk,
    };
  }
}
