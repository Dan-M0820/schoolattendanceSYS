import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, FlashMessage, RouteState } from '../api';
import {
  canAccess,
  ClassSection,
  Enrollment,
  GRADE_LEVELS,
  SchoolYear,
  Student,
  User,
  UserRole,
} from '../../shared/types';
import { formatShortDate } from '../../shared/validation';
import {
  AlertBanner,
  btnDangerCls,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSmSecondaryCls,
  inputCls,
  LoadingState,
  PageHeader,
  StatusText,
} from '../components/ui';

interface EnrichedClass extends ClassSection {
  label: string;
  adviser_name: string | null;
  school_year_name: string;
  roster_count: number;
}

export function ClassesPage({
  route,
  role,
  userId,
  onNavigate,
}: {
  route: Extract<RouteState, { page: 'classes' }>;
  role: UserRole;
  userId: number;
  onNavigate: (r: RouteState) => void;
}) {
  const sub = route.sub || 'list';
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  if (sub === 'new' || sub === 'edit') {
    return (
      <ClassFormView
        classId={sub === 'edit' ? route.id : undefined}
        onNavigate={onNavigate}
        onFlash={setFlash}
      />
    );
  }
  if (sub === 'view' && route.id) {
    return (
      <ClassRosterView
        classId={route.id}
        role={role}
        userId={userId}
        flash={flash}
        setFlash={setFlash}
        onNavigate={onNavigate}
      />
    );
  }
  if (sub === 'enroll' && route.id) {
    return (
      <EnrollStudentsView
        classId={route.id}
        onNavigate={onNavigate}
        onFlash={setFlash}
      />
    );
  }

  return (
    <ClassListView
      role={role}
      flash={flash}
      setFlash={setFlash}
      onNavigate={onNavigate}
    />
  );
}

function ClassListView({
  role,
  flash,
  setFlash,
  onNavigate,
}: {
  role: UserRole;
  flash: FlashMessage | null;
  setFlash: (f: FlashMessage | null) => void;
  onNavigate: (r: RouteState) => void;
}) {
  const [syId, setSyId] = useState<string>('');
  const [data, setData] = useState<{
    classes: EnrichedClass[];
    sy_id: number;
    school_years: SchoolYear[];
  } | null>(null);

  const load = useCallback(
    (selectedSy?: string) => {
      const qs = selectedSy !== undefined && selectedSy !== '' ? `?school_year_id=${selectedSy}` : '';
      apiFetch<typeof data>(`/api/classes${qs}`)
        .then((res) => {
          setData(res);
          if (selectedSy === undefined && res) {
            setSyId(String(res.sy_id));
          }
        })
        .catch((err) => setFlash({ type: 'danger', text: (err as Error).message }));
    },
    [setFlash],
  );

  useEffect(() => {
    load();
  }, [load]);

  const canManageClasses = role === 'Administrator' || role === 'Registrar';

  return (
    <div>
      <PageHeader
        title="Classes"
        subtitle="Classes, sections, grade levels, and advisers"
        actions={
          canManageClasses ? (
            <button
              type="button"
              onClick={() => onNavigate({ page: 'classes', sub: 'new' })}
              className={btnPrimaryCls}
            >
              Add Class
            </button>
          ) : undefined
        }
      />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-white p-4">
        <div className="w-56">
          <label htmlFor="cls-sy" className="mb-1 block text-xs font-medium text-gray-700">
            School Year
          </label>
          <select
            id="cls-sy"
            value={syId}
            onChange={(e) => {
              setSyId(e.target.value);
              load(e.target.value);
            }}
            className={inputCls}
          >
            <option value="0">All school years</option>
            {data?.school_years.map((sy) => (
              <option key={sy.school_year_id} value={sy.school_year_id}>
                {sy.name}
                {sy.is_active ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!data ? (
        <LoadingState label="Loading classes..." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Class</th>
                <th className="px-4 py-2.5">Grade Level</th>
                <th className="px-4 py-2.5">Section</th>
                <th className="px-4 py-2.5">Adviser</th>
                <th className="px-4 py-2.5">School Year</th>
                <th className="px-4 py-2.5 text-right">Students</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.classes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    No classes yet.
                  </td>
                </tr>
              ) : (
                data.classes.map((c) => (
                  <tr key={c.class_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                      {c.class_code}
                    </td>
                    <td className="px-4 py-2.5 font-medium">
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate({ page: 'classes', sub: 'view', id: c.class_id })
                        }
                        className="text-blue-700 hover:underline cursor-pointer text-left"
                      >
                        {c.class_name}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{c.grade_level}</td>
                    <td className="px-4 py-2.5 text-gray-600">{c.section}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {c.adviser_name || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{c.school_year_name}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">
                      {c.roster_count}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate({ page: 'classes', sub: 'view', id: c.class_id })
                          }
                          className={btnSmSecondaryCls}
                        >
                          Roster
                        </button>
                        {canManageClasses && (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({ page: 'classes', sub: 'edit', id: c.class_id })
                            }
                            className={btnSmSecondaryCls}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClassFormView({
  classId,
  onNavigate,
  onFlash,
}: {
  classId?: number;
  onNavigate: (r: RouteState) => void;
  onFlash: (f: FlashMessage | null) => void;
}) {
  const isEdit = Boolean(classId);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [advisers, setAdvisers] = useState<User[]>([]);
  const [form, setForm] = useState({
    class_code: '',
    class_name: '',
    grade_level: 'Grade 8',
    section: '',
    adviser_id: '',
    school_year_id: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<{ school_years: SchoolYear[]; advisers: User[] }>('/api/classes?school_year_id=0'),
      classId
        ? apiFetch<{ class_section: ClassSection }>(`/api/classes/${classId}`)
        : Promise.resolve(null),
    ])
      .then(([meta, existing]) => {
        setSchoolYears(meta.school_years);
        setAdvisers(meta.advisers);
        if (existing) {
          const c = existing.class_section;
          setForm({
            class_code: c.class_code,
            class_name: c.class_name,
            grade_level: c.grade_level,
            section: c.section,
            adviser_id: c.adviser_id ? String(c.adviser_id) : '',
            school_year_id: String(c.school_year_id),
          });
        } else {
          const active = meta.school_years.find((y) => y.is_active) || meta.school_years[0];
          setForm((prev) => ({
            ...prev,
            school_year_id: active ? String(active.school_year_id) : '',
          }));
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [classId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ class_section: ClassSection }>(
        isEdit ? `/api/classes/${classId}` : '/api/classes',
        {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(form),
        },
      );
      onFlash({
        type: 'success',
        text: isEdit
          ? 'Class updated.'
          : `Class ${res.class_section.grade_level} - ${res.class_section.section} created.`,
      });
      onNavigate({
        page: 'classes',
        sub: 'view',
        id: res.class_section.class_id,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) return <LoadingState label="Loading class form..." />;

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit Class' : 'Add Class'} />
      <form
        onSubmit={handleSubmit}
        className="max-w-2xl rounded-md border border-gray-200 bg-white p-6"
        noValidate
      >
        {error && (
          <AlertBanner
            flash={{ type: 'danger', text: error }}
            onDismiss={() => setError(null)}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cf-code" className="mb-1 block text-sm font-medium text-gray-700">
              Class Code <span className="text-red-600">*</span>
            </label>
            <input
              id="cf-code"
              type="text"
              value={form.class_code}
              onChange={(e) => setForm({ ...form, class_code: e.target.value })}
              placeholder="G8-RIZAL-2026"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="cf-grade" className="mb-1 block text-sm font-medium text-gray-700">
              Grade Level <span className="text-red-600">*</span>
            </label>
            <select
              id="cf-grade"
              value={form.grade_level}
              onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
              className={inputCls}
            >
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cf-section" className="mb-1 block text-sm font-medium text-gray-700">
              Section <span className="text-red-600">*</span>
            </label>
            <input
              id="cf-section"
              type="text"
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
              placeholder="Rizal"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="cf-name" className="mb-1 block text-sm font-medium text-gray-700">
              Class Name
            </label>
            <input
              id="cf-name"
              type="text"
              value={form.class_name}
              onChange={(e) => setForm({ ...form, class_name: e.target.value })}
              placeholder="Optional (defaults to Grade - Section)"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="cf-adv" className="mb-1 block text-sm font-medium text-gray-700">
              Adviser
            </label>
            <select
              id="cf-adv"
              value={form.adviser_id}
              onChange={(e) => setForm({ ...form, adviser_id: e.target.value })}
              className={inputCls}
            >
              <option value="">-- Unassigned --</option>
              {advisers.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.full_name} ({a.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cf-sy" className="mb-1 block text-sm font-medium text-gray-700">
              School Year <span className="text-red-600">*</span>
            </label>
            <select
              id="cf-sy"
              value={form.school_year_id}
              onChange={(e) => setForm({ ...form, school_year_id: e.target.value })}
              className={inputCls}
            >
              <option value="">-- Select --</option>
              {schoolYears.map((sy) => (
                <option key={sy.school_year_id} value={sy.school_year_id}>
                  {sy.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-4">
          <button type="submit" className={btnPrimaryCls}>
            Save
          </button>
          <button
            type="button"
            onClick={() =>
              isEdit && classId
                ? onNavigate({ page: 'classes', sub: 'view', id: classId })
                : onNavigate({ page: 'classes', sub: 'list' })
            }
            className={btnSecondaryCls}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ClassRosterView({
  classId,
  role,
  userId,
  flash,
  setFlash,
  onNavigate,
}: {
  classId: number;
  role: UserRole;
  userId: number;
  flash: FlashMessage | null;
  setFlash: (f: FlashMessage | null) => void;
  onNavigate: (r: RouteState) => void;
}) {
  const [data, setData] = useState<{
    class_section: ClassSection & {
      label: string;
      school_year_name: string;
      adviser_name: string | null;
    };
    enrollments: Array<Enrollment & { student: Student }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    apiFetch<typeof data>(`/api/classes/${classId}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div>
        <AlertBanner flash={{ type: 'danger', text: error }} />
        <button
          type="button"
          onClick={() => onNavigate({ page: 'classes', sub: 'list' })}
          className={btnSecondaryCls}
        >
          Back to Classes
        </button>
      </div>
    );
  }
  if (!data) return <LoadingState label="Loading class roster..." />;

  const cls = data.class_section;
  const canEdit =
    role === 'Administrator' ||
    role === 'Registrar' ||
    role === 'Principal' ||
    cls.adviser_id === userId;
  const canDelete = role === 'Administrator' || role === 'Registrar';

  const handleRemove = async (studentId: number, status: 'Dropped' | 'Transferred') => {
    try {
      await apiFetch(`/api/classes/${classId}/enrollments/${studentId}/remove`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setFlash({ type: 'info', text: `Student marked as ${status}.` });
      load();
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  const handleDeleteClass = async () => {
    try {
      await apiFetch(`/api/classes/${classId}`, { method: 'DELETE' });
      setFlash({ type: 'success', text: 'Class deleted.' });
      onNavigate({ page: 'classes', sub: 'list' });
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
      setConfirmDelete(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Class: ${cls.label}`}
        subtitle={`${cls.class_code} · School Year ${cls.school_year_name} · Adviser: ${cls.adviser_name || 'None'}`}
        actions={
          <>
            {canAccess('enrollments', role) && (
              <button
                type="button"
                onClick={() =>
                  onNavigate({ page: 'classes', sub: 'enroll', id: classId })
                }
                className={btnPrimaryCls}
              >
                Enroll Students
              </button>
            )}
            {canAccess('attendance', role) && (
              <button
                type="button"
                onClick={() =>
                  onNavigate({ page: 'attendance', sub: 'index', classId })
                }
                className={btnSecondaryCls}
              >
                Record Attendance
              </button>
            )}
            {canAccess('reports', role) && (
              <button
                type="button"
                onClick={() =>
                  onNavigate({ page: 'reports', sub: 'class', classId })
                }
                className={btnSecondaryCls}
              >
                Class Report
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() =>
                  onNavigate({ page: 'classes', sub: 'edit', id: classId })
                }
                className={btnSecondaryCls}
              >
                Edit Class
              </button>
            )}
          </>
        }
      />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
              <th className="px-4 py-2.5">#</th>
              <th className="px-4 py-2.5">Student No.</th>
              <th className="px-4 py-2.5">Student Name</th>
              <th className="px-4 py-2.5">Gender</th>
              <th className="px-4 py-2.5">Enrolled</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.enrollments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  No students enrolled yet.
                </td>
              </tr>
            ) : (
              data.enrollments.map((e, i) => (
                <tr key={e.enrollment_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                    {e.student.student_number}
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          page: 'students',
                          sub: 'profile',
                          id: e.student_id,
                        })
                      }
                      className="text-blue-700 hover:underline cursor-pointer text-left"
                    >
                      {e.student.last_name}, {e.student.first_name}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{e.student.gender}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-600">
                    {formatShortDate(e.date_enrolled)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusText status={e.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {e.status === 'Enrolled' && canEdit && (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRemove(e.student_id, 'Dropped')}
                          className={btnSmSecondaryCls}
                        >
                          Drop
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(e.student_id, 'Transferred')}
                          className={btnSmSecondaryCls}
                        >
                          Transfer
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canDelete && (
        <div className="mt-4 flex items-center gap-2">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs font-medium text-red-700 hover:underline cursor-pointer"
            >
              Delete Class
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">Delete this class permanently?</span>
              <button type="button" onClick={handleDeleteClass} className={btnDangerCls}>
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className={btnSecondaryCls}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnrollStudentsView({
  classId,
  onNavigate,
  onFlash,
}: {
  classId: number;
  onNavigate: (r: RouteState) => void;
  onFlash: (f: FlashMessage | null) => void;
}) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [data, setData] = useState<{
    class_section: ClassSection & { label: string; school_year_name: string };
    candidates: Array<Student & { current_class_label: string | null }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (search = q) => {
      const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
      apiFetch<typeof data>(`/api/classes/${classId}/enroll-candidates${qs}`)
        .then(setData)
        .catch((err) => setError((err as Error).message));
    },
    [classId, q],
  );

  useEffect(() => {
    load('');
  }, [load]);

  const toggleAll = (checked: boolean) => {
    if (!data) return;
    setSelected(checked ? data.candidates.map((c) => c.student_id) : []);
  };

  const toggleOne = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ added: number; skipped: string[] }>(
        `/api/classes/${classId}/enroll`,
        {
          method: 'POST',
          body: JSON.stringify({ student_ids: selected }),
        },
      );
      const msgs: string[] = [];
      if (res.added > 0) {
        msgs.push(`${res.added} student(s) enrolled.`);
      }
      if (res.skipped.length > 0) {
        msgs.push(`Not enrolled: ${res.skipped.join('; ')}`);
      }
      onFlash({
        type: res.added > 0 ? 'success' : 'warning',
        text: msgs.join(' '),
      });
      onNavigate({ page: 'classes', sub: 'view', id: classId });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!data) return <LoadingState label="Loading eligible students..." />;

  return (
    <div>
      <PageHeader
        title="Enroll Students"
        subtitle={`${data.class_section.label} · ${data.class_section.school_year_name}`}
      />

      {error && (
        <AlertBanner
          flash={{ type: 'danger', text: error }}
          onDismiss={() => setError(null)}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
        className="mb-4 flex items-end gap-3 rounded-md border border-gray-200 bg-white p-4"
      >
        <div className="max-w-xs flex-1">
          <label htmlFor="enr-q" className="mb-1 block text-xs font-medium text-gray-700">
            Find Student
          </label>
          <input
            id="enr-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Student no. or name"
            className={inputCls}
          />
        </div>
        <button type="submit" className={btnSecondaryCls}>
          Search
        </button>
      </form>

      <form onSubmit={handleEnroll}>
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all students"
                    checked={
                      data.candidates.length > 0 &&
                      selected.length === data.candidates.length
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className="px-4 py-2.5">Student No.</th>
                <th className="px-4 py-2.5">Student Name</th>
                <th className="px-4 py-2.5">Current Class</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.candidates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                    No active students available to enroll.
                  </td>
                </tr>
              ) : (
                data.candidates.map((s) => (
                  <tr key={s.student_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.first_name} ${s.last_name}`}
                        checked={selected.includes(s.student_id)}
                        onChange={() => toggleOne(s.student_id)}
                      />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                      {s.student_number}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {s.first_name} {s.last_name}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {s.current_class_label || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button type="submit" className={btnPrimaryCls}>
            Enroll Selected ({selected.length})
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'classes', sub: 'view', id: classId })}
            className={btnSecondaryCls}
          >
            Back to Roster
          </button>
        </div>
      </form>
    </div>
  );
}
