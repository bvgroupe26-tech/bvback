import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeRubrique,
  EmployeurSettings,
  ModeCalculRubrique,
  PayParameter,
  PayRule,
  Prisma,
  TaxBracket,
} from '@prisma/client';
import { todayISO } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateBaremeDto,
  CreateEmployeeRubriqueDto,
  CreatePayParameterDto,
  CreatePayRuleDto,
  UpdateBracketDto,
  UpdateEmployeeRubriqueDto,
  UpdateEmployeurDto,
  UpdatePayParameterDto,
  UpdatePayRuleDto,
} from './dto/paie-settings.dto';
import {
  EMPLOYEUR_CHAMPS_OBLIGATOIRES,
  findInForce,
  parameterIssue,
  ParameterIssue,
  planDatedInsert,
  requiredParameters,
  SettingsRuleError,
  validateBrackets,
} from './settings-rules';

const A_CONFIRMER_SUFFIX = /\s*[—–-]?\s*[àa]\s*confirmer.*$/i;

export interface PaieSettingsStatut {
  pret: boolean;
  date: string;
  rubriquesActives: number;
  parametresManquants: string[];
  baremesManquants: string[];
  employeurIncomplet: string[];
  details: Array<{ code: string; raison: ParameterIssue | 'bareme_absent' | 'bareme_nul'; rubriques: string[] }>;
}

function toDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function dec(v: Prisma.Decimal | null): number | null {
  return v === null ? null : Number(v.toString());
}

@Injectable()
export class PaieSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Employeur ─────────────────────────────────────────────

  async getEmployeur(): Promise<EmployeurSettings> {
    return this.prisma.employeurSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  async updateEmployeur(dto: UpdateEmployeurDto): Promise<EmployeurSettings> {
    const data = Object.fromEntries(
      Object.entries(dto).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]),
    ) as Prisma.EmployeurSettingsUpdateInput;
    return this.prisma.employeurSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...(data as Prisma.EmployeurSettingsCreateInput) },
      update: data,
    });
  }

  // ─── Rubriques ─────────────────────────────────────────────

  listRubriques(actif?: boolean): Promise<PayRule[]> {
    return this.prisma.payRule.findMany({
      where: actif === undefined ? undefined : { actif },
      orderBy: [{ ordre: 'asc' }, { code: 'asc' }],
    });
  }

  async createRubrique(dto: CreatePayRuleDto): Promise<PayRule> {
    this.assertRuleConsistency(dto);
    const exists = await this.prisma.payRule.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`La rubrique ${dto.code} existe déjà`);
    return this.prisma.payRule.create({ data: dto });
  }

  async updateRubrique(id: number, dto: UpdatePayRuleDto): Promise<PayRule> {
    const current = await this.findRubriqueOrThrow(id);
    this.assertRuleConsistency({ ...current, ...dto });
    if (dto.code && dto.code !== current.code) {
      const exists = await this.prisma.payRule.findUnique({ where: { code: dto.code } });
      if (exists) throw new ConflictException(`La rubrique ${dto.code} existe déjà`);
    }
    return this.prisma.payRule.update({ where: { id }, data: dto });
  }

  /** Désactivation plutôt que suppression : les bulletins passés référencent la rubrique. */
  async disableRubrique(id: number): Promise<PayRule> {
    await this.findRubriqueOrThrow(id);
    return this.prisma.payRule.update({ where: { id }, data: { actif: false } });
  }

  private async findRubriqueOrThrow(id: number): Promise<PayRule> {
    const rule = await this.prisma.payRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(`Rubrique #${id} introuvable`);
    return rule;
  }

  private assertRuleConsistency(r: {
    mode: ModeCalculRubrique;
    baseCode?: string | null;
    tauxSalarialCode?: string | null;
    tauxPatronalCode?: string | null;
    baremeCode?: string | null;
  }): void {
    if (r.mode === ModeCalculRubrique.bareme && !r.baremeCode) {
      throw new BadRequestException('Une rubrique au barème doit indiquer le code du barème');
    }
    if (r.mode === ModeCalculRubrique.base_x_taux) {
      if (!r.baseCode) throw new BadRequestException('Une rubrique base × taux doit indiquer sa base');
      if (!r.tauxSalarialCode && !r.tauxPatronalCode) {
        throw new BadRequestException('Une rubrique base × taux doit indiquer un taux salarial ou patronal');
      }
    }
  }

  // ─── Paramètres datés ──────────────────────────────────────

  async listParametres(date?: string, code?: string): Promise<PayParameter[]> {
    const rows = await this.prisma.payParameter.findMany({
      where: code ? { code } : undefined,
      orderBy: [{ code: 'asc' }, { dateDebut: 'desc' }],
    });
    if (!date) return rows;
    const at = toDate(date);
    const byCode = new Map<string, PayParameter[]>();
    for (const r of rows) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
    return [...byCode.values()]
      .map((list) => findInForce(list, at))
      .filter((r): r is PayParameter => r !== null);
  }

  async createParametre(dto: CreatePayParameterDto): Promise<PayParameter> {
    const dateDebut = toDate(dto.dateDebut);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.payParameter.findMany({ where: { code: dto.code } });
      const plan = this.plan(existing, dateDebut);
      if (plan.closePrevious) {
        await tx.payParameter.update({
          where: { id: plan.closePrevious.id },
          data: { dateFin: plan.closePrevious.dateFin },
        });
      }
      const previous = existing.find((r) => r.id === plan.closePrevious?.id);
      const description =
        dto.description ?? (previous?.description ? previous.description.replace(A_CONFIRMER_SUFFIX, '') : null);
      return tx.payParameter.create({
        data: {
          code: dto.code,
          valeur: dto.valeur,
          dateDebut,
          dateFin: plan.dateFin,
          description: description || null,
        },
      });
    });
  }

  /** Correction d'une valeur existante. Saisir une valeur retire la mention « À CONFIRMER ». */
  async updateParametre(id: number, dto: UpdatePayParameterDto): Promise<PayParameter> {
    const current = await this.prisma.payParameter.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Paramètre #${id} introuvable`);
    let description = dto.description;
    if (description === undefined && dto.valeur !== undefined && current.description) {
      description = current.description.replace(A_CONFIRMER_SUFFIX, '') || null;
    }
    return this.prisma.payParameter.update({
      where: { id },
      data: {
        ...(dto.valeur !== undefined ? { valeur: dto.valeur } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });
  }

  private plan(rows: Array<{ id: number; dateDebut: Date; dateFin: Date | null }>, dateDebut: Date) {
    try {
      return planDatedInsert(rows, dateDebut);
    } catch (err) {
      if (err instanceof SettingsRuleError) throw new ConflictException(err.message);
      throw err;
    }
  }

  // ─── Barèmes ───────────────────────────────────────────────

  async listBaremes(date?: string, bareme?: string): Promise<TaxBracket[]> {
    const rows = await this.prisma.taxBracket.findMany({
      where: bareme ? { bareme } : undefined,
      orderBy: [{ bareme: 'asc' }, { dateDebut: 'desc' }, { borneMin: 'asc' }],
    });
    if (!date) return rows;
    const at = toDate(date);
    const result: TaxBracket[] = [];
    for (const code of new Set(rows.map((r) => r.bareme))) {
      const list = rows.filter((r) => r.bareme === code);
      const version = findInForce(this.versions(list), at);
      if (version) result.push(...list.filter((r) => r.dateDebut.getTime() === version.dateDebut.getTime()));
    }
    return result;
  }

  /** Nouvelle version complète d'un barème ; la version précédente est close à la date d'effet. */
  async createBareme(dto: CreateBaremeDto): Promise<TaxBracket[]> {
    this.assertBrackets(dto.tranches);
    const dateDebut = toDate(dto.dateDebut);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.taxBracket.findMany({ where: { bareme: dto.bareme } });
      const versions = this.versions(existing);
      const plan = this.plan(versions, dateDebut);
      if (plan.closePrevious) {
        const prev = versions.find((v) => v.id === plan.closePrevious!.id)!;
        await tx.taxBracket.updateMany({
          where: { bareme: dto.bareme, dateDebut: prev.dateDebut },
          data: { dateFin: plan.closePrevious.dateFin },
        });
      }
      await tx.taxBracket.createMany({
        data: dto.tranches.map((t) => ({
          bareme: dto.bareme,
          borneMin: t.borneMin,
          borneMax: t.borneMax ?? null,
          taux: t.taux,
          dateDebut,
          dateFin: plan.dateFin,
        })),
      });
      return tx.taxBracket.findMany({
        where: { bareme: dto.bareme, dateDebut },
        orderBy: { borneMin: 'asc' },
      });
    });
  }

  async updateBracket(id: number, dto: UpdateBracketDto): Promise<TaxBracket[]> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.taxBracket.findUnique({ where: { id } });
      if (!current) throw new NotFoundException(`Tranche #${id} introuvable`);
      await tx.taxBracket.update({
        where: { id },
        data: {
          ...(dto.borneMin !== undefined ? { borneMin: dto.borneMin } : {}),
          ...(dto.borneMax !== undefined ? { borneMax: dto.borneMax } : {}),
          ...(dto.taux !== undefined ? { taux: dto.taux } : {}),
        },
      });
      return this.revalidateVersion(tx, current.bareme, current.dateDebut, false);
    });
  }

  async deleteBracket(id: number): Promise<TaxBracket[]> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.taxBracket.findUnique({ where: { id } });
      if (!current) throw new NotFoundException(`Tranche #${id} introuvable`);
      await tx.taxBracket.delete({ where: { id } });
      return this.revalidateVersion(tx, current.bareme, current.dateDebut, true);
    });
  }

  private async revalidateVersion(
    tx: Prisma.TransactionClient,
    bareme: string,
    dateDebut: Date,
    allowEmpty: boolean,
  ): Promise<TaxBracket[]> {
    const set = await tx.taxBracket.findMany({ where: { bareme, dateDebut }, orderBy: { borneMin: 'asc' } });
    if (set.length === 0 && allowEmpty) return set;
    this.assertBrackets(
      set.map((b) => ({ borneMin: dec(b.borneMin)!, borneMax: dec(b.borneMax), taux: dec(b.taux)! })),
    );
    return set;
  }

  private versions(rows: TaxBracket[]): Array<{ id: number; dateDebut: Date; dateFin: Date | null }> {
    const map = new Map<number, { id: number; dateDebut: Date; dateFin: Date | null }>();
    for (const r of rows) {
      const key = r.dateDebut.getTime();
      if (!map.has(key)) map.set(key, { id: r.id, dateDebut: r.dateDebut, dateFin: r.dateFin });
    }
    return [...map.values()];
  }

  private assertBrackets(tranches: Array<{ borneMin: number; borneMax: number | null; taux: number }>): void {
    const errors = validateBrackets(tranches.map((t) => ({ ...t, borneMax: t.borneMax ?? null })));
    if (errors.length) throw new BadRequestException(errors.join(' '));
  }

  // ─── Éléments fixes d'un salarié ───────────────────────────

  async listEmployeeRubriques(employeId: number) {
    await this.assertEmploye(employeId);
    return this.prisma.employeeRubrique.findMany({
      where: { employeId },
      include: { payRule: { select: { code: true, libelle: true, type: true, mode: true } } },
      orderBy: [{ dateDebut: 'desc' }],
    });
  }

  async createEmployeeRubrique(employeId: number, dto: CreateEmployeeRubriqueDto): Promise<EmployeeRubrique> {
    await this.assertEmploye(employeId);
    await this.findRubriqueOrThrow(dto.payRuleId);
    const data = this.employeeRubriqueData(dto);
    await this.assertNoOverlap(employeId, dto.payRuleId, data.dateDebut, data.dateFin ?? null);
    return this.prisma.employeeRubrique.create({
      data: { employeId, payRuleId: dto.payRuleId, ...data },
    });
  }

  async updateEmployeeRubrique(
    employeId: number,
    id: number,
    dto: UpdateEmployeeRubriqueDto,
  ): Promise<EmployeeRubrique> {
    const current = await this.prisma.employeeRubrique.findFirst({ where: { id, employeId } });
    if (!current) throw new NotFoundException(`Élément #${id} introuvable pour ce salarié`);
    const payRuleId = dto.payRuleId ?? current.payRuleId;
    if (dto.payRuleId !== undefined) await this.findRubriqueOrThrow(dto.payRuleId);
    const merged = this.employeeRubriqueData({
      payRuleId,
      montant: dto.montant !== undefined ? dto.montant : dec(current.montant),
      taux: dto.taux !== undefined ? dto.taux : dec(current.taux),
      dateDebut: dto.dateDebut ?? current.dateDebut.toISOString().slice(0, 10),
      dateFin:
        dto.dateFin !== undefined ? dto.dateFin : current.dateFin ? current.dateFin.toISOString().slice(0, 10) : null,
    });
    await this.assertNoOverlap(employeId, payRuleId, merged.dateDebut, merged.dateFin ?? null, id);
    return this.prisma.employeeRubrique.update({ where: { id }, data: { payRuleId, ...merged } });
  }

  async deleteEmployeeRubrique(employeId: number, id: number): Promise<{ id: number }> {
    const current = await this.prisma.employeeRubrique.findFirst({ where: { id, employeId } });
    if (!current) throw new NotFoundException(`Élément #${id} introuvable pour ce salarié`);
    await this.prisma.employeeRubrique.delete({ where: { id } });
    return { id };
  }

  private employeeRubriqueData(dto: CreateEmployeeRubriqueDto) {
    if ((dto.montant === undefined || dto.montant === null) && (dto.taux === undefined || dto.taux === null)) {
      throw new BadRequestException('Indiquez un montant ou un taux');
    }
    const dateDebut = toDate(dto.dateDebut);
    const dateFin = dto.dateFin ? toDate(dto.dateFin) : null;
    if (dateFin && dateFin <= dateDebut) {
      throw new BadRequestException('La date de fin doit être postérieure à la date de début');
    }
    return { montant: dto.montant ?? null, taux: dto.taux ?? null, dateDebut, dateFin };
  }

  private async assertNoOverlap(
    employeId: number,
    payRuleId: number,
    dateDebut: Date,
    dateFin: Date | null,
    excludeId?: number,
  ): Promise<void> {
    const others = await this.prisma.employeeRubrique.findMany({
      where: { employeId, payRuleId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    const overlap = others.some(
      (o) => (o.dateFin === null || dateDebut < o.dateFin) && (dateFin === null || o.dateDebut < dateFin),
    );
    if (overlap) {
      throw new ConflictException('Cette rubrique est déjà attribuée à ce salarié sur une période qui se chevauche');
    }
  }

  private async assertEmploye(employeId: number): Promise<void> {
    const employe = await this.prisma.employe.findFirst({ where: { id: employeId }, select: { id: true } });
    if (!employe) throw new NotFoundException(`Employé #${employeId} introuvable`);
  }

  // ─── État de préparation du moteur v2 ──────────────────────

  async statut(date?: string): Promise<PaieSettingsStatut> {
    const at = toDate(date ?? todayISO());
    const [rules, params, brackets, employeur] = await Promise.all([
      this.prisma.payRule.findMany({ where: { actif: true } }),
      this.prisma.payParameter.findMany(),
      this.prisma.taxBracket.findMany(),
      this.getEmployeur(),
    ]);

    const details: PaieSettingsStatut['details'] = [];
    for (const [code, rubriques] of requiredParameters(rules)) {
      const row = findInForce(
        params.filter((p) => p.code === code),
        at,
      );
      const issue = parameterIssue(row ? { valeur: Number(row.valeur.toString()), description: row.description } : null);
      if (issue) details.push({ code, raison: issue, rubriques });
    }

    const baremesManquants: string[] = [];
    for (const rule of rules.filter((r) => r.mode === ModeCalculRubrique.bareme && r.baremeCode)) {
      const code = rule.baremeCode!;
      if (baremesManquants.includes(code)) continue;
      const list = brackets.filter((b) => b.bareme === code);
      const version = findInForce(this.versions(list), at);
      const set = version ? list.filter((b) => b.dateDebut.getTime() === version.dateDebut.getTime()) : [];
      if (set.length === 0) {
        baremesManquants.push(code);
        details.push({ code, raison: 'bareme_absent', rubriques: [rule.code] });
      } else if (set.every((b) => Number(b.taux.toString()) === 0)) {
        baremesManquants.push(code);
        details.push({ code, raison: 'bareme_nul', rubriques: [rule.code] });
      }
    }

    const employeurIncomplet = EMPLOYEUR_CHAMPS_OBLIGATOIRES.filter((champ) => !employeur[champ]?.trim());
    const parametresManquants = details
      .filter((d) => d.raison !== 'bareme_absent' && d.raison !== 'bareme_nul')
      .map((d) => d.code);

    return {
      pret:
        rules.length > 0 &&
        parametresManquants.length === 0 &&
        baremesManquants.length === 0 &&
        employeurIncomplet.length === 0,
      date: at.toISOString().slice(0, 10),
      rubriquesActives: rules.length,
      parametresManquants,
      baremesManquants,
      employeurIncomplet: [...employeurIncomplet],
      details,
    };
  }
}
