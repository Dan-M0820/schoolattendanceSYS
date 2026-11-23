import crypto from 'node:crypto';
import {
  AbsenceRecord,
  AttendancePeriod,
  AttendanceRecord,
  AttendanceSetting,
  AttendanceStatusCode,
  ClassSection,
  Enrollment,
  EXCUSE_REASONS,
  ExcuseRecord,
  GENDERS,
  GRADE_LEVELS,
  PERIODS,
  ROLES,
  SchoolYear,
  STATUS_CODES,
  Student,
  User,
  UserRole,
} from '../shared/types';
import {
  emptyCounts,
  filterAttendanceRecords,
  AttendanceFilters,
  countRecords,
  formatMonthLabel,
  summarizeCounts,
} from '../shared/stats';
import {
  parseDate,
  required,
  optional,
  todayIso,
  validateChoice,
  validateContactNumber,
  validatePassword,
  validateSchoolDate,
  validateStudentNumber,
  validateUsername,
  ValidationError,
} from '../shared/validation';
import { parseCsv } from '../shared/csv';

export interface StoredUser extends User {
  password_hash: string;
}

export interface BackupEntry {
  name: string;
  created_at: string;
  size_kb: number;
  payload: BackupPayload;
}

export interface BackupPayload {
  meta: {
    system: string;
    created_at: string;
    database: string;
    tables: Record<string, number>;
    checksum: string;
  };
  data: {
    school_years: SchoolYear[];
    users: StoredUser[];
    students: Student[];
    classes: ClassSection[];
    enrollments: Enrollment[];
    attendance: AttendanceRecord[];
    absence_records: AbsenceRecord[];
    excuses: ExcuseRecord[];
    attendance_settings: AttendanceSetting[];
  };
}

export interface DatabaseState {
  school_years: SchoolYear[];
  users: StoredUser[];
  students: Student[];
  classes: ClassSection[];
  enrollments: Enrollment[];
  attendance: AttendanceRecord[];
  absence_records: AbsenceRecord[];
  excuses: ExcuseRecord[];
  attendance_settings: AttendanceSetting[];
  nextId: {
    school_year: number;
    user: number;
    student: number;
    class: number;
    enrollment: number;
    attendance: number;
    absence: number;
    excuse: number;
    setting: number;
  };
}

const TABLE_ORDER: Array<keyof BackupPayload['data']> = [
  'school_years',
  'users',
  'students',
  'classes',
  'enrollments',
  'attendance',
  'absence_records',
  'excuses',
  'attendance_settings',
];

export const SCHOOL_NAME = process.env.SCHOOL_NAME || 'Sample National High School';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 32);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

// Seeded deterministic PRNG (Mulberry32)
function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function schoolDaysBack(endIso: string, count: number): string[] {
  const [y, m, d] = endIso.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  const days: string[] = [];
  while (days.length < count) {
    const dow = cur.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      days.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return days.reverse();
}

export function mostRecentSchoolDay(today = todayIso()): string {
  const [y, m, d] = today.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  while (cur.getUTCDay() === 0 || cur.getUTCDay() === 6) {
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return cur.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function computeChecksum(data: BackupPayload['data']): string {
  const canonical = sortKeysDeep(data);
  const raw = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return value;
}

export class AttendanceStore {
  public db: DatabaseState;
  public backups: BackupEntry[] = [];

  constructor() {
    this.db = this.createSeededDatabase();
  }

  private createSeededDatabase(): DatabaseState {
    const rng = createRng(2026);
    const now = new Date().toISOString();
    const today = todayIso();
    const todayDate = new Date();
    const startYear =
      todayDate.getMonth() + 1 >= 6 ? todayDate.getFullYear() : todayDate.getFullYear() - 1;

    const state: DatabaseState = {
      school_years: [],
      users: [],
      students: [],
      classes: [],
      enrollments: [],
      attendance: [],
      absence_records: [],
      excuses: [],
      attendance_settings: [],
      nextId: {
        school_year: 1,
        user: 1,
        student: 1,
        class: 1,
        enrollment: 1,
        attendance: 1,
        absence: 1,
        excuse: 1,
        setting: 1,
      },
    };

    // Settings
    const defaults: Array<[AttendanceSetting['key'], string, string]> = [
      [
        'alert_unexcused_threshold',
        '5',
        'Unexcused absences before an attendance alert is shown',
      ],
      [
        'alert_rate_threshold',
        '85',
        'Attendance rate (%) below which a student is flagged',
      ],
      [
        'late_counts_as_present',
        '1',
        '1 = late days count toward the attendance rate',
      ],
    ];
    for (const [key, value, description] of defaults) {
      state.attendance_settings.push({
        setting_id: state.nextId.setting++,
        key,
        value,
        description,
      });
    }

    // Users
    const demoUsers: Array<[string, string, string, UserRole]> = [
      ['admin', 'admin12345', 'System Administrator', 'Administrator'],
      ['teacher', 'teacher12345', 'Liza M. Santos', 'Teacher'],
      ['adviser', 'adviser12345', 'Ramon C. Villanueva', 'Adviser'],
      ['registrar', 'registrar12345', 'Grace P. Tan', 'Registrar'],
      ['principal', 'principal12345', 'Dr. Ernesto B. Ramos', 'Principal'],
    ];
    const usersByUsername: Record<string, StoredUser> = {};
    for (const [username, pw, full_name, role] of demoUsers) {
      const user: StoredUser = {
        user_id: state.nextId.user++,
        username,
        password_hash: hashPassword(pw),
        full_name,
        role,
        is_active_user: true,
        last_login: null,
        created_at: now,
      };
      state.users.push(user);
      usersByUsername[username] = user;
    }

    // Active School Year
    const sy: SchoolYear = {
      school_year_id: state.nextId.school_year++,
      name: `${startYear}-${startYear + 1}`,
      start_date: `${startYear}-06-01`,
      end_date: `${startYear + 1}-04-30`,
      is_active: true,
    };
    state.school_years.push(sy);

    // Classes
    const classDefs: Array<[string, string, string]> = [
      ['G7-MABINI', 'Grade 7', 'Mabini'],
      ['G8-RIZAL', 'Grade 8', 'Rizal'],
      ['G9-BONIFACIO', 'Grade 9', 'Bonifacio'],
      ['G10-LUNA', 'Grade 10', 'Luna'],
    ];
    const studentsByClass = new Map<number, Student[]>();
    classDefs.forEach(([code, grade_level, section], i) => {
      const adviser =
        section === 'Rizal'
          ? usersByUsername.adviser
          : i % 2 === 0
            ? usersByUsername.teacher
            : null;
      const cls: ClassSection = {
        class_id: state.nextId.class++,
        class_code: `${code}-${startYear}`,
        class_name: `${grade_level} - ${section}`,
        grade_level,
        section,
        adviser_id: adviser ? adviser.user_id : null,
        school_year_id: sy.school_year_id,
      };
      state.classes.push(cls);
      studentsByClass.set(cls.class_id, []);
    });

    const rizal = state.classes[1];
    const fixed: Array<[string, string, string, 'Male' | 'Female', string]> = [
      ['Juan', 'D.', 'Dela Cruz', 'Male', '2012-01-15'],
      ['Maria', 'C.', 'Santos', 'Female', '2012-03-02'],
      ['Pedro', 'B.', 'Reyes', 'Male', '2011-11-20'],
      ['Ana', 'M.', 'Garcia', 'Female', '2012-06-09'],
    ];
    let seq = 1;
    const usedNames = new Set<string>();
    for (const [first, middle, last, gender, bday] of fixed) {
      usedNames.add(`${first}|${last}`);
      const student: Student = {
        student_id: state.nextId.student++,
        student_number: `${startYear}-${String(seq++).padStart(4, '0')}`,
        first_name: first,
        middle_name: middle,
        last_name: last,
        gender,
        birth_date: bday,
        contact_number: `0917${Math.floor(1000000 + rng() * 8999999)}`,
        status: 'Active',
        created_at: now,
      };
      state.students.push(student);
      state.enrollments.push({
        enrollment_id: state.nextId.enrollment++,
        student_id: student.student_id,
        class_id: rizal.class_id,
        date_enrolled: sy.start_date,
        status: 'Enrolled',
      });
      studentsByClass.get(rizal.class_id)!.push(student);
    }

    const firstM = [
      'Juan',
      'Pedro',
      'Jose',
      'Mark',
      'Carlo',
      'Miguel',
      'Paolo',
      'Rafael',
      'Gabriel',
      'Adrian',
      'Kevin',
      'Joshua',
    ];
    const firstF = [
      'Maria',
      'Ana',
      'Andrea',
      'Bea',
      'Camille',
      'Danica',
      'Ella',
      'Francine',
      'Hannah',
      'Isabel',
      'Joy',
      'Kyla',
    ];
    const lastNames = [
      'Dela Cruz',
      'Santos',
      'Reyes',
      'Garcia',
      'Mendoza',
      'Bautista',
      'Villanueva',
      'Ramos',
      'Aquino',
      'Castillo',
      'Flores',
      'Gonzales',
      'Lopez',
      'Navarro',
      'Pascual',
      'Torres',
      'Domingo',
      'Mijares',
      'Salazar',
      'Fernandez',
    ];
    const middles = ['D.', 'C.', 'B.', 'M.', 'R.', 'S.', 'L.', 'A.'];

    for (const cls of state.classes) {
      const gradeNo = Number(cls.grade_level.split(' ')[1]) || 8;
      const list = studentsByClass.get(cls.class_id)!;
      while (list.length < 10) {
        const gender: 'Male' | 'Female' = rng() < 0.5 ? 'Male' : 'Female';
        const firstPool = gender === 'Male' ? firstM : firstF;
        const first = firstPool[Math.floor(rng() * firstPool.length)];
        const last = lastNames[Math.floor(rng() * lastNames.length)];
        if (usedNames.has(`${first}|${last}`)) continue;
        usedNames.add(`${first}|${last}`);
        const birthYear = startYear - 6 - gradeNo;
        const birthMonth = String(1 + Math.floor(rng() * 12)).padStart(2, '0');
        const birthDay = String(1 + Math.floor(rng() * 28)).padStart(2, '0');
        const student: Student = {
          student_id: state.nextId.student++,
          student_number: `${startYear}-${String(seq++).padStart(4, '0')}`,
          first_name: first,
          middle_name: middles[Math.floor(rng() * middles.length)],
          last_name: last,
          gender,
          birth_date: `${birthYear}-${birthMonth}-${birthDay}`,
          contact_number: `09${Math.floor(100000000 + rng() * 899999999)}`,
          status: 'Active',
          created_at: now,
        };
        state.students.push(student);
        state.enrollments.push({
          enrollment_id: state.nextId.enrollment++,
          student_id: student.student_id,
          class_id: cls.class_id,
          date_enrolled: sy.start_date,
          status: 'Enrolled',
        });
        list.push(student);
      }
    }

    // 40 school days of sample attendance; leave Grade 8 - Rizal unrecorded on latest school day for demo
    const lastDay = today <= sy.end_date ? today : sy.end_date;
    const latestSchoolDay = mostRecentSchoolDay(lastDay);
    const schoolDays = schoolDaysBack(lastDay, 40).filter((d) => d >= sy.start_date);
    const rizalList = studentsByClass.get(rizal.class_id)!;
    const frequentRates = new Map<number, [number, number]>([
      [rizalList[2].student_id, [0.62, 0.08]], // Pedro Reyes
      [rizalList[3].student_id, [0.76, 0.08]], // Ana Garcia
    ]);

    for (const cls of state.classes) {
      const recorderId = cls.adviser_id ?? usersByUsername.teacher.user_id;
      const roster = studentsByClass.get(cls.class_id)!;
      for (const day of schoolDays) {
        if (cls.class_id === rizal.class_id && day === latestSchoolDay) {
          continue;
        }
        for (const s of roster) {
          const [pPresent, pLate] = frequentRates.get(s.student_id) ?? [0.92, 0.04];
          const r = rng();
          const status: AttendanceStatusCode =
            r < pPresent ? 'P' : r < pPresent + pLate ? 'L' : 'A';
          const att: AttendanceRecord = {
            attendance_id: state.nextId.attendance++,
            student_id: s.student_id,
            class_id: cls.class_id,
            attendance_date: day,
            subject: null,
            period: 'Whole Day',
            status,
            remarks: null,
            recorded_by: recorderId,
            recorded_at: `${day}T07:30:00.000Z`,
            updated_at: null,
          };
          state.attendance.push(att);
          if (status === 'A') {
            state.absence_records.push({
              absence_id: state.nextId.absence++,
              attendance_id: att.attendance_id,
              student_id: s.student_id,
              class_id: cls.class_id,
              absence_date: day,
              status: 'Unexcused',
              created_at: `${day}T07:30:00.000Z`,
            });
          }
        }
      }
    }

    // Seed excuses (Approved, Rejected, Pending)
    const reasons = ['Medical Appointment', 'Illness', 'Family Emergency'];
    const sortedAbsences = [...state.absence_records]
      .filter((ab) => !frequentRates.has(ab.student_id))
      .sort((a, b) => a.absence_date.localeCompare(b.absence_date));

    const attById = new Map(state.attendance.map((a) => [a.attendance_id, a]));
    let idx = 0;
    for (let i = 0; i < sortedAbsences.length; i += 3) {
      const ab = sortedAbsences[i];
      const kind = (['Approved', 'Approved', 'Rejected', 'Pending'] as const)[idx % 4];
      idx += 1;
      const submittedAt = `${addDaysIso(ab.absence_date, 1)}T08:00:00.000Z`;
      const excuse: ExcuseRecord = {
        excuse_id: state.nextId.excuse++,
        absence_id: ab.absence_id,
        student_id: ab.student_id,
        reason: reasons[Math.floor(rng() * reasons.length)],
        remarks: "Parent's letter submitted to adviser.",
        attachment: null,
        attachment_data: null,
        status: kind,
        submitted_by: usersByUsername.teacher.user_id,
        submitted_at: submittedAt,
        reviewed_by: kind !== 'Pending' ? usersByUsername.adviser.user_id : null,
        reviewed_at:
          kind !== 'Pending'
            ? `${addDaysIso(ab.absence_date, 1)}T11:00:00.000Z`
            : null,
        review_remarks:
          kind === 'Rejected' ? 'No supporting document.' : null,
      };
      state.excuses.push(excuse);
      if (kind === 'Approved') {
        ab.status = 'Excused';
        const att = attById.get(ab.attendance_id);
        if (att) att.status = 'E';
      }
    }

    return state;
  }

  public getSetting(key: AttendanceSetting['key']): string {
    return this.db.attendance_settings.find((s) => s.key === key)?.value ?? '';
  }

  public getSettingInt(key: AttendanceSetting['key'], fallback: number): number {
    const val = Number.parseInt(this.getSetting(key), 10);
    return Number.isNaN(val) ? fallback : val;
  }

  public lateCountsAsPresent(): boolean {
    return this.getSettingInt('late_counts_as_present', 1) === 1;
  }

  public activeSchoolYear(): SchoolYear | null {
    return this.db.school_years.find((sy) => sy.is_active) ?? null;
  }

  public publicUser(u: StoredUser): User {
    const { password_hash: _pw, ...rest } = u;
    return rest;
  }

  public authenticate(username: string, password: string): User | null {
    const u = this.db.users.find((x) => x.username === username.trim());
    if (!u || !u.is_active_user) return null;
    if (!verifyPassword(password, u.password_hash)) return null;
    u.last_login = new Date().toISOString();
    return this.publicUser(u);
  }

  public changePassword(
    userId: number,
    currentPw: string,
    newPw: string,
    confirmPw: string,
  ): void {
    const u = this.db.users.find((x) => x.user_id === userId);
    if (!u) throw new ValidationError('User not found.');
    if (!verifyPassword(currentPw, u.password_hash)) {
      throw new ValidationError('Current password is incorrect.');
    }
    validatePassword(newPw, 'New password');
    if (newPw !== confirmPw) {
      throw new ValidationError('New password and confirmation do not match.');
    }
    u.password_hash = hashPassword(newPw);
  }

  public currentClassForStudent(studentId: number): ClassSection | null {
    const enrolled = this.db.enrollments.filter(
      (e) => e.student_id === studentId && e.status === 'Enrolled',
    );
    if (enrolled.length === 0) return null;
    const classesById = new Map(this.db.classes.map((c) => [c.class_id, c]));
    const syById = new Map(this.db.school_years.map((sy) => [sy.school_year_id, sy]));
    enrolled.sort((a, b) => {
      const syA = syById.get(classesById.get(a.class_id)?.school_year_id ?? -1)?.is_active
        ? 1
        : 0;
      const syB = syById.get(classesById.get(b.class_id)?.school_year_id ?? -1)?.is_active
        ? 1
        : 0;
      if (syA !== syB) return syB - syA;
      return b.date_enrolled.localeCompare(a.date_enrolled);
    });
    return classesById.get(enrolled[0].class_id) ?? null;
  }

  public classRoster(classId: number): Student[] {
    const enrolledIds = new Set(
      this.db.enrollments
        .filter((e) => e.class_id === classId && e.status === 'Enrolled')
        .map((e) => e.student_id),
    );
    return this.db.students
      .filter((s) => enrolledIds.has(s.student_id))
      .sort((a, b) => {
        const l = a.last_name.toLowerCase().localeCompare(b.last_name.toLowerCase());
        return l !== 0 ? l : a.first_name.toLowerCase().localeCompare(b.first_name.toLowerCase());
      });
  }

  public syncAbsence(att: AttendanceRecord): void {
    const existingIdx = this.db.absence_records.findIndex(
      (ab) => ab.attendance_id === att.attendance_id,
    );
    if (att.status === 'A' || att.status === 'E') {
      const targetStatus = att.status === 'E' ? 'Excused' : 'Unexcused';
      if (existingIdx >= 0) {
        this.db.absence_records[existingIdx].status = targetStatus;
      } else {
        this.db.absence_records.push({
          absence_id: this.db.nextId.absence++,
          attendance_id: att.attendance_id,
          student_id: att.student_id,
          class_id: att.class_id,
          absence_date: att.attendance_date,
          status: targetStatus,
          created_at: new Date().toISOString(),
        });
      }
    } else if (existingIdx >= 0) {
      const abId = this.db.absence_records[existingIdx].absence_id;
      this.db.absence_records.splice(existingIdx, 1);
      this.db.excuses = this.db.excuses.filter((e) => e.absence_id !== abId);
    }
  }

  public dashboardData() {
    const today = todayIso();
    const sy = this.activeSchoolYear();
    const latePresent = this.lateCountsAsPresent();
    const classesById = new Map(this.db.classes.map((c) => [c.class_id, c]));
    const syFilter: AttendanceFilters = sy ? { school_year_id: sy.school_year_id } : {};

    const totalStudents = this.db.students.filter((s) => s.status === 'Active').length;
    const todayRecords = filterAttendanceRecords(this.db.attendance, classesById, {
      ...syFilter,
      date_from: today,
      date_to: today,
    });
    const todayCounts = countRecords(todayRecords);
    const todaySummary = summarizeCounts(todayCounts, latePresent);

    const syRecords = filterAttendanceRecords(this.db.attendance, classesById, syFilter);
    const overall = summarizeCounts(countRecords(syRecords), latePresent);

    // Monthly trend
    const trendMap = new Map<string, ReturnType<typeof emptyCounts>>();
    for (const r of syRecords) {
      if (r.attendance_date > today) continue;
      const ym = r.attendance_date.slice(0, 7);
      if (!trendMap.has(ym)) trendMap.set(ym, emptyCounts());
      trendMap.get(ym)![r.status] += 1;
    }
    const sortedMonths = [...trendMap.keys()].sort();
    const trend_labels = sortedMonths.map(formatMonthLabel);
    const trend_rates = sortedMonths.map(
      (k) => summarizeCounts(trendMap.get(k)!, latePresent).rate,
    );
    const trend_absences = sortedMonths.map((k) => {
      const c = trendMap.get(k)!;
      return c.A + c.E;
    });

    // By class and grade
    const byClass = new Map<string, ReturnType<typeof emptyCounts>>();
    const byGrade = new Map<string, ReturnType<typeof emptyCounts>>();
    for (const r of syRecords) {
      const cls = classesById.get(r.class_id);
      if (!cls) continue;
      const classLabel = `${cls.grade_level} - ${cls.section}`;
      if (!byClass.has(classLabel)) byClass.set(classLabel, emptyCounts());
      byClass.get(classLabel)![r.status] += 1;
      if (!byGrade.has(cls.grade_level)) byGrade.set(cls.grade_level, emptyCounts());
      byGrade.get(cls.grade_level)![r.status] += 1;
    }
    const class_labels = [...byClass.keys()].sort();
    const class_absences = class_labels.map(
      (k) => byClass.get(k)!.A + byClass.get(k)!.E,
    );
    const grade_labels = [...byGrade.keys()].sort((a, b) => {
      const na = Number(a.replace(/\D/g, '')) || 0;
      const nb = Number(b.replace(/\D/g, '')) || 0;
      return na - nb;
    });
    const grade_rates = grade_labels.map(
      (k) => summarizeCounts(byGrade.get(k)!, latePresent).rate,
    );

    // Alerts
    const alertThreshold = this.getSettingInt('alert_unexcused_threshold', 5);
    const unexcusedByStudent = new Map<number, number>();
    const totalAbsByStudent = new Map<number, number>();
    for (const r of syRecords) {
      if (r.status === 'A') {
        unexcusedByStudent.set(r.student_id, (unexcusedByStudent.get(r.student_id) ?? 0) + 1);
      }
      if (r.status === 'A' || r.status === 'E') {
        totalAbsByStudent.set(r.student_id, (totalAbsByStudent.get(r.student_id) ?? 0) + 1);
      }
    }

    const studentsById = new Map(this.db.students.map((s) => [s.student_id, s]));
    const alerts = [...unexcusedByStudent.entries()]
      .filter(([sid, cnt]) => {
        const st = studentsById.get(sid);
        return st?.status === 'Active' && cnt >= alertThreshold;
      })
      .map(([sid, unexcused]) => {
        const s = studentsById.get(sid)!;
        return {
          student_id: s.student_id,
          display_name: `${s.first_name} ${s.last_name}`,
          student_number: s.student_number,
          unexcused,
        };
      })
      .sort((a, b) => b.unexcused - a.unexcused)
      .slice(0, 10);

    const frequent = [...totalAbsByStudent.entries()]
      .map(([sid, absences]) => {
        const s = studentsById.get(sid)!;
        const cls = this.currentClassForStudent(sid);
        return {
          student_id: s.student_id,
          display_name: `${s.first_name} ${s.last_name}`,
          class_label: cls ? `${cls.grade_level} - ${cls.section}` : '—',
          absences,
        };
      })
      .sort((a, b) => b.absences - a.absences)
      .slice(0, 5);

    return {
      school_year: sy,
      today,
      latest_school_day: mostRecentSchoolDay(today),
      total_students: totalStudents,
      today_summary: todaySummary,
      overall,
      pie: [overall.present, overall.late, overall.unexcused, overall.excused],
      trend_labels,
      trend_rates,
      trend_absences,
      class_labels,
      class_absences,
      grade_labels,
      grade_rates,
      alerts,
      alert_threshold: alertThreshold,
      frequent,
    };
  }

  // Students CRUD
  public createOrUpdateStudent(
    input: {
      student_number: string;
      first_name: string;
      middle_name?: string | null;
      last_name: string;
      gender: string;
      birth_date: string;
      contact_number?: string | null;
    },
    existingId?: number,
  ): Student {
    const number = validateStudentNumber(input.student_number);
    const dup = this.db.students.find(
      (s) => s.student_number === number && s.student_id !== existingId,
    );
    if (dup) {
      throw new ValidationError(`Student number ${number} is already registered.`);
    }
    const first_name = required(input.first_name, 'First name');
    const middle_name = optional(input.middle_name);
    const last_name = required(input.last_name, 'Last name');
    const gender = validateChoice(input.gender, GENDERS, 'Gender');
    const birth_date = parseDate(input.birth_date, 'Birth date', { allowFuture: false });
    const contact_number = validateContactNumber(input.contact_number);

    if (existingId !== undefined) {
      const st = this.db.students.find((s) => s.student_id === existingId);
      if (!st) throw new ValidationError('Student not found.');
      Object.assign(st, {
        student_number: number,
        first_name,
        middle_name,
        last_name,
        gender,
        birth_date,
        contact_number,
      });
      return st;
    }

    const student: Student = {
      student_id: this.db.nextId.student++,
      student_number: number,
      first_name,
      middle_name,
      last_name,
      gender,
      birth_date,
      contact_number,
      status: 'Active',
      created_at: new Date().toISOString(),
    };
    this.db.students.push(student);
    return student;
  }

  public importStudentsCsv(csvText: string, classCode?: string) {
    const { headers, rows } = parseCsv(csvText);
    const requiredCols = ['student_number', 'first_name', 'last_name', 'gender', 'birth_date'];
    const missing = requiredCols.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      return {
        created: 0,
        enrolled: 0,
        errors: [`Missing column(s): ${missing.join(', ')}`],
      };
    }

    let cls: ClassSection | undefined;
    if (classCode) {
      cls = this.db.classes.find((c) => c.class_code === classCode);
      if (!cls) {
        return {
          created: 0,
          enrolled: 0,
          errors: [`Class code ${classCode} not found.`],
        };
      }
    }

    let created = 0;
    let enrolled = 0;
    const errors: string[] = [];

    rows.forEach((row, idx) => {
      const lineNo = idx + 2;
      try {
        const gRaw = (row.gender || '').trim();
        const genderTitled = gRaw ? gRaw[0].toUpperCase() + gRaw.slice(1).toLowerCase() : '';
        const student = this.createOrUpdateStudent({
          student_number: row.student_number,
          first_name: row.first_name,
          middle_name: row.middle_name,
          last_name: row.last_name,
          gender: genderTitled,
          birth_date: row.birth_date,
          contact_number: row.contact_number,
        });
        created += 1;
        if (cls) {
          this.db.enrollments.push({
            enrollment_id: this.db.nextId.enrollment++,
            student_id: student.student_id,
            class_id: cls.class_id,
            date_enrolled: todayIso(),
            status: 'Enrolled',
          });
          enrolled += 1;
        }
      } catch (err) {
        errors.push(`Row ${lineNo}: ${(err as Error).message}`);
      }
    });

    return { created, enrolled, errors };
  }

  // Classes CRUD
  public createOrUpdateClass(
    input: {
      class_code: string;
      class_name?: string;
      grade_level: string;
      section: string;
      adviser_id?: number | null;
      school_year_id: number;
    },
    existingId?: number,
  ): ClassSection {
    const class_code = required(input.class_code, 'Class code').toUpperCase();
    const dupCode = this.db.classes.find(
      (c) => c.class_code === class_code && c.class_id !== existingId,
    );
    if (dupCode) throw new ValidationError(`Class code ${class_code} already exists.`);

    const grade_level = validateChoice(input.grade_level, GRADE_LEVELS, 'Grade level');
    const section = required(input.section, 'Section');
    const sy = this.db.school_years.find((y) => y.school_year_id === input.school_year_id);
    if (!sy) throw new ValidationError('Please select a school year.');

    const dupCombo = this.db.classes.find(
      (c) =>
        c.grade_level === grade_level &&
        c.section.toLowerCase() === section.toLowerCase() &&
        c.school_year_id === sy.school_year_id &&
        c.class_id !== existingId,
    );
    if (dupCombo) {
      throw new ValidationError(
        `${grade_level} - ${section} already exists for school year ${sy.name}.`,
      );
    }

    const adviser_id = input.adviser_id || null;
    if (adviser_id && !this.db.users.find((u) => u.user_id === adviser_id)) {
      throw new ValidationError('Selected adviser was not found.');
    }

    const class_name = optional(input.class_name) ?? `${grade_level} - ${section}`;

    if (existingId !== undefined) {
      const cls = this.db.classes.find((c) => c.class_id === existingId);
      if (!cls) throw new ValidationError('Class not found.');
      Object.assign(cls, {
        class_code,
        class_name,
        grade_level,
        section,
        adviser_id,
        school_year_id: sy.school_year_id,
      });
      return cls;
    }

    const created: ClassSection = {
      class_id: this.db.nextId.class++,
      class_code,
      class_name,
      grade_level,
      section,
      adviser_id,
      school_year_id: sy.school_year_id,
    };
    this.db.classes.push(created);
    return created;
  }

  // Attendance Recording
  public recordClassAttendance(
    classId: number,
    dateValue: string,
    entries: Array<{ student_id: number; status: AttendanceStatusCode; remarks?: string }>,
    userId: number,
    subject?: string,
    period: AttendancePeriod = 'Whole Day',
  ): AttendanceRecord[] {
    const cls = this.db.classes.find((c) => c.class_id === classId);
    if (!cls) throw new ValidationError('Please select a class.');
    const sy = this.db.school_years.find((y) => y.school_year_id === cls.school_year_id);
    const attendanceDate = validateSchoolDate(dateValue, sy);
    validateChoice(period, PERIODS, 'Attendance period');
    if (entries.length === 0) {
      throw new ValidationError(
        'There are no students to record. Enroll students in this class first.',
      );
    }

    const errors: string[] = [];
    const rosterIds = new Set(this.classRoster(cls.class_id).map((s) => s.student_id));
    const studentsById = new Map(this.db.students.map((s) => [s.student_id, s]));

    for (const item of entries) {
      const st = studentsById.get(item.student_id);
      if (!st) {
        errors.push(`Student #${item.student_id} not found.`);
        continue;
      }
      const name = `${st.first_name} ${st.last_name}`;
      if (st.status !== 'Active') {
        errors.push(`${name} is inactive and cannot be marked.`);
      }
      if (!rosterIds.has(st.student_id)) {
        errors.push(`${name} is not enrolled in ${cls.grade_level} - ${cls.section}.`);
      }
      if (!STATUS_CODES.includes(item.status)) {
        errors.push(`Please select an attendance status for ${name}.`);
      }
      const dup = this.db.attendance.find(
        (a) =>
          a.student_id === st.student_id &&
          a.class_id === cls.class_id &&
          a.attendance_date === attendanceDate,
      );
      if (dup) {
        errors.push(
          `Attendance for ${name} on ${attendanceDate} has already been recorded.`,
        );
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(errors.join('\n'));
    }

    const now = new Date().toISOString();
    const created: AttendanceRecord[] = [];
    for (const item of entries) {
      const rec: AttendanceRecord = {
        attendance_id: this.db.nextId.attendance++,
        student_id: item.student_id,
        class_id: cls.class_id,
        attendance_date: attendanceDate,
        subject: optional(subject),
        period,
        status: item.status,
        remarks: optional(item.remarks),
        recorded_by: userId,
        recorded_at: now,
        updated_at: null,
      };
      this.db.attendance.push(rec);
      this.syncAbsence(rec);
      created.push(rec);
    }
    return created;
  }

  public updateAttendance(
    attendanceId: number,
    status: AttendanceStatusCode,
    remarks: string | undefined,
    userId: number,
  ): AttendanceRecord {
    if (!STATUS_CODES.includes(status)) {
      throw new ValidationError('Please select a valid attendance status.');
    }
    const rec = this.db.attendance.find((a) => a.attendance_id === attendanceId);
    if (!rec) throw new ValidationError('Attendance record not found.');
    rec.status = status;
    rec.remarks = optional(remarks);
    rec.recorded_by = userId;
    rec.updated_at = new Date().toISOString();
    this.syncAbsence(rec);
    return rec;
  }

  // Excuses
  public submitExcuse(
    absenceId: number,
    reason: string,
    remarks: string | undefined,
    attachment: string | null,
    attachmentData: string | null,
    userId: number,
  ): ExcuseRecord {
    const absence = this.db.absence_records.find((a) => a.absence_id === absenceId);
    if (!absence) throw new ValidationError('Absence record not found.');
    if (!reason) throw new ValidationError('Reason for the absence is required.');
    if (!EXCUSE_REASONS.includes(reason as (typeof EXCUSE_REASONS)[number])) {
      throw new ValidationError('Please select a valid reason.');
    }
    if (reason === 'Other' && !(remarks ?? '').trim()) {
      throw new ValidationError(
        "Please describe the reason in Remarks when 'Other' is selected.",
      );
    }
    const existingExcuses = this.db.excuses.filter((e) => e.absence_id === absenceId);
    if (absence.status === 'Excused' && existingExcuses.length === 0) {
      throw new ValidationError('This absence is already marked as excused.');
    }
    if (existingExcuses.some((e) => e.status === 'Pending' || e.status === 'Approved')) {
      const st = this.db.students.find((s) => s.student_id === absence.student_id);
      throw new ValidationError(
        `An excuse for ${st ? `${st.first_name} ${st.last_name}` : 'this student'} on ${absence.absence_date} is already pending or approved.`,
      );
    }

    const excuse: ExcuseRecord = {
      excuse_id: this.db.nextId.excuse++,
      absence_id: absence.absence_id,
      student_id: absence.student_id,
      reason,
      remarks: optional(remarks),
      attachment,
      attachment_data: attachmentData,
      status: 'Pending',
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
      reviewed_by: null,
      reviewed_at: null,
      review_remarks: null,
    };
    this.db.excuses.push(excuse);
    return excuse;
  }

  public reviewExcuse(
    excuseId: number,
    decision: 'Approved' | 'Rejected',
    reviewRemarks: string | undefined,
    userId: number,
  ): ExcuseRecord {
    const excuse = this.db.excuses.find((e) => e.excuse_id === excuseId);
    if (!excuse) throw new ValidationError('Excuse request not found.');
    if (excuse.status !== 'Pending') {
      throw new ValidationError(
        `This excuse has already been ${excuse.status.toLowerCase()}.`,
      );
    }
    if (decision !== 'Approved' && decision !== 'Rejected') {
      throw new ValidationError('Decision must be Approved or Rejected.');
    }
    if (decision === 'Rejected' && !(reviewRemarks ?? '').trim()) {
      throw new ValidationError('Please give a reason when rejecting an excuse.');
    }

    excuse.status = decision;
    excuse.review_remarks = optional(reviewRemarks);
    excuse.reviewed_by = userId;
    excuse.reviewed_at = new Date().toISOString();

    const absence = this.db.absence_records.find(
      (a) => a.absence_id === excuse.absence_id,
    );
    if (absence) {
      const att = this.db.attendance.find(
        (a) => a.attendance_id === absence.attendance_id,
      );
      if (att) {
        if (decision === 'Approved' && att.status === 'A') {
          att.status = 'E';
        }
        this.syncAbsence(att);
      }
    }
    return excuse;
  }

  // Backup & Restore
  public createBackup(label?: string): BackupEntry {
    const data: BackupPayload['data'] = {
      school_years: structuredClone(this.db.school_years),
      users: structuredClone(this.db.users),
      students: structuredClone(this.db.students),
      classes: structuredClone(this.db.classes),
      enrollments: structuredClone(this.db.enrollments),
      attendance: structuredClone(this.db.attendance),
      absence_records: structuredClone(this.db.absence_records),
      excuses: structuredClone(this.db.excuses),
      attendance_settings: structuredClone(this.db.attendance_settings),
    };
    const tables: Record<string, number> = {};
    for (const key of TABLE_ORDER) {
      tables[key] = data[key].length;
    }
    const created_at = new Date().toISOString();
    const payload: BackupPayload = {
      meta: {
        system: 'School Attendance System',
        created_at,
        database: 'in-memory',
        tables,
        checksum: computeChecksum(data),
      },
      data,
    };
    const stamp = created_at.replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    const suffix = label ? `_${label}` : '';
    const name = `attendance_backup_${stamp}${suffix}.json`;
    const jsonBytes = Buffer.byteLength(JSON.stringify(payload, null, 2), 'utf8');
    const entry: BackupEntry = {
      name,
      created_at,
      size_kb: Math.round((jsonBytes / 1024) * 10) / 10,
      payload,
    };
    this.backups.unshift(entry);
    return entry;
  }

  public verifyBackupPayload(payload: BackupPayload): BackupPayload {
    if (!payload || typeof payload !== 'object' || !payload.data || !payload.meta) {
      throw new ValidationError('Backup file cannot be read or is malformed.');
    }
    const keys = Object.keys(payload.data);
    if (
      keys.length !== TABLE_ORDER.length ||
      TABLE_ORDER.some((t) => !Array.isArray(payload.data[t]))
    ) {
      throw new ValidationError('Backup file is missing one or more tables.');
    }
    if (payload.meta.checksum !== computeChecksum(payload.data)) {
      throw new ValidationError(
        'Checksum mismatch - the backup file is damaged or was modified.',
      );
    }
    for (const t of TABLE_ORDER) {
      if (payload.data[t].length !== payload.meta.tables?.[t]) {
        throw new ValidationError(`Row count mismatch in table ${t}.`);
      }
    }
    return payload;
  }

  public restoreFromPayload(rawPayload: BackupPayload): {
    meta: BackupPayload['meta'];
    safetyName: string;
  } {
    const payload = this.verifyBackupPayload(rawPayload);
    const safety = this.createBackup('before_restore');
    const d = structuredClone(payload.data);
    const maxId = <T>(arr: T[], getter: (x: T) => number) =>
      arr.reduce((m, item) => Math.max(m, getter(item) || 0), 0) + 1;

    this.db = {
      ...d,
      nextId: {
        school_year: maxId(d.school_years, (x) => x.school_year_id),
        user: maxId(d.users, (x) => x.user_id),
        student: maxId(d.students, (x) => x.student_id),
        class: maxId(d.classes, (x) => x.class_id),
        enrollment: maxId(d.enrollments, (x) => x.enrollment_id),
        attendance: maxId(d.attendance, (x) => x.attendance_id),
        absence: maxId(d.absence_records, (x) => x.absence_id),
        excuse: maxId(d.excuses, (x) => x.excuse_id),
        setting: maxId(d.attendance_settings, (x) => x.setting_id),
      },
    };
    return { meta: payload.meta, safetyName: safety.name };
  }
}

export const store = new AttendanceStore();
