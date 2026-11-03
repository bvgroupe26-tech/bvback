import { computeProrataDays } from '../engine/engine-context.service';
import { buildAttendanceVariables, AttendancePresence } from './attendance-to-variables';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const P = (employeId: number, date: string, over: Partial<AttendancePresence> = {}): AttendancePresence => ({
  employeId,
  date: D(date),
  statut: 'present',
  justification: null,
  heuresSupplementaires: 0,
  ...over,
});

// Mai 2026 : le 1er est un vendredi, le 3 un dimanche.
const periode = { periodeDebut: D('2026-05-01'), periodeFin: D('2026-05-31') };
const q = (res: ReturnType<typeof buildAttendanceVariables>, emp: number, code: string, source?: string) =>
  res.variables
    .filter((v) => v.employeId === emp && v.ruleCode === code && (!source || v.source === source))
    .reduce((s, v) => s + v.quantite.toNumber(), 0);

describe('buildAttendanceVariables', () => {
  it('met tout en HS_1 (dimanche en HS_3) sans seuil, avec avertissement', () => {
    const res = buildAttendanceVariables({
      ...periode,
      presences: [
        P(1, '2026-05-04', { heuresSupplementaires: 3 }),
        P(1, '2026-05-05', { heuresSupplementaires: 9 }),
        P(1, '2026-05-03', { heuresSupplementaires: 4 }),
      ],
      absencesApprouvees: [],
    });
    expect(q(res, 1, 'HS_1')).toBe(12);
    expect(q(res, 1, 'HS_3')).toBe(4);
    expect(res.warnings).toHaveLength(1);
  });

  it('ventile par semaine ISO quand un seuil est fourni', () => {
    const res = buildAttendanceVariables({
      ...periode,
      presences: [
        P(1, '2026-05-04', { heuresSupplementaires: 5 }),
        P(1, '2026-05-06', { heuresSupplementaires: 6 }),
        P(1, '2026-05-11', { heuresSupplementaires: 2 }),
      ],
      absencesApprouvees: [],
      seuilTranche1Semaine: 8,
    });
    expect(q(res, 1, 'HS_1')).toBe(8 + 2);
    expect(q(res, 1, 'HS_2')).toBe(3);
    expect(res.warnings).toHaveLength(0);
  });

  it('compte les congés sans solde en jours ouvrés, bornés à la période', () => {
    const res = buildAttendanceVariables({
      ...periode,
      presences: [],
      absencesApprouvees: [
        { employeId: 2, dateDebut: D('2026-04-28'), dateFin: D('2026-05-05'), typeAbsence: 'conge_sans_solde' },
        { employeId: 2, dateDebut: D('2026-05-18'), dateFin: D('2026-05-19'), typeAbsence: 'maladie' },
      ],
    });
    // 1er (ven), 4 (lun), 5 (mar) = 3 jours ouvrés
    expect(q(res, 2, 'ABS_NON_PAYEE', 'absence')).toBe(3);
  });

  it('compte les absences injustifiées hors week-end et hors absences approuvées', () => {
    const res = buildAttendanceVariables({
      ...periode,
      presences: [
        P(3, '2026-05-04', { statut: 'absent' }),
        P(3, '2026-05-05', { statut: 'absent', justification: 'certificat' }),
        P(3, '2026-05-09', { statut: 'absent' }),
        P(3, '2026-05-18', { statut: 'absent' }),
      ],
      absencesApprouvees: [{ employeId: 3, dateDebut: D('2026-05-18'), dateFin: D('2026-05-18'), typeAbsence: 'maladie' }],
    });
    expect(q(res, 3, 'ABS_NON_PAYEE', 'presence')).toBe(1);
  });

  it('ignore les pointages hors période', () => {
    const res = buildAttendanceVariables({
      ...periode,
      presences: [P(4, '2026-06-01', { heuresSupplementaires: 5, statut: 'absent' })],
      absencesApprouvees: [],
    });
    expect(res.variables).toHaveLength(0);
  });
});

describe('computeProrataDays', () => {
  const mai = { debut: D('2026-05-01'), fin: D('2026-05-31'), baseJours: 30 };

  it('mois complet en base fixe → base entière', () => {
    expect(computeProrataDays({ ...mai, mode: 0 })).toEqual({ joursPeriode: 30, joursTravailles: 30 });
  });

  it('embauche en cours de mois en base fixe', () => {
    expect(computeProrataDays({ ...mai, mode: 0, dateEmbauche: D('2026-05-16') })).toEqual({
      joursPeriode: 30,
      joursTravailles: 15,
    });
  });

  it('jours calendaires et jours ouvrés', () => {
    expect(computeProrataDays({ ...mai, mode: 1, dateFinContrat: D('2026-05-10') })).toEqual({
      joursPeriode: 31,
      joursTravailles: 10,
    });
    expect(computeProrataDays({ ...mai, mode: 2 })).toEqual({ joursPeriode: 21, joursTravailles: 21 });
  });

  it('embauché après la période → 0 jour', () => {
    expect(computeProrataDays({ ...mai, mode: 0, dateEmbauche: D('2026-06-02') }).joursTravailles).toBe(0);
  });
});
