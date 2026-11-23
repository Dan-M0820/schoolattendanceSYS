import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, FlashMessage, RouteState } from '../api';
import {
  AbsenceRecord,
  AttendanceRecord,
  AttendanceSummary,
  canAccess,
  ClassSection,
  Enrollment,
  GENDERS,
  Student,
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
  Pagination,
  StatusText,
  SummaryStrip,
} from '../components/ui';

interface StudentListItem extends Student {
  current_class: { class_id: number; label: string } | null;
}

interface ClassOption extends ClassSection {
  label: string;
  school_year_name: string;
}

interface StudentProfileData {
  student: Student;
  current_class: { class_id: number; label: string } | null;
  enrollments: Array<Enrollment & { class_label: string; school_year_name: string }>;
  summary: AttendanceSummary;
  history: Array<AttendanceRecord & { class_label: string }>;
  absences: Array<AbsenceRecord & { latest_excuse_status: string | null }>;
}

const SAMPLE_CSV = `student_number,first_name,middle_name,last_name,gender,birth_date,contact_number
2026-0101,Elena,M.,Villareal,Female,2012-04-12,09171234567
2026-0102,Marco,L.,Tolentino,Male,2012-08-23,09189876543`;

export function StudentsPage({
  route,
  role,
  onNavigate,
}: {
  route: Extract<RouteState, { page: 'students' }>;
  role: UserRole;
  onNavigate: (r: RouteState) => void;
}) {
  const sub = route.sub || 'list';
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  if (sub === 'new' || sub === 'edit') {
    return (
      <StudentFormView
        studentId={sub === 'edit' ? route.id : undefined}
        onNavigate={onNavigate}
        onFlash={setFlash}
      />
    );
  }
  if (sub === 'profile' && route.id) {
    return (
      <StudentProfileView
        studentId={route.id}
        role={role}
        flash={flash}
        setFlash={setFlash}
        onNavigate={onNavigate}
      />
    );
  }
  if (sub === 'import') {
    return (
      <StudentImportView
        onNavigate={onNavigate}
        onFlash={setFlash}
      />
    );
  }

  return (
    <StudentListView
      flash={flash}
      setFlash={setFlash}
      onNavigate={onNavigate}
    />
  );
}

function StudentListView({
  flash,
  setFlash,
  onNavigate,
}: {
  flash: FlashMessage | null;
  setFlash: (f: FlashMessage | null) => void;
  onNavigate: (r: RouteState) => void;
}) {
  const [q, setQ] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    items: StudentListItem[];
    page: number;
    pages: number;
    total: number;
    classes: ClassOption[];
  } | null>(null);

  const load = useCallback(
    (targetPage = page) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (classId) params.set('class_id', classId);
      if (status) params.set('status', status);
      params.set('page', String(targetPage));
      apiFetch<typeof data>(`/api/students?${params.toString()}`)
        .then(setData)
        .catch((err) => setFlash({ type: 'danger', text: (err as Error).message }));
    },
    [q, classId, status, page, setFlash],
  );

  useEffect(() => {
    load(page);
  }, [load, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load(1);
  };

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Student directory, enrollment status, and attendance records"
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate({ page: 'students', sub: 'import' })}
              className={btnSecondaryCls}
            >
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ page: 'students', sub: 'new' })}
              className={btnPrimaryCls}
            >
              Add Student
            </button>
          </>
        }
      />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <form
        onSubmit={handleSearch}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-white p-4"
      >
        <div className="min-w-[180px] flex-1">
          <label htmlFor="st-q" className="mb-1 block text-xs font-medium text-gray-700">
            Search
          </label>
          <input
            id="st-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Student no. or name"
            className={inputCls}
          />
        </div>
        <div className="w-48">
          <label htmlFor="st-class" className="mb-1 block text-xs font-medium text-gray-700">
            Class
          </label>
          <select
            id="st-class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setPage(1);
            }}
            className={inputCls}
          >
            <option value="">All classes</option>
            {data?.classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.label} ({c.school_year_name})
              </option>
            ))}
          </select>
        </div>
        <div className="w-36">
          <label htmlFor="st-status" className="mb-1 block text-xs font-medium text-gray-700">
            Status
          </label>
          <select
            id="st-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={inputCls}
          >
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <button type="submit" className={btnSecondaryCls}>
          Filter
        </button>
      </form>

      {!data ? (
        <LoadingState label="Loading students..." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                  <th className="px-4 py-2.5">Student No.</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Gender</th>
                  <th className="px-4 py-2.5">Class</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      No students found.
                    </td>
                  </tr>
                ) : (
                  data.items.map((s) => (
                    <tr key={s.student_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700 tabular-nums">
                        {s.student_number}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate({
                              page: 'students',
                              sub: 'profile',
                              id: s.student_id,
                            })
                          }
                          className="text-blue-700 hover:underline cursor-pointer text-left"
                        >
                          {s.last_name}, {s.first_name} {s.middle_name || ''}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{s.gender}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {s.current_class ? s.current_class.label : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusText status={s.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({
                                page: 'students',
                                sub: 'profile',
                                id: s.student_id,
                              })
                            }
                            className={btnSmSecondaryCls}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({
                                page: 'students',
                                sub: 'edit',
                                id: s.student_id,
                              })
                            }
                            className={btnSmSecondaryCls}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function StudentFormView({
  studentId,
  onNavigate,
  onFlash,
}: {
  studentId?: number;
  onNavigate: (r: RouteState) => void;
  onFlash: (f: FlashMessage | null) => void;
}) {
  const isEdit = Boolean(studentId);
  const [form, setForm] = useState({
    student_number: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    gender: 'Male',
    birth_date: '',
    contact_number: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    apiFetch<StudentProfileData>(`/api/students/${studentId}`)
      .then((res) => {
        const s = res.student;
        setForm({
          student_number: s.student_number,
          first_name: s.first_name,
          middle_name: s.middle_name || '',
          last_name: s.last_name,
          gender: s.gender,
          birth_date: s.birth_date,
          contact_number: s.contact_number || '',
        });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [studentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ student: Student }>(
        isEdit ? `/api/students/${studentId}` : '/api/students',
        {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(form),
        },
      );
      onFlash({
        type: 'success',
        text: isEdit
          ? 'Student record updated.'
          : `Student ${res.student.first_name} ${res.student.last_name} (${res.student.student_number}) registered.`,
      });
      onNavigate({
        page: 'students',
        sub: 'profile',
        id: res.student.student_id,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading student details..." />;

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Student' : 'Add Student'}
        subtitle={
          isEdit
            ? 'Update student profile and contact details'
            : 'Register a new student record'
        }
      />

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
            <label htmlFor="sf-num" className="mb-1 block text-sm font-medium text-gray-700">
              Student No. <span className="text-red-600">*</span>
            </label>
            <input
              id="sf-num"
              type="text"
              value={form.student_number}
              onChange={(e) => setForm({ ...form, student_number: e.target.value })}
              placeholder="2026-0001"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500">Format: YYYY-NNNN</p>
          </div>

          <div>
            <label htmlFor="sf-gender" className="mb-1 block text-sm font-medium text-gray-700">
              Gender <span className="text-red-600">*</span>
            </label>
            <select
              id="sf-gender"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className={inputCls}
            >
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sf-first" className="mb-1 block text-sm font-medium text-gray-700">
              First Name <span className="text-red-600">*</span>
            </label>
            <input
              id="sf-first"
              type="text"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="sf-middle" className="mb-1 block text-sm font-medium text-gray-700">
              Middle Name
            </label>
            <input
              id="sf-middle"
              type="text"
              value={form.middle_name}
              onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="sf-last" className="mb-1 block text-sm font-medium text-gray-700">
              Last Name <span className="text-red-600">*</span>
            </label>
            <input
              id="sf-last"
              type="text"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="sf-bday" className="mb-1 block text-sm font-medium text-gray-700">
              Birth Date <span className="text-red-600">*</span>
            </label>
            <input
              id="sf-bday"
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="sf-contact" className="mb-1 block text-sm font-medium text-gray-700">
              Contact No.
            </label>
            <input
              id="sf-contact"
              type="text"
              value={form.contact_number}
              onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
              placeholder="09XXXXXXXXX"
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
          <button type="submit" disabled={saving} className={btnPrimaryCls}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {!isEdit && (
            <button
              type="button"
              onClick={() =>
                setForm({
                  student_number: '',
                  first_name: '',
                  middle_name: '',
                  last_name: '',
                  gender: 'Male',
                  birth_date: '',
                  contact_number: '',
                })
              }
              className={btnSecondaryCls}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              isEdit && studentId
                ? onNavigate({ page: 'students', sub: 'profile', id: studentId })
                : onNavigate({ page: 'students', sub: 'list' })
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

function StudentProfileView({
  studentId,
  role,
  flash,
  setFlash,
  onNavigate,
}: {
  studentId: number;
  role: UserRole;
  flash: FlashMessage | null;
  setFlash: (f: FlashMessage | null) => void;
  onNavigate: (r: RouteState) => void;
}) {
  const [data, setData] = useState<StudentProfileData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    apiFetch<StudentProfileData>(`/api/students/${studentId}`)
      .then(setData)
      .catch((err) => setFlash({ type: 'danger', text: (err as Error).message }));
  }, [studentId, setFlash]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    try {
      const res = await apiFetch<{ student: Student }>(
        `/api/students/${studentId}/toggle-status`,
        { method: 'POST' },
      );
      setFlash({
        type: 'info',
        text: `${res.student.first_name} ${res.student.last_name} is now ${res.student.status}.`,
      });
      load();
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  const handleDelete = async () => {
    try {
      const res = await apiFetch<{ deactivated: boolean; message: string }>(
        `/api/students/${studentId}`,
        { method: 'DELETE' },
      );
      setFlash({
        type: res.deactivated ? 'warning' : 'success',
        text: res.message,
      });
      setConfirmDelete(false);
      if (res.deactivated) {
        load();
      } else {
        onNavigate({ page: 'students', sub: 'list' });
      }
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  if (!data) return <LoadingState label="Loading student profile..." />;
  const { student: s } = data;
  const fullName = `${s.first_name}${s.middle_name ? ` ${s.middle_name}` : ''} ${s.last_name}`;

  return (
    <div>
      <PageHeader
        title={fullName}
        subtitle={`Student Profile · ${s.student_number}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate({ page: 'students', sub: 'edit', id: s.student_id })}
              className={btnSecondaryCls}
            >
              Edit
            </button>
            <button type="button" onClick={handleToggle} className={btnSecondaryCls}>
              {s.status === 'Active' ? 'Deactivate' : 'Activate'}
            </button>
            {canAccess('reports', role) && (
              <button
                type="button"
                onClick={() =>
                  onNavigate({ page: 'reports', sub: 'student', studentId: s.student_id })
                }
                className={btnPrimaryCls}
              >
                Attendance Report
              </button>
            )}
          </>
        }
      />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Student Details</h2>
          <dl className="divide-y divide-gray-100 text-sm">
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Student No.</dt>
              <dd className="font-mono font-medium text-gray-900">{s.student_number}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Class</dt>
              <dd className="font-medium text-gray-900">
                {data.current_class ? data.current_class.label : 'Not enrolled'}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Gender</dt>
              <dd className="font-medium text-gray-900">{s.gender}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Birth Date</dt>
              <dd className="font-medium text-gray-900 tabular-nums">
                {formatShortDate(s.birth_date)}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Contact No.</dt>
              <dd className="font-medium text-gray-900">{s.contact_number || '—'}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Status</dt>
              <dd>
                <StatusText status={s.status} />
              </dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-gray-200 pt-3">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs font-medium text-red-700 hover:underline cursor-pointer"
              >
                Delete Student Record
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-gray-600">
                  Students with attendance history are deactivated instead.
                </span>
                <button type="button" onClick={handleDelete} className={btnDangerCls}>
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
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Enrollment History</h2>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                <th className="py-2 pr-3">Class</th>
                <th className="py-2 px-3">School Year</th>
                <th className="py-2 pl-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.enrollments.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-gray-500">
                    Not enrolled in any class.
                  </td>
                </tr>
              ) : (
                data.enrollments.map((e) => (
                  <tr key={e.enrollment_id}>
                    <td className="py-2 pr-3 font-medium text-gray-900">{e.class_label}</td>
                    <td className="py-2 px-3 text-gray-600">{e.school_year_name}</td>
                    <td className="py-2 pl-3">
                      <StatusText status={e.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mb-3 text-base font-semibold text-gray-900">Attendance Summary</h2>
      <SummaryStrip summary={data.summary} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Attendance History <span className="font-normal text-gray-500">(latest 60)</span>
          </h3>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 px-3">Class</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 pl-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gray-500">
                      No attendance recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.history.map((a) => (
                    <tr key={a.attendance_id}>
                      <td className="py-2 pr-3 tabular-nums text-gray-700">
                        {formatShortDate(a.attendance_date)}
                      </td>
                      <td className="py-2 px-3 text-gray-700">{a.class_label}</td>
                      <td className="py-2 px-3">
                        <StatusText status={a.status} />
                      </td>
                      <td className="py-2 pl-3 text-xs text-gray-500">{a.remarks || ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Absence History</h3>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 pl-3">Excuse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.absences.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-gray-500">
                      No absences.
                    </td>
                  </tr>
                ) : (
                  data.absences.map((ab) => (
                    <tr key={ab.absence_id}>
                      <td className="py-2 pr-3 tabular-nums">
                        {canAccess('absences', role) ? (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({
                                page: 'absences',
                                sub: 'view',
                                id: ab.absence_id,
                              })
                            }
                            className="text-blue-700 hover:underline cursor-pointer"
                          >
                            {formatShortDate(ab.absence_date)}
                          </button>
                        ) : (
                          formatShortDate(ab.absence_date)
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <StatusText status={ab.status} />
                      </td>
                      <td className="py-2 pl-3">
                        {ab.latest_excuse_status ? (
                          <StatusText status={ab.latest_excuse_status} />
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentImportView({
  onNavigate,
  onFlash,
}: {
  onNavigate: (r: RouteState) => void;
  onFlash: (f: FlashMessage | null) => void;
}) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classCode, setClassCode] = useState('');
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<{
    created: number;
    enrolled: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ classes: ClassOption[] }>('/api/students')
      .then((res) => setClasses(res.classes))
      .catch(() => {});
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{
        created: number;
        enrolled: number;
        errors: string[];
      }>('/api/students/import', {
        method: 'POST',
        body: JSON.stringify({ csv: csvText, class_code: classCode || null }),
      });
      setResult(res);
      if (res.created > 0 && res.errors.length === 0) {
        onFlash({
          type: 'success',
          text: `Imported ${res.created} student(s); enrolled ${res.enrolled}.`,
        });
        onNavigate({ page: 'students', sub: 'list' });
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Import Students from CSV"
        subtitle="Load student records in bulk from a CSV file"
      />

      <form
        onSubmit={handleSubmit}
        className="max-w-2xl rounded-md border border-gray-200 bg-white p-6"
      >
        {error && (
          <AlertBanner
            flash={{ type: 'danger', text: error }}
            onDismiss={() => setError(null)}
          />
        )}

        {result && (
          <div className="mb-4 space-y-2">
            <AlertBanner
              flash={{
                type: result.created > 0 ? 'success' : 'warning',
                text: `Imported ${result.created} student(s); enrolled ${result.enrolled}.`,
              }}
            />
            {result.errors.length > 0 && (
              <AlertBanner
                flash={{ type: 'danger', text: result.errors.join('\n') }}
              />
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="imp-file" className="mb-1 block text-sm font-medium text-gray-700">
              CSV File
            </label>
            <input
              id="imp-file"
              type="file"
              accept=".csv"
              onChange={handleFile}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500">
              Header row:{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">
                student_number,first_name,middle_name,last_name,gender,birth_date,contact_number
              </code>
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="imp-csv" className="text-sm font-medium text-gray-700">
                Or Paste CSV Content
              </label>
              <button
                type="button"
                onClick={() => setCsvText(SAMPLE_CSV)}
                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
              >
                Load sample CSV
              </button>
            </div>
            <textarea
              id="imp-csv"
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className={`${inputCls} font-mono text-xs`}
            />
          </div>

          <div>
            <label htmlFor="imp-class" className="mb-1 block text-sm font-medium text-gray-700">
              Enroll imported students in class (optional)
            </label>
            <select
              id="imp-class"
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
              className={inputCls}
            >
              <option value="">-- Do not enroll --</option>
              {classes.map((c) => (
                <option key={c.class_id} value={c.class_code}>
                  {c.label} ({c.class_code}, {c.school_year_name})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-4">
          <button type="submit" className={btnPrimaryCls}>
            Import
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'students', sub: 'list' })}
            className={btnSecondaryCls}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
