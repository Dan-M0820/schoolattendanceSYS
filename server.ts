import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  AttendancePeriod,
  AttendanceStatusCode,
  canAccess,
  ModuleKey,
  ROLES,
  SchoolYear,
  STATUS_LABELS,
  UserRole,
} from './src/shared/types';
import {
  formatLongDate,
  formatShortDate,
  parseDate,
  required,
  todayIso,
  validateChoice,
  validatePassword,
  validateSchoolDate,
  validateUsername,
  ValidationError,
} from './src/shared/validation';
import {
  AttendanceFilters,
  countRecords,
  filterAttendanceRecords,
  summarizeCounts,
} from './src/shared/stats';
import { toCsv } from './src/shared/csv';
import { BackupPayload, hashPassword, SCHOOL_NAME, store, StoredUser } from './src/server/store';

const SESSION_COOKIE = 'sas_session';
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface AuthedRequest extends Request {
  currentUser?: StoredUser;
}

function signSession(userId: number, remember: boolean): string {
  const exp = Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ userId, exp })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token: string | undefined): number | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof parsed.userId === 'number' && parsed.exp > Date.now()) {
      return parsed.userId;
    }
  } catch {
    return null;
  }
  return null;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const uid = verifySession(cookies[SESSION_COOKIE]);
  if (uid !== null) {
    const user = store.db.users.find((u) => u.user_id === uid && u.is_active_user);
    if (user) req.currentUser = user;
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
}

function requireModule(mod: ModuleKey) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!canAccess(mod, req.currentUser.role)) {
      return res
        .status(403)
        .json({ error: 'Your role does not have access to this module.' });
    }
    next();
  };
}

function handleError(res: Response, err: unknown) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
}

function buildReportFilters(query: Record<string, unknown>): AttendanceFilters {
  const f: AttendanceFilters = {};
  if (typeof query.date_from === 'string' && query.date_from) {
    f.date_from = parseDate(query.date_from, 'From date');
  }
  if (typeof query.date_to === 'string' && query.date_to) {
    f.date_to = parseDate(query.date_to, 'To date');
  }
  if (f.date_from && f.date_to && f.date_from > f.date_to) {
    throw new ValidationError('From date must be before or equal to To date.');
  }
  if (query.school_year_id) f.school_year_id = Number(query.school_year_id);
  if (typeof query.grade_level === 'string' && query.grade_level) {
    f.grade_level = query.grade_level;
  }
  if (typeof query.section === 'string' && query.section) {
    f.section = query.section;
  }
  if (query.class_id) f.class_id = Number(query.class_id);
  if (query.student_id) f.student_id = Number(query.student_id);
  if (
    typeof query.status === 'string' &&
    ['P', 'A', 'L', 'E'].includes(query.status)
  ) {
    f.status = query.status as AttendanceStatusCode;
  }
  return f;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(attachUser);

  const api = express.Router();

  // Auth routes
  api.get('/auth/me', (req: AuthedRequest, res) => {
    res.json({
      school_name: SCHOOL_NAME,
      active_school_year: store.activeSchoolYear(),
      user: req.currentUser ? store.publicUser(req.currentUser) : null,
    });
  });

  api.post('/auth/login', (req: AuthedRequest, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const remember = Boolean(req.body?.remember);
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const user = store.authenticate(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const token = signSession(user.user_id, remember);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : undefined,
      path: '/',
    });
    res.json({
      user,
      school_name: SCHOOL_NAME,
      active_school_year: store.activeSchoolYear(),
    });
  });

  api.post('/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  api.post('/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
    try {
      store.changePassword(
        req.currentUser!.user_id,
        String(req.body?.current_password ?? ''),
        String(req.body?.new_password ?? ''),
        String(req.body?.confirm_password ?? ''),
      );
      res.json({ message: 'Password changed.' });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Dashboard
  api.get('/dashboard', requireModule('dashboard'), (_req, res) => {
    res.json(store.dashboardData());
  });

  // Students
  api.get('/students', requireModule('students'), (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const classId = req.query.class_id ? Number(req.query.class_id) : null;
    const status = String(req.query.status ?? '');
    const page = Math.max(1, Number(req.query.page ?? 1));
    const perPage = 20;

    let items = [...store.db.students];
    if (q) {
      items = items.filter(
        (s) =>
          s.student_number.toLowerCase().includes(q) ||
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q),
      );
    }
    if (status === 'Active' || status === 'Inactive') {
      items = items.filter((s) => s.status === status);
    }
    if (classId) {
      const enrolledSet = new Set(
        store.db.enrollments
          .filter((e) => e.class_id === classId && e.status === 'Enrolled')
          .map((e) => e.student_id),
      );
      items = items.filter((s) => enrolledSet.has(s.student_id));
    }
    items.sort((a, b) => {
      const l = a.last_name.localeCompare(b.last_name);
      return l !== 0 ? l : a.first_name.localeCompare(b.first_name);
    });

    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const clampedPage = Math.min(page, pages);
    const slice = items.slice((clampedPage - 1) * perPage, clampedPage * perPage);

    const enriched = slice.map((s) => {
      const cls = store.currentClassForStudent(s.student_id);
      return {
        ...s,
        current_class: cls ? { class_id: cls.class_id, label: `${cls.grade_level} - ${cls.section}` } : null,
      };
    });

    const classes = [...store.db.classes]
      .sort((a, b) => a.grade_level.localeCompare(b.grade_level) || a.section.localeCompare(b.section))
      .map((c) => {
        const sy = store.db.school_years.find((y) => y.school_year_id === c.school_year_id);
        return {
          ...c,
          label: `${c.grade_level} - ${c.section}`,
          school_year_name: sy?.name ?? '',
        };
      });

    res.json({
      items: enriched,
      page: clampedPage,
      pages,
      total,
      classes,
    });
  });

  api.post('/students', requireModule('students'), (req, res) => {
    try {
      const student = store.createOrUpdateStudent(req.body);
      res.status(201).json({ student });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.get('/students/:id', requireModule('students'), (req, res) => {
    const sid = Number(req.params.id);
    const student = store.db.students.find((s) => s.student_id === sid);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const classesById = new Map(store.db.classes.map((c) => [c.class_id, c]));
    const syById = new Map(store.db.school_years.map((y) => [y.school_year_id, y]));
    const currentClass = store.currentClassForStudent(sid);

    const enrollments = store.db.enrollments
      .filter((e) => e.student_id === sid)
      .map((e) => {
        const cls = classesById.get(e.class_id);
        const sy = cls ? syById.get(cls.school_year_id) : null;
        return {
          ...e,
          class_label: cls ? `${cls.grade_level} - ${cls.section}` : '—',
          school_year_name: sy?.name ?? '—',
        };
      });

    const allAtt = store.db.attendance
      .filter((a) => a.student_id === sid)
      .sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));
    const summary = summarizeCounts(countRecords(allAtt), store.lateCountsAsPresent());
    const history = allAtt.slice(0, 60).map((a) => {
      const cls = classesById.get(a.class_id);
      return {
        ...a,
        class_label: cls ? `${cls.grade_level} - ${cls.section}` : '—',
      };
    });

    const excusesByAbs = new Map<number, typeof store.db.excuses>();
    for (const ex of store.db.excuses) {
      if (!excusesByAbs.has(ex.absence_id)) excusesByAbs.set(ex.absence_id, []);
      excusesByAbs.get(ex.absence_id)!.push(ex);
    }
    const absences = store.db.absence_records
      .filter((ab) => ab.student_id === sid)
      .sort((a, b) => b.absence_date.localeCompare(a.absence_date))
      .map((ab) => {
        const list = (excusesByAbs.get(ab.absence_id) ?? []).sort((a, b) =>
          b.submitted_at.localeCompare(a.submitted_at),
        );
        return {
          ...ab,
          latest_excuse_status: list[0]?.status ?? null,
        };
      });

    res.json({
      student,
      current_class: currentClass
        ? { class_id: currentClass.class_id, label: `${currentClass.grade_level} - ${currentClass.section}` }
        : null,
      enrollments,
      summary,
      history,
      absences,
    });
  });

  api.put('/students/:id', requireModule('students'), (req, res) => {
    try {
      const sid = Number(req.params.id);
      const student = store.createOrUpdateStudent(req.body, sid);
      res.json({ student });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.post('/students/:id/toggle-status', requireModule('students'), (req, res) => {
    const sid = Number(req.params.id);
    const student = store.db.students.find((s) => s.student_id === sid);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    student.status = student.status === 'Active' ? 'Inactive' : 'Active';
    res.json({ student });
  });

  api.delete('/students/:id', requireModule('students'), (req, res) => {
    const sid = Number(req.params.id);
    const idx = store.db.students.findIndex((s) => s.student_id === sid);
    if (idx < 0) return res.status(404).json({ error: 'Student not found.' });
    const hasAttendance = store.db.attendance.some((a) => a.student_id === sid);
    if (hasAttendance) {
      store.db.students[idx].status = 'Inactive';
      return res.json({
        deactivated: true,
        message:
          'This student already has attendance records, so the record was deactivated instead of deleted to preserve attendance history.',
      });
    }
    store.db.enrollments = store.db.enrollments.filter((e) => e.student_id !== sid);
    store.db.students.splice(idx, 1);
    res.json({ deactivated: false, message: 'Student deleted.' });
  });

  api.post('/students/import', requireModule('students'), (req, res) => {
    const csvText = String(req.body?.csv ?? '');
    const classCode = req.body?.class_code ? String(req.body.class_code) : undefined;
    if (!csvText.trim()) {
      return res.status(400).json({ error: 'Please provide CSV content to import.' });
    }
    const result = store.importStudentsCsv(csvText, classCode);
    res.json(result);
  });

  // Classes
  api.get('/classes', requireModule('classes'), (req, res) => {
    const activeSy = store.activeSchoolYear();
    const syParam = req.query.school_year_id;
    const syId =
      syParam !== undefined
        ? Number(syParam)
        : activeSy
          ? activeSy.school_year_id
          : 0;

    let classes = [...store.db.classes];
    if (syId > 0) {
      classes = classes.filter((c) => c.school_year_id === syId);
    }
    classes.sort(
      (a, b) => a.grade_level.localeCompare(b.grade_level) || a.section.localeCompare(b.section),
    );

    const syById = new Map(store.db.school_years.map((y) => [y.school_year_id, y]));
    const usersById = new Map(store.db.users.map((u) => [u.user_id, u]));

    const items = classes.map((c) => ({
      ...c,
      label: `${c.grade_level} - ${c.section}`,
      adviser_name: c.adviser_id ? usersById.get(c.adviser_id)?.full_name ?? null : null,
      school_year_name: syById.get(c.school_year_id)?.name ?? '',
      roster_count: store.classRoster(c.class_id).length,
    }));

    const advisers = store.db.users
      .filter((u) => u.is_active_user && (u.role === 'Teacher' || u.role === 'Adviser'))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map((u) => store.publicUser(u));

    res.json({
      classes: items,
      sy_id: syId,
      school_years: [...store.db.school_years].sort((a, b) =>
        b.start_date.localeCompare(a.start_date),
      ),
      advisers,
    });
  });

  api.post('/classes', requireModule('classes'), (req: AuthedRequest, res) => {
    if (!['Administrator', 'Registrar'].includes(req.currentUser!.role)) {
      return res.status(403).json({ error: 'Only Administrators and Registrars can create classes.' });
    }
    try {
      const cls = store.createOrUpdateClass({
        ...req.body,
        school_year_id: Number(req.body.school_year_id),
        adviser_id: req.body.adviser_id ? Number(req.body.adviser_id) : null,
      });
      res.status(201).json({ class_section: cls });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.get('/classes/:id', requireModule('classes'), (req: AuthedRequest, res) => {
    const classId = Number(req.params.id);
    const cls = store.db.classes.find((c) => c.class_id === classId);
    if (!cls) return res.status(404).json({ error: 'Class not found.' });

    if (
      ['Teacher', 'Adviser'].includes(req.currentUser!.role) &&
      cls.adviser_id !== req.currentUser!.user_id
    ) {
      return res.status(403).json({
        error: 'You are not authorized to view the roster for a class you do not advise.',
      });
    }

    const sy = store.db.school_years.find((y) => y.school_year_id === cls.school_year_id);
    const adviser = cls.adviser_id
      ? store.db.users.find((u) => u.user_id === cls.adviser_id)
      : null;
    const studentsById = new Map(store.db.students.map((s) => [s.student_id, s]));
    const enrollments = store.db.enrollments
      .filter((e) => e.class_id === classId)
      .map((e) => {
        const st = studentsById.get(e.student_id)!;
        return { ...e, student: st };
      })
      .sort((a, b) => a.student.last_name.localeCompare(b.student.last_name));

    res.json({
      class_section: {
        ...cls,
        label: `${cls.grade_level} - ${cls.section}`,
        school_year_name: sy?.name ?? '',
        adviser_name: adviser?.full_name ?? null,
      },
      enrollments,
    });
  });

  api.put('/classes/:id', requireModule('classes'), (req: AuthedRequest, res) => {
    if (!['Administrator', 'Registrar'].includes(req.currentUser!.role)) {
      return res.status(403).json({ error: 'Only Administrators and Registrars can edit classes.' });
    }
    try {
      const cls = store.createOrUpdateClass(
        {
          ...req.body,
          school_year_id: Number(req.body.school_year_id),
          adviser_id: req.body.adviser_id ? Number(req.body.adviser_id) : null,
        },
        Number(req.params.id),
      );
      res.json({ class_section: cls });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.delete('/classes/:id', requireModule('classes'), (req: AuthedRequest, res) => {
    if (!['Administrator', 'Registrar'].includes(req.currentUser!.role)) {
      return res.status(403).json({ error: 'Only Administrators and Registrars can delete classes.' });
    }
    const classId = Number(req.params.id);
    if (store.db.attendance.some((a) => a.class_id === classId)) {
      return res.status(400).json({
        error: 'This class already has attendance records and cannot be deleted.',
      });
    }
    const idx = store.db.classes.findIndex((c) => c.class_id === classId);
    if (idx < 0) return res.status(404).json({ error: 'Class not found.' });
    store.db.enrollments = store.db.enrollments.filter((e) => e.class_id !== classId);
    store.db.classes.splice(idx, 1);
    res.json({ message: 'Class deleted.' });
  });

  // Enrollments
  api.get('/classes/:id/enroll-candidates', requireModule('enrollments'), (req, res) => {
    const classId = Number(req.params.id);
    const cls = store.db.classes.find((c) => c.class_id === classId);
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const enrolledIds = new Set(
      store.db.enrollments
        .filter((e) => e.class_id === classId && e.status === 'Enrolled')
        .map((e) => e.student_id),
    );
    const candidates = store.db.students
      .filter((s) => s.status === 'Active' && !enrolledIds.has(s.student_id))
      .filter(
        (s) =>
          !q ||
          s.student_number.toLowerCase().includes(q) ||
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q),
      )
      .sort((a, b) => a.last_name.localeCompare(b.last_name))
      .map((s) => {
        const cur = store.currentClassForStudent(s.student_id);
        return {
          ...s,
          current_class_label: cur ? `${cur.grade_level} - ${cur.section}` : null,
        };
      });
    const sy = store.db.school_years.find((y) => y.school_year_id === cls.school_year_id);
    res.json({
      class_section: { ...cls, label: `${cls.grade_level} - ${cls.section}`, school_year_name: sy?.name ?? '' },
      candidates,
    });
  });

  api.post('/classes/:id/enroll', requireModule('enrollments'), (req, res) => {
    const classId = Number(req.params.id);
    const cls = store.db.classes.find((c) => c.class_id === classId);
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    const ids: number[] = Array.isArray(req.body?.student_ids)
      ? req.body.student_ids.map(Number)
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Select at least one student to enroll.' });
    }

    const classesById = new Map(store.db.classes.map((c) => [c.class_id, c]));
    let added = 0;
    const skipped: string[] = [];

    for (const sid of ids) {
      const student = store.db.students.find((s) => s.student_id === sid);
      if (!student || student.status !== 'Active') {
        skipped.push(`${student ? `${student.first_name} ${student.last_name}` : sid} (inactive or not found)`);
        continue;
      }
      const other = store.db.enrollments.find((e) => {
        if (e.student_id !== sid || e.status !== 'Enrolled' || e.class_id === classId) {
          return false;
        }
        return classesById.get(e.class_id)?.school_year_id === cls.school_year_id;
      });
      if (other) {
        const otherCls = classesById.get(other.class_id)!;
        skipped.push(
          `${student.first_name} ${student.last_name} (already in ${otherCls.grade_level} - ${otherCls.section})`,
        );
        continue;
      }
      const existing = store.db.enrollments.find(
        (e) => e.student_id === sid && e.class_id === classId,
      );
      if (existing) {
        if (existing.status === 'Enrolled') {
          skipped.push(`${student.first_name} ${student.last_name} (already enrolled)`);
          continue;
        }
        existing.status = 'Enrolled';
        existing.date_enrolled = todayIso();
      } else {
        store.db.enrollments.push({
          enrollment_id: store.db.nextId.enrollment++,
          student_id: sid,
          class_id: classId,
          date_enrolled: todayIso(),
          status: 'Enrolled',
        });
      }
      added += 1;
    }

    res.json({ added, skipped });
  });

  api.post('/classes/:id/enrollments/:studentId/remove', requireModule('enrollments'), (req, res) => {
    const classId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const enrollment = store.db.enrollments.find(
      (e) => e.class_id === classId && e.student_id === studentId,
    );
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
    const status = req.body?.status === 'Transferred' ? 'Transferred' : 'Dropped';
    enrollment.status = status;
    res.json({ enrollment });
  });

  // Attendance
  api.get('/attendance', requireModule('attendance'), (req, res) => {
    const sy = store.activeSchoolYear();
    const classes = store.db.classes
      .filter((c) => !sy || c.school_year_id === sy.school_year_id)
      .sort((a, b) => a.grade_level.localeCompare(b.grade_level) || a.section.localeCompare(b.section))
      .map((c) => ({ ...c, label: `${c.grade_level} - ${c.section}` }));

    const classId = req.query.class_id ? Number(req.query.class_id) : null;
    const dateStr = String(req.query.date ?? todayIso());

    if (!classId) {
      return res.json({
        classes,
        class_section: null,
        date_str: dateStr,
        date_error: null,
        roster: [],
        pending: [],
        existing: [],
      });
    }

    const cls = store.db.classes.find((c) => c.class_id === classId);
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    const clsSy = store.db.school_years.find((y) => y.school_year_id === cls.school_year_id);

    let selDate: string | null = null;
    let dateError: string | null = null;
    try {
      selDate = validateSchoolDate(dateStr, clsSy);
    } catch (err) {
      dateError = (err as Error).message;
    }

    const roster = store.classRoster(cls.class_id);
    const existingMap = new Map<number, (typeof store.db.attendance)[number]>();
    if (selDate) {
      for (const a of store.db.attendance) {
        if (a.class_id === cls.class_id && a.attendance_date === selDate) {
          existingMap.set(a.student_id, a);
        }
      }
    }

    const usersById = new Map(store.db.users.map((u) => [u.user_id, u]));
    const absenceByAtt = new Map(
      store.db.absence_records.map((ab) => [ab.attendance_id, ab]),
    );

    const pending = roster.filter((s) => !existingMap.has(s.student_id));
    const existing = roster
      .filter((s) => existingMap.has(s.student_id))
      .map((s) => {
        const rec = existingMap.get(s.student_id)!;
        const abs = absenceByAtt.get(rec.attendance_id);
        return {
          ...rec,
          student: s,
          absence: abs ?? null,
          recorder_name: rec.recorded_by ? usersById.get(rec.recorded_by)?.full_name ?? '' : '',
        };
      });

    res.json({
      classes,
      class_section: { ...cls, label: `${cls.grade_level} - ${cls.section}` },
      date_str: dateStr,
      sel_date: selDate,
      date_error: dateError,
      roster,
      pending,
      existing,
    });
  });

  api.post('/attendance', requireModule('attendance'), (req: AuthedRequest, res) => {
    try {
      const classId = Number(req.body?.class_id);
      const dateStr = String(req.body?.date ?? '');
      const subject = String(req.body?.subject ?? '');
      const period = (req.body?.period ?? 'Whole Day') as AttendancePeriod;
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
      const created = store.recordClassAttendance(
        classId,
        dateStr,
        entries,
        req.currentUser!.user_id,
        subject,
        period,
      );
      const absents = created.filter((r) => r.status === 'A').length;
      const cls = store.db.classes.find((c) => c.class_id === classId)!;
      let message = `Attendance saved for ${created.length} student(s) in ${cls.grade_level} - ${cls.section}.`;
      if (absents > 0) {
        message += ` ${absents} absence record(s) created automatically.`;
      }
      res.status(201).json({ created, message });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.get('/attendance/:id', requireModule('attendance'), (req, res) => {
    const id = Number(req.params.id);
    const record = store.db.attendance.find((a) => a.attendance_id === id);
    if (!record) return res.status(404).json({ error: 'Attendance record not found.' });
    const student = store.db.students.find((s) => s.student_id === record.student_id);
    const cls = store.db.classes.find((c) => c.class_id === record.class_id);
    const absence = store.db.absence_records.find((ab) => ab.attendance_id === id);
    const hasExcuses = absence
      ? store.db.excuses.some((e) => e.absence_id === absence.absence_id)
      : false;
    res.json({
      record,
      student,
      class_section: cls ? { ...cls, label: `${cls.grade_level} - ${cls.section}` } : null,
      has_excuses: hasExcuses,
    });
  });

  api.put('/attendance/:id', requireModule('attendance'), (req: AuthedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const updated = store.updateAttendance(
        id,
        req.body?.status,
        req.body?.remarks,
        req.currentUser!.user_id,
      );
      res.json({ record: updated });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Absences
  api.get('/absences', requireModule('absences'), (req, res) => {
    try {
      const q = String(req.query.q ?? '').trim().toLowerCase();
      const dateFrom = req.query.date_from
        ? parseDate(String(req.query.date_from), 'From date')
        : null;
      const dateTo = req.query.date_to
        ? parseDate(String(req.query.date_to), 'To date')
        : null;
      const classId = req.query.class_id ? Number(req.query.class_id) : null;
      const status = String(req.query.status ?? '');
      const page = Math.max(1, Number(req.query.page ?? 1));
      const perPage = 25;

      const studentsById = new Map(store.db.students.map((s) => [s.student_id, s]));
      const classesById = new Map(store.db.classes.map((c) => [c.class_id, c]));
      const syById = new Map(store.db.school_years.map((y) => [y.school_year_id, y]));

      const excusesByAbs = new Map<number, typeof store.db.excuses>();
      for (const ex of store.db.excuses) {
        if (!excusesByAbs.has(ex.absence_id)) excusesByAbs.set(ex.absence_id, []);
        excusesByAbs.get(ex.absence_id)!.push(ex);
      }

      let items = [...store.db.absence_records];
      if (dateFrom) items = items.filter((a) => a.absence_date >= dateFrom);
      if (dateTo) items = items.filter((a) => a.absence_date <= dateTo);
      if (classId) items = items.filter((a) => a.class_id === classId);
      if (status === 'Excused' || status === 'Unexcused') {
        items = items.filter((a) => a.status === status);
      }
      if (q) {
        items = items.filter((a) => {
          const st = studentsById.get(a.student_id);
          if (!st) return false;
          return (
            st.student_number.toLowerCase().includes(q) ||
            st.first_name.toLowerCase().includes(q) ||
            st.last_name.toLowerCase().includes(q)
          );
        });
      }

      items.sort((a, b) => {
        const d = b.absence_date.localeCompare(a.absence_date);
        if (d !== 0) return d;
        const sa = studentsById.get(a.student_id)?.last_name ?? '';
        const sb = studentsById.get(b.student_id)?.last_name ?? '';
        return sa.localeCompare(sb);
      });

      const total = items.length;
      const pages = Math.max(1, Math.ceil(total / perPage));
      const clampedPage = Math.min(page, pages);
      const slice = items.slice((clampedPage - 1) * perPage, clampedPage * perPage);

      const enriched = slice.map((a) => {
        const st = studentsById.get(a.student_id)!;
        const cls = classesById.get(a.class_id)!;
        const exList = (excusesByAbs.get(a.absence_id) ?? []).sort((x, y) =>
          y.submitted_at.localeCompare(x.submitted_at),
        );
        return {
          ...a,
          student: st,
          class_label: cls ? `${cls.grade_level} - ${cls.section}` : '—',
          latest_excuse: exList[0] ?? null,
          has_open_excuse: exList.some(
            (e) => e.status === 'Pending' || e.status === 'Approved',
          ),
        };
      });

      const classes = [...store.db.classes]
        .sort((a, b) => a.grade_level.localeCompare(b.grade_level) || a.section.localeCompare(b.section))
        .map((c) => ({
          ...c,
          label: `${c.grade_level} - ${c.section}`,
          school_year_name: syById.get(c.school_year_id)?.name ?? '',
        }));

      res.json({ items: enriched, page: clampedPage, pages, total, classes });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.get('/absences/summary', requireModule('absences'), (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const sid = req.query.student_id ? Number(req.query.student_id) : null;
    let student = sid ? store.db.students.find((s) => s.student_id === sid) ?? null : null;
    let matches: typeof store.db.students = [];
    if (!student && q) {
      matches = store.db.students
        .filter(
          (s) =>
            s.student_number.toLowerCase().includes(q) ||
            s.first_name.toLowerCase().includes(q) ||
            s.last_name.toLowerCase().includes(q),
        )
        .sort((a, b) => a.last_name.localeCompare(b.last_name))
        .slice(0, 20);
      if (matches.length === 1) student = matches[0];
    }

    let summary = null;
    let currentClass = null;
    if (student) {
      const records = store.db.attendance.filter((a) => a.student_id === student!.student_id);
      summary = summarizeCounts(countRecords(records), store.lateCountsAsPresent());
      const cls = store.currentClassForStudent(student.student_id);
      currentClass = cls ? `${cls.grade_level} - ${cls.section}` : null;
    }

    res.json({ student, current_class: currentClass, summary, matches });
  });

  api.get('/absences/:id', requireModule('absences'), (req, res) => {
    const id = Number(req.params.id);
    const absence = store.db.absence_records.find((a) => a.absence_id === id);
    if (!absence) return res.status(404).json({ error: 'Absence record not found.' });

    const student = store.db.students.find((s) => s.student_id === absence.student_id)!;
    const cls = store.db.classes.find((c) => c.class_id === absence.class_id)!;
    const attendance = store.db.attendance.find(
      (a) => a.attendance_id === absence.attendance_id,
    )!;
    const usersById = new Map(store.db.users.map((u) => [u.user_id, u]));
    const excuses = store.db.excuses
      .filter((e) => e.absence_id === id)
      .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
      .map((e) => ({
        ...e,
        reviewer_name: e.reviewed_by ? usersById.get(e.reviewed_by)?.full_name ?? null : null,
      }));

    res.json({
      absence,
      student,
      class_label: `${cls.grade_level} - ${cls.section}`,
      attendance,
      recorder_name: attendance.recorded_by
        ? usersById.get(attendance.recorded_by)?.full_name ?? null
        : null,
      excuses,
      has_open_excuse: excuses.some(
        (e) => e.status === 'Pending' || e.status === 'Approved',
      ),
    });
  });

  // Excuses
  api.get('/excuses', requireModule('excuses'), (req, res) => {
    const status = String(req.query.status ?? 'Pending');
    const counts = {
      Pending: store.db.excuses.filter((e) => e.status === 'Pending').length,
      Approved: store.db.excuses.filter((e) => e.status === 'Approved').length,
      Rejected: store.db.excuses.filter((e) => e.status === 'Rejected').length,
    };

    let list = [...store.db.excuses];
    if (status === 'Pending' || status === 'Approved' || status === 'Rejected') {
      list = list.filter((e) => e.status === status);
    }
    list.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));

    const studentsById = new Map(store.db.students.map((s) => [s.student_id, s]));
    const absencesById = new Map(store.db.absence_records.map((a) => [a.absence_id, a]));

    const items = list.map((e) => {
      const st = studentsById.get(e.student_id)!;
      const ab = absencesById.get(e.absence_id)!;
      return {
        ...e,
        student_name: `${st.first_name} ${st.last_name}`,
        student_number: st.student_number,
        absence_date: ab?.absence_date ?? '',
      };
    });

    res.json({ excuses: items, status, counts });
  });

  api.get('/excuses/open-absences', requireModule('excuses'), (_req, res) => {
    const studentsById = new Map(store.db.students.map((s) => [s.student_id, s]));
    const classesById = new Map(store.db.classes.map((c) => [c.class_id, c]));
    const open = store.db.absence_records
      .filter((ab) => ab.status === 'Unexcused')
      .filter(
        (ab) =>
          !store.db.excuses.some(
            (e) =>
              e.absence_id === ab.absence_id &&
              (e.status === 'Pending' || e.status === 'Approved'),
          ),
      )
      .sort((a, b) => b.absence_date.localeCompare(a.absence_date))
      .slice(0, 300)
      .map((ab) => {
        const st = studentsById.get(ab.student_id)!;
        const cls = classesById.get(ab.class_id)!;
        return {
          ...ab,
          student_name: `${st.last_name}, ${st.first_name}`,
          student_number: st.student_number,
          class_label: `${cls.grade_level} - ${cls.section}`,
        };
      });
    res.json({ open_absences: open });
  });

  api.post('/excuses', requireModule('excuses'), (req: AuthedRequest, res) => {
    try {
      const absenceId = Number(req.body?.absence_id);
      if (!absenceId) {
        throw new ValidationError('Please select the absence this excuse is for.');
      }
      const excuse = store.submitExcuse(
        absenceId,
        String(req.body?.reason ?? ''),
        req.body?.remarks,
        req.body?.attachment || null,
        req.body?.attachment_data || null,
        req.currentUser!.user_id,
      );
      res.status(201).json({ excuse });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.get('/excuses/:id', requireModule('excuses'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const excuse = store.db.excuses.find((e) => e.excuse_id === id);
    if (!excuse) return res.status(404).json({ error: 'Excuse request not found.' });
    const student = store.db.students.find((s) => s.student_id === excuse.student_id)!;
    const absence = store.db.absence_records.find((a) => a.absence_id === excuse.absence_id)!;
    const cls = store.db.classes.find((c) => c.class_id === absence.class_id)!;
    const attendance = store.db.attendance.find(
      (a) => a.attendance_id === absence.attendance_id,
    )!;
    const usersById = new Map(store.db.users.map((u) => [u.user_id, u]));

    res.json({
      excuse,
      student,
      absence,
      class_label: `${cls.grade_level} - ${cls.section}`,
      attendance,
      submitter_name: excuse.submitted_by
        ? usersById.get(excuse.submitted_by)?.full_name ?? null
        : null,
      reviewer_name: excuse.reviewed_by
        ? usersById.get(excuse.reviewed_by)?.full_name ?? null
        : null,
      can_review: canAccess('excuse_review', req.currentUser!.role),
    });
  });

  api.post('/excuses/:id/review', requireModule('excuse_review'), (req: AuthedRequest, res) => {
    try {
      const excuse = store.reviewExcuse(
        Number(req.params.id),
        req.body?.decision,
        req.body?.review_remarks,
        req.currentUser!.user_id,
      );
      res.json({ excuse });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Reports
  api.get('/reports/daily', requireModule('reports'), (req, res) => {
    try {
      const classes = [...store.db.classes]
        .sort((a, b) => a.grade_level.localeCompare(b.grade_level) || a.section.localeCompare(b.section))
        .map((c) => {
          const sy = store.db.school_years.find((y) => y.school_year_id === c.school_year_id);
          return { ...c, label: `${c.grade_level} - ${c.section}`, school_year_name: sy?.name ?? '' };
        });

      const classId = req.query.class_id ? Number(req.query.class_id) : null;
      const reportDate = req.query.date
        ? parseDate(String(req.query.date), 'Date')
        : todayIso();

      if (!classId) {
        return res.json({ classes, report_date: reportDate, cls: null, rows: [], totals: null });
      }

      const cls = store.db.classes.find((c) => c.class_id === classId);
      if (!cls) return res.status(404).json({ error: 'Class not found.' });
      const adviser = cls.adviser_id
        ? store.db.users.find((u) => u.user_id === cls.adviser_id)
        : null;

      const recordsByStudent = new Map(
        store.db.attendance
          .filter((a) => a.class_id === classId && a.attendance_date === reportDate)
          .map((a) => [a.student_id, a]),
      );

      const roster = store.classRoster(classId);
      const rows = roster.map((s) => ({
        student: s,
        record: recordsByStudent.get(s.student_id) ?? null,
      }));
      const totals = summarizeCounts(
        countRecords([...recordsByStudent.values()]),
        store.lateCountsAsPresent(),
      );

      if (req.query.format === 'csv') {
        const csv = toCsv(
          ['Student No.', 'Student', 'Status', 'Remarks'],
          rows.map((r) => [
            r.student.student_number,
            `${r.student.last_name}, ${r.student.first_name}`,
            r.record ? STATUS_LABELS[r.record.status] : 'Not recorded',
            r.record?.remarks ?? '',
          ]),
        );
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="daily_attendance_${cls.class_code}_${reportDate}.csv"`,
        );
        return res.send(csv);
      }

      res.json({
        classes,
        report_date: reportDate,
        cls: {
          ...cls,
          label: `${cls.grade_level} - ${cls.section}`,
          adviser_name: adviser?.full_name ?? '—',
        },
        rows,
        totals,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.get('/reports/student', requireModule('reports'), (req, res) => {
    try {
      const q = String(req.query.q ?? '').trim().toLowerCase();
      const sid = req.query.student_id ? Number(req.query.student_id) : null;
      const filters = buildReportFilters(req.query as Record<string, unknown>);

      let stu = sid ? store.db.students.find((s) => s.student_id === sid) ?? null : null;
      let matches: typeof store.db.students = [];
      if (!stu && q) {
        matches = store.db.students
          .filter(
            (s) =>
              s.student_number.toLowerCase().includes(q) ||
              s.first_name.toLowerCase().includes(q) ||
              s.last_name.toLowerCase().includes(q),
          )
          .sort((a, b) => a.last_name.localeCompare(b.last_name))
          .slice(0, 20);
        if (matches.length === 1) stu = matches[0];
      }

      if (!stu) {
        return res.json({ stu: null, matches, summary: null, records: [] });
      }

      const classesById = new Map(store.db.classes.map((c) => [c.class_id, c]));
      const absenceByAtt = new Map(
        store.db.absence_records.map((ab) => [ab.attendance_id, ab]),
      );
      const records = filterAttendanceRecords(store.db.attendance, classesById, {
        ...filters,
        student_id: stu.student_id,
      }).sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));

      const summary = summarizeCounts(countRecords(records), store.lateCountsAsPresent());
      const curClass = store.currentClassForStudent(stu.student_id);

      if (req.query.format === 'csv') {
        const csv = toCsv(
          ['Date', 'Class', 'Status', 'Absence', 'Remarks'],
          records.map((a) => {
            const cls = classesById.get(a.class_id);
            const abs = absenceByAtt.get(a.attendance_id);
            return [
              a.attendance_date,
              cls ? `${cls.grade_level} - ${cls.section}` : '',
              STATUS_LABELS[a.status],
              abs?.status ?? '',
              a.remarks ?? '',
            ];
          }),
        );
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="student_attendance_${stu.student_number}.csv"`,
        );
        return res.send(csv);
      }

      res.json({
        stu: {
          ...stu,
          current_class_label: curClass
            ? `${curClass.grade_level} - ${curClass.section}`
            : 'Not enrolled',
        },
        matches,
        summary,
        records: records.map((a) => {
          const cls = classesById.get(a.class_id);
          const abs = absenceByAtt.get(a.attendance_id);
          return {
            ...a,
            class_label: cls ? `${cls.grade_level} - ${cls.section}` : '',
            absence_status: abs?.status ?? '',
          };
        }),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.get('/reports/class', requireModule('reports'), (req, res) => {
    try {
      const classes = [...store.db.classes]
        .sort((a, b) => a.grade_level.localeCompare(b.grade_level) || a.section.localeCompare(b.section))
        .map((c) => {
          const sy = store.db.school_years.find((y) => y.school_year_id === c.school_year_id);
          return { ...c, label: `${c.grade_level} - ${c.section}`, school_year_name: sy?.name ?? '' };
        });

      const classId = req.query.class_id ? Number(req.query.class_id) : null;
      const filters = buildReportFilters(req.query as Record<string, unknown>);
      const threshold = store.getSettingInt('alert_unexcused_threshold', 5);

      if (!classId) {
        return res.json({ classes, cls: null, rows: [], totals: null, threshold });
      }

      const cls = store.db.classes.find((c) => c.class_id === classId);
      if (!cls) return res.status(404).json({ error: 'Class not found.' });
      const sy = store.db.school_years.find((y) => y.school_year_id === cls.school_year_id);
      const adviser = cls.adviser_id
        ? store.db.users.find((u) => u.user_id === cls.adviser_id)
        : null;

      const classesById = new Map(store.db.classes.map((c) => [c.class_id, c]));
      const filtered = filterAttendanceRecords(store.db.attendance, classesById, {
        ...filters,
        class_id: classId,
        status: undefined,
      });

      const latePresent = store.lateCountsAsPresent();
      const rows = store
        .classRoster(classId)
        .map((st) => {
          const recs = filtered.filter((r) => r.student_id === st.student_id);
          return {
            student: st,
            ...summarizeCounts(countRecords(recs), latePresent),
          };
        })
        .sort(
          (a, b) =>
            b.absent - a.absent || a.student.last_name.localeCompare(b.student.last_name),
        );

      const totals = summarizeCounts(countRecords(filtered), latePresent);

      if (req.query.format === 'csv') {
        const csv = toCsv(
          [
            'Student No.',
            'Student',
            'Present',
            'Late',
            'Absent',
            'Excused',
            'Unexcused',
            'School Days',
            'Rate (%)',
          ],
          rows.map((r) => [
            r.student.student_number,
            `${r.student.first_name} ${r.student.last_name}`,
            r.present,
            r.late,
            r.absent,
            r.excused,
            r.unexcused,
            r.total_days,
            r.rate,
          ]),
        );
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="class_attendance_${cls.class_code}.csv"`,
        );
        return res.send(csv);
      }

      res.json({
        classes,
        cls: {
          ...cls,
          label: `${cls.grade_level} - ${cls.section}`,
          school_year_name: sy?.name ?? '',
          adviser_name: adviser?.full_name ?? '—',
        },
        rows,
        totals,
        threshold,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.get('/reports/custom', requireModule('reports'), (req, res) => {
    try {
      const filters = buildReportFilters(req.query as Record<string, unknown>);
      const ran = req.query.run === '1';
      const classesById = new Map(store.db.classes.map((c) => [c.class_id, c]));
      const studentsById = new Map(store.db.students.map((s) => [s.student_id, s]));
      const absenceByAtt = new Map(
        store.db.absence_records.map((ab) => [ab.attendance_id, ab]),
      );

      let records: ReturnType<typeof filterAttendanceRecords> = [];
      let totals = null;
      if (ran) {
        records = filterAttendanceRecords(store.db.attendance, classesById, filters).sort(
          (a, b) => {
            const d = b.attendance_date.localeCompare(a.attendance_date);
            if (d !== 0) return d;
            return (studentsById.get(a.student_id)?.last_name ?? '').localeCompare(
              studentsById.get(b.student_id)?.last_name ?? '',
            );
          },
        );
        totals = summarizeCounts(countRecords(records), store.lateCountsAsPresent());

        if (req.query.format === 'csv') {
          const csv = toCsv(
            ['Date', 'Student No.', 'Student', 'Grade', 'Section', 'Status', 'Absence', 'Remarks'],
            records.map((a) => {
              const st = studentsById.get(a.student_id)!;
              const cls = classesById.get(a.class_id)!;
              const abs = absenceByAtt.get(a.attendance_id);
              return [
                a.attendance_date,
                st.student_number,
                `${st.first_name} ${st.last_name}`,
                cls.grade_level,
                cls.section,
                STATUS_LABELS[a.status],
                abs?.status ?? '',
                a.remarks ?? '',
              ];
            }),
          );
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            'attachment; filename="custom_attendance_report.csv"',
          );
          return res.send(csv);
        }
      }

      const grades = [...new Set(store.db.classes.map((c) => c.grade_level))].sort();
      const sections = [...new Set(store.db.classes.map((c) => c.section))].sort();

      res.json({
        ran,
        totals,
        total_count: records.length,
        records: records.slice(0, 500).map((a) => {
          const st = studentsById.get(a.student_id)!;
          const cls = classesById.get(a.class_id)!;
          const abs = absenceByAtt.get(a.attendance_id);
          return {
            ...a,
            student_number: st.student_number,
            student_name: `${st.last_name}, ${st.first_name}`,
            grade_level: cls.grade_level,
            section: cls.section,
            absence_status: abs?.status ?? '',
          };
        }),
        school_years: [...store.db.school_years].sort((a, b) =>
          b.start_date.localeCompare(a.start_date),
        ),
        grades,
        sections,
        students: [...store.db.students].sort((a, b) =>
          a.last_name.localeCompare(b.last_name),
        ),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Users (Admin)
  api.get('/users', requireModule('users'), (_req, res) => {
    const users = [...store.db.users]
      .sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name))
      .map((u) => store.publicUser(u));
    res.json({ users });
  });

  api.post('/users', requireModule('users'), (req, res) => {
    try {
      const username = validateUsername(req.body?.username);
      if (store.db.users.some((u) => u.username === username)) {
        throw new ValidationError(`Username '${username}' is already taken.`);
      }
      const full_name = required(req.body?.full_name, 'Full name');
      const role = validateChoice(req.body?.role, ROLES, 'Role') as UserRole;
      const pw = validatePassword(req.body?.password);
      if (pw !== req.body?.confirm_password) {
        throw new ValidationError('Password and confirmation do not match.');
      }
      const created: StoredUser = {
        user_id: store.db.nextId.user++,
        username,
        password_hash: hashPassword(pw),
        full_name,
        role,
        is_active_user: true,
        last_login: null,
        created_at: new Date().toISOString(),
      };
      store.db.users.push(created);
      res.status(201).json({ user: store.publicUser(created) });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.put('/users/:id', requireModule('users'), (req: AuthedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const user = store.db.users.find((u) => u.user_id === id);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const full_name = required(req.body?.full_name, 'Full name');
      const role = validateChoice(req.body?.role, ROLES, 'Role') as UserRole;
      const active = Boolean(req.body?.is_active);
      const adminCount = store.db.users.filter(
        (u) => u.role === 'Administrator' && u.is_active_user,
      ).length;
      const removingAdmin =
        user.role === 'Administrator' &&
        user.is_active_user &&
        (role !== 'Administrator' || !active);
      if (removingAdmin && adminCount <= 1) {
        throw new ValidationError(
          'The system must keep at least one active Administrator.',
        );
      }
      if (user.user_id === req.currentUser!.user_id && !active) {
        throw new ValidationError('You cannot deactivate your own account.');
      }
      const newPw = String(req.body?.password ?? '');
      if (newPw) {
        validatePassword(newPw);
        if (newPw !== req.body?.confirm_password) {
          throw new ValidationError('Password and confirmation do not match.');
        }
        user.password_hash = hashPassword(newPw);
      }
      user.full_name = full_name;
      user.role = role;
      user.is_active_user = active;
      res.json({ user: store.publicUser(user) });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Settings (Admin)
  api.get('/settings', requireModule('settings'), (_req, res) => {
    const settings: Record<string, string> = {};
    for (const s of store.db.attendance_settings) {
      settings[s.key] = s.value;
    }
    const years = [...store.db.school_years].sort((a, b) =>
      b.start_date.localeCompare(a.start_date),
    );
    res.json({ settings, years });
  });

  api.post('/settings', requireModule('settings'), (req, res) => {
    const threshold = Number.parseInt(String(req.body?.alert_unexcused_threshold ?? ''), 10);
    const rate = Number.parseInt(String(req.body?.alert_rate_threshold ?? ''), 10);
    if (
      Number.isNaN(threshold) ||
      Number.isNaN(rate) ||
      threshold < 1 ||
      threshold > 100 ||
      rate < 1 ||
      rate > 100
    ) {
      return res
        .status(400)
        .json({ error: 'Thresholds must be whole numbers from 1 to 100.' });
    }
    const updates: Record<string, string> = {
      alert_unexcused_threshold: String(threshold),
      alert_rate_threshold: String(rate),
      late_counts_as_present: req.body?.late_counts_as_present ? '1' : '0',
    };
    for (const s of store.db.attendance_settings) {
      if (s.key in updates) s.value = updates[s.key];
    }
    res.json({ message: 'Settings saved.' });
  });

  api.post('/settings/school-years', requireModule('settings'), (req, res) => {
    try {
      const start = parseDate(req.body?.start_date, 'Start date', { allowFuture: true });
      const end = parseDate(req.body?.end_date, 'End date', { allowFuture: true });
      if (end <= start) {
        throw new ValidationError('End date must be after the start date.');
      }
      const name = `${start.slice(0, 4)}-${end.slice(0, 4)}`;
      if (store.db.school_years.some((y) => y.name === name)) {
        throw new ValidationError(`School year ${name} already exists.`);
      }
      const sy: SchoolYear = {
        school_year_id: store.db.nextId.school_year++,
        name,
        start_date: start,
        end_date: end,
        is_active: store.db.school_years.length === 0,
      };
      store.db.school_years.push(sy);
      res.status(201).json({ school_year: sy });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.post('/settings/school-years/:id/activate', requireModule('settings'), (req, res) => {
    const id = Number(req.params.id);
    const target = store.db.school_years.find((y) => y.school_year_id === id);
    if (!target) return res.status(404).json({ error: 'School year not found.' });
    for (const sy of store.db.school_years) {
      sy.is_active = sy.school_year_id === id;
    }
    res.json({ school_year: target });
  });

  // Backup & Recovery (Admin)
  api.get('/backups', requireModule('backup'), (_req, res) => {
    res.json({
      backups: store.backups.map((b) => ({
        name: b.name,
        created_at: b.created_at,
        size_kb: b.size_kb,
      })),
    });
  });

  api.post('/backups/create', requireModule('backup'), (_req, res) => {
    const entry = store.createBackup();
    store.verifyBackupPayload(entry.payload);
    res.status(201).json({
      backup: { name: entry.name, created_at: entry.created_at, size_kb: entry.size_kb },
      message: `Backup created and verified: ${entry.name}`,
    });
  });

  api.post('/backups/:name/verify', requireModule('backup'), (req, res) => {
    try {
      const entry = store.backups.find((b) => b.name === req.params.name);
      if (!entry) return res.status(404).json({ error: 'Backup file not found.' });
      const verified = store.verifyBackupPayload(entry.payload);
      const total = Object.values(verified.meta.tables).reduce((a, b) => a + b, 0);
      res.json({
        message: `Integrity check passed: ${entry.name} (${total} rows, checksum OK).`,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  api.get('/backups/:name/download', requireModule('backup'), (req, res) => {
    const entry = store.backups.find((b) => b.name === req.params.name);
    if (!entry) return res.status(404).json({ error: 'Backup file not found.' });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${entry.name}"`);
    res.send(JSON.stringify(entry.payload, null, 2));
  });

  api.post('/backups/restore', requireModule('backup'), (req, res) => {
    try {
      if (req.body?.confirm !== 'RESTORE') {
        throw new ValidationError(
          'Type RESTORE in the confirmation box to restore a backup.',
        );
      }
      let payload: BackupPayload | undefined;
      if (req.body?.payload) {
        payload = req.body.payload as BackupPayload;
      } else if (req.body?.name) {
        payload = store.backups.find((b) => b.name === req.body.name)?.payload;
      }
      if (!payload) {
        throw new ValidationError('Select or upload a backup file.');
      }
      const { meta, safetyName } = store.restoreFromPayload(payload);
      res.json({
        message: `Database restored from backup taken ${meta.created_at}. A safety copy of the previous data was saved as ${safetyName}.`,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.use('/api', api);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`School Attendance System listening on http://0.0.0.0:${port}`);
  });
}

startServer();
