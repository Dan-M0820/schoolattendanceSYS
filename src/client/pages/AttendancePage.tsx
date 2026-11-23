import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, FlashMessage, RouteState } from '../api';
import {
  AbsenceRecord,
  AttendancePeriod,
  AttendanceRecord,
  AttendanceStatusCode,
  ClassSection,
  PERIODS,
  STATUS_CODES,
  STATUS_LABELS,
  Student,
} from '../../shared/types';
import { formatLongDate, formatShortDate, todayIso } from '../../shared/validation';
import {
  AlertBanner,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSmSecondaryCls,
  inputCls,
  LoadingState,
  PageHeader,
  StatusText,
} from '../components/ui';

function defaultSchoolDate(): string {
  const now = new Date();
  const day = now.getDay();
  if (day === 0) now.setDate(now.getDate() - 2);
  else if (day === 6) now.setDate(now.getDate() - 1);
  return todayIso(now);
}

export function AttendancePage({
  route,
  onNavigate,
}: {
  route: Extract<RouteState, { page: 'attendance' }>;
  onNavigate: (r: RouteState) => void;
}) {
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  if (route.sub === 'edit' && route.id) {
    return (
      <AttendanceEditView
        attendanceId={route.id}
        onNavigate={onNavigate}
        onFlash={setFlash}
      />
    );
  }

  return (
    <AttendanceIndexView
      initialClassId={route.classId}
      initialDate={route.date}
      flash={flash}
      setFlash={setFlash}
      onNavigate={onNavigate}
    />
  );
}

function AttendanceIndexView({
  initialClassId,
  initialDate,
  flash,
  setFlash,
  onNavigate,
}: {
  initialClassId?: number;
  initialDate?: string;
  flash: FlashMessage | null;
  setFlash: (f: FlashMessage | null) => void;
  onNavigate: (r: RouteState) => void;
}) {
  const [dateStr, setDateStr] = useState(initialDate || defaultSchoolDate());
  const [classId, setClassId] = useState<string>(initialClassId ? String(initialClassId) : '');
  const [subject, setSubject] = useState('');
  const [period, setPeriod] = useState<AttendancePeriod>('Whole Day');

  const [data, setData] = useState<{
    classes: Array<ClassSection & { label: string }>;
    class_section: (ClassSection & { label: string }) | null;
    date_str: string;
    sel_date: string | null;
    date_error: string | null;
    roster: Student[];
    pending: Student[];
    existing: Array<
      AttendanceRecord & {
        student: Student;
        absence: AbsenceRecord | null;
        recorder_name: string;
      }
    >;
  } | null>(null);

  const [statuses, setStatuses] = useState<Record<number, AttendanceStatusCode>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    (cid = classId, dt = dateStr) => {
      const params = new URLSearchParams();
      if (cid) params.set('class_id', cid);
      if (dt) params.set('date', dt);
      apiFetch<typeof data>(`/api/attendance?${params.toString()}`)
        .then((res) => {
          setData(res);
          if (res) {
            const initialStatuses: Record<number, AttendanceStatusCode> = {};
            const initialRemarks: Record<number, string> = {};
            for (const s of res.pending) {
              initialStatuses[s.student_id] = 'P';
              initialRemarks[s.student_id] = '';
            }
            setStatuses(initialStatuses);
            setRemarks(initialRemarks);
          }
        })
        .catch((err) => setFlash({ type: 'danger', text: (err as Error).message }));
    },
    [classId, dateStr, setFlash],
  );

  useEffect(() => {
    load(classId, dateStr);
  }, [load, classId, dateStr]);

  const handleLoadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load(classId, dateStr);
  };

  const markAll = (code: AttendanceStatusCode) => {
    if (!data) return;
    const next: Record<number, AttendanceStatusCode> = {};
    for (const s of data.pending) {
      next[s.student_id] = code;
    }
    setStatuses(next);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.class_section) return;
    setSaving(true);
    setFlash(null);
    try {
      const entries = data.pending.map((s) => ({
        student_id: s.student_id,
        status: statuses[s.student_id] || 'P',
        remarks: remarks[s.student_id] || '',
      }));
      const res = await apiFetch<{ message: string }>('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({
          class_id: data.class_section.class_id,
          date: dateStr,
          subject,
          period,
          entries,
        }),
      });
      setFlash({ type: 'success', text: res.message });
      load(String(data.class_section.class_id), dateStr);
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Daily Attendance"
        subtitle="P = Present · A = Absent · L = Late · E = Excused"
      />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <form
        onSubmit={handleLoadSubmit}
        className="mb-6 grid grid-cols-1 items-end gap-3 rounded-md border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div>
          <label htmlFor="att-date" className="mb-1 block text-xs font-medium text-gray-700">
            Date <span className="text-red-600">*</span>
          </label>
          <input
            id="att-date"
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="att-class" className="mb-1 block text-xs font-medium text-gray-700">
            Class <span className="text-red-600">*</span>
          </label>
          <select
            id="att-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={inputCls}
          >
            <option value="">-- Select class --</option>
            {data?.classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="att-subject" className="mb-1 block text-xs font-medium text-gray-700">
            Subject (optional)
          </label>
          <input
            id="att-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Homeroom"
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="att-period" className="mb-1 block text-xs font-medium text-gray-700">
            Attendance Period
          </label>
          <select
            id="att-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as AttendancePeriod)}
            className={inputCls}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className={btnPrimaryCls}>
          Load Class
        </button>
      </form>

      {!data ? (
        <LoadingState label="Loading attendance options..." />
      ) : data.class_section ? (
        <div>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            {data.sel_date ? formatLongDate(data.sel_date) : dateStr} ·{' '}
            {data.class_section.label}
          </h2>

          {data.date_error ? (
            <AlertBanner flash={{ type: 'danger', text: data.date_error }} />
          ) : data.roster.length === 0 ? (
            <AlertBanner
              flash={{
                type: 'warning',
                text: 'No students are enrolled in this class. Enroll students first.',
              }}
            />
          ) : (
            <div className="space-y-6">
              {data.pending.length > 0 && (
                <form onSubmit={handleSave}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">Mark all as:</span>
                    {STATUS_CODES.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => markAll(code)}
                        className={btnSmSecondaryCls}
                      >
                        {STATUS_LABELS[code]}
                      </button>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                          <th className="px-4 py-2.5">Student No.</th>
                          <th className="px-4 py-2.5">Student Name</th>
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-4 py-2.5">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.pending.map((s) => {
                          const current = statuses[s.student_id] || 'P';
                          return (
                            <tr key={s.student_id} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                                {s.student_number}
                              </td>
                              <td className="px-4 py-2.5 font-medium text-gray-900">
                                {s.last_name}, {s.first_name}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="inline-flex rounded-md border border-gray-300 bg-gray-50 p-0.5">
                                  {STATUS_CODES.map((code) => {
                                    const active = current === code;
                                    const activeStyle: Record<AttendanceStatusCode, string> = {
                                      P: 'bg-emerald-700 text-white',
                                      L: 'bg-amber-600 text-white',
                                      A: 'bg-red-600 text-white',
                                      E: 'bg-indigo-700 text-white',
                                    };
                                    return (
                                      <label
                                        key={code}
                                        title={STATUS_LABELS[code]}
                                        className={`cursor-pointer rounded px-2.5 py-1 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-1 ${
                                          active
                                            ? activeStyle[code]
                                            : 'text-gray-600 hover:bg-white'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name={`status_${s.student_id}`}
                                          value={code}
                                          checked={active}
                                          onChange={() =>
                                            setStatuses((prev) => ({
                                              ...prev,
                                              [s.student_id]: code,
                                            }))
                                          }
                                          className="sr-only"
                                        />
                                        {code}
                                      </label>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <input
                                  type="text"
                                  value={remarks[s.student_id] || ''}
                                  onChange={(e) =>
                                    setRemarks((prev) => ({
                                      ...prev,
                                      [s.student_id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Optional"
                                  aria-label={`Remarks for ${s.first_name} ${s.last_name}`}
                                  className={inputCls}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <button type="submit" disabled={saving} className={btnPrimaryCls}>
                      {saving ? 'Saving...' : 'Save Attendance'}
                    </button>
                    <span className="text-xs text-gray-500">
                      {data.pending.length} student(s) not yet recorded
                    </span>
                  </div>
                </form>
              )}

              {data.existing.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">
                    Already Recorded ({data.existing.length})
                  </h3>
                  <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                          <th className="px-4 py-2.5">Student No.</th>
                          <th className="px-4 py-2.5">Student Name</th>
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-4 py-2.5">Absence</th>
                          <th className="px-4 py-2.5">Remarks</th>
                          <th className="px-4 py-2.5">Recorded By</th>
                          <th className="px-4 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.existing.map((a) => (
                          <tr key={a.attendance_id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                              {a.student.student_number}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-gray-900">
                              {a.student.last_name}, {a.student.first_name}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusText status={a.status} />
                            </td>
                            <td className="px-4 py-2.5">
                              {a.absence ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onNavigate({
                                      page: 'absences',
                                      sub: 'view',
                                      id: a.absence!.absence_id,
                                    })
                                  }
                                  className="text-blue-700 hover:underline cursor-pointer"
                                >
                                  {a.absence.status}
                                </button>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">
                              {a.remarks || ''}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">
                              {a.recorder_name}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  onNavigate({
                                    page: 'attendance',
                                    sub: 'edit',
                                    id: a.attendance_id,
                                  })
                                }
                                className={btnSmSecondaryCls}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.pending.length === 0 && (
                    <p className="mt-3 text-xs text-gray-500">
                      Attendance for every student in this class has been recorded for this
                      date.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
          Select a date and class above to load the attendance roster.
        </div>
      )}
    </div>
  );
}

function AttendanceEditView({
  attendanceId,
  onNavigate,
  onFlash,
}: {
  attendanceId: number;
  onNavigate: (r: RouteState) => void;
  onFlash: (f: FlashMessage | null) => void;
}) {
  const [data, setData] = useState<{
    record: AttendanceRecord;
    student: Student;
    class_section: ClassSection & { label: string };
    has_excuses: boolean;
  } | null>(null);
  const [status, setStatus] = useState<AttendanceStatusCode>('P');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<typeof data>(`/api/attendance/${attendanceId}`)
      .then((res) => {
        setData(res);
        if (res) {
          setStatus(res.record.status);
          setRemarks(res.record.remarks || '');
        }
      })
      .catch((err) => setError((err as Error).message));
  }, [attendanceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setError(null);
    try {
      await apiFetch(`/api/attendance/${attendanceId}`, {
        method: 'PUT',
        body: JSON.stringify({ status, remarks }),
      });
      onFlash({
        type: 'success',
        text: `Attendance for ${data.student.first_name} ${data.student.last_name} on ${formatShortDate(data.record.attendance_date)} updated to ${STATUS_LABELS[status]}.`,
      });
      onNavigate({
        page: 'attendance',
        sub: 'index',
        classId: data.record.class_id,
        date: data.record.attendance_date,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!data) return <LoadingState label="Loading attendance record..." />;

  return (
    <div>
      <PageHeader title="Edit Attendance" />

      <form
        onSubmit={handleSubmit}
        className="max-w-xl rounded-md border border-gray-200 bg-white p-6"
      >
        {error && (
          <AlertBanner
            flash={{ type: 'danger', text: error }}
            onDismiss={() => setError(null)}
          />
        )}

        <dl className="mb-5 divide-y divide-gray-100 text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Student</dt>
            <dd className="font-medium text-gray-900">
              {data.student.first_name} {data.student.last_name} (
              {data.student.student_number})
            </dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Class</dt>
            <dd className="font-medium text-gray-900">{data.class_section.label}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Date</dt>
            <dd className="font-medium text-gray-900">
              {formatLongDate(data.record.attendance_date)}
            </dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Current Status</dt>
            <dd>
              <StatusText status={data.record.status} />
            </dd>
          </div>
        </dl>

        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              New Status
            </span>
            <div className="inline-flex rounded-md border border-gray-300 bg-gray-50 p-0.5">
              {STATUS_CODES.map((code) => {
                const active = status === code;
                const activeStyle: Record<AttendanceStatusCode, string> = {
                  P: 'bg-emerald-700 text-white',
                  L: 'bg-amber-600 text-white',
                  A: 'bg-red-600 text-white',
                  E: 'bg-indigo-700 text-white',
                };
                return (
                  <label
                    key={code}
                    className={`cursor-pointer rounded px-3 py-1.5 text-xs font-semibold ${
                      active ? activeStyle[code] : 'text-gray-700 hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={code}
                      checked={active}
                      onChange={() => setStatus(code)}
                      className="sr-only"
                    />
                    {code} · {STATUS_LABELS[code]}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="ae-rem" className="mb-1 block text-sm font-medium text-gray-700">
              Remarks
            </label>
            <input
              id="ae-rem"
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className={inputCls}
            />
          </div>

          {data.has_excuses && (
            <AlertBanner
              flash={{
                type: 'warning',
                text: 'This absence has excuse request(s). Changing the status to Present or Late removes the absence record and its excuse requests.',
              }}
            />
          )}
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-4">
          <button type="submit" className={btnPrimaryCls}>
            Update
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigate({
                page: 'attendance',
                sub: 'index',
                classId: data.record.class_id,
                date: data.record.attendance_date,
              })
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
