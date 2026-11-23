import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, RouteState } from '../api';
import {
  AttendanceRecord,
  AttendanceSummary,
  ClassSection,
  SchoolYear,
  STATUS_LABELS,
  Student,
} from '../../shared/types';
import { formatLongDate, formatShortDate, todayIso } from '../../shared/validation';
import {
  AlertBanner,
  btnPrimaryCls,
  btnSecondaryCls,
  inputCls,
  LoadingState,
  PageHeader,
  StatusText,
  SummaryStrip,
} from '../components/ui';

export function ReportsPage({
  route,
  schoolName,
  onNavigate,
}: {
  route: Extract<RouteState, { page: 'reports' }>;
  schoolName: string;
  onNavigate: (r: RouteState) => void;
}) {
  const sub = route.sub || 'hub';
  if (sub === 'daily') {
    return (
      <DailyReportView
        schoolName={schoolName}
        initialClassId={route.classId}
        onNavigate={onNavigate}
      />
    );
  }
  if (sub === 'student') {
    return (
      <StudentReportView
        schoolName={schoolName}
        initialStudentId={route.studentId}
        onNavigate={onNavigate}
      />
    );
  }
  if (sub === 'class') {
    return (
      <ClassReportView
        schoolName={schoolName}
        initialClassId={route.classId}
        onNavigate={onNavigate}
      />
    );
  }
  if (sub === 'custom') {
    return <CustomReportView schoolName={schoolName} onNavigate={onNavigate} />;
  }

  return (
    <div>
      <PageHeader
        title="Attendance Reports"
        subtitle="Every report can be printed (or saved as PDF) and downloaded as CSV"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          {
            sub: 'daily' as const,
            title: 'Daily Attendance Report',
            desc: 'Present, Late, Absent, and Excused breakdown for one class on one date.',
          },
          {
            sub: 'student' as const,
            title: 'Student Attendance Report',
            desc: 'Attendance history, totals, and attendance percentage for one student.',
          },
          {
            sub: 'class' as const,
            title: 'Class Attendance Report',
            desc: 'Statistics for every student in a class, sorted by absences.',
          },
          {
            sub: 'custom' as const,
            title: 'Custom / Filtered Report',
            desc: 'Filter by date range, school year, grade level, section, student, and status.',
          },
        ].map((item) => (
          <button
            key={item.sub}
            type="button"
            onClick={() => onNavigate({ page: 'reports', sub: item.sub })}
            className="rounded-md border border-gray-200 bg-white p-5 text-left transition-colors hover:border-blue-600 hover:bg-gray-50/60 cursor-pointer"
          >
            <div className="text-sm font-semibold text-gray-900">{item.title}</div>
            <p className="mt-1 text-sm text-gray-500">{item.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function DailyReportView({
  schoolName,
  initialClassId,
  onNavigate,
}: {
  schoolName: string;
  initialClassId?: number;
  onNavigate: (r: RouteState) => void;
}) {
  const [dateStr, setDateStr] = useState(todayIso());
  const [classId, setClassId] = useState(initialClassId ? String(initialClassId) : '');
  const [data, setData] = useState<{
    classes: Array<ClassSection & { label: string; school_year_name: string }>;
    report_date: string;
    cls: (ClassSection & { label: string; adviser_name: string }) | null;
    rows: Array<{ student: Student; record: AttendanceRecord | null }>;
    totals: AttendanceSummary | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((cid = classId, dt = dateStr) => {
    const params = new URLSearchParams();
    if (cid) params.set('class_id', cid);
    if (dt) params.set('date', dt);
    setError(null);
    apiFetch<typeof data>(`/api/reports/daily?${params.toString()}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [classId, dateStr]);

  useEffect(() => {
    load(classId, dateStr);
  }, [load, classId, dateStr]);

  return (
    <div>
      <PageHeader
        title="Daily Attendance Report"
        actions={
          <button
            type="button"
            onClick={() => onNavigate({ page: 'reports', sub: 'hub' })}
            className={btnSecondaryCls}
          >
            All Reports
          </button>
        }
      />

      {error && <AlertBanner flash={{ type: 'danger', text: error }} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(classId, dateStr);
        }}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-white p-4 no-print"
      >
        <div className="w-44">
          <label htmlFor="rd-date" className="mb-1 block text-xs font-medium text-gray-700">
            Date
          </label>
          <input
            id="rd-date"
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="w-64">
          <label htmlFor="rd-class" className="mb-1 block text-xs font-medium text-gray-700">
            Class
          </label>
          <select
            id="rd-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={inputCls}
          >
            <option value="">-- Select class --</option>
            {data?.classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.label} ({c.school_year_name})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={btnPrimaryCls}>
          Generate
        </button>
      </form>

      {!data ? (
        <LoadingState label="Loading report..." />
      ) : (
        data.cls && (
          <div>
            <div className="rounded-md border border-gray-200 bg-white p-6">
              <div className="mb-5 border-b border-gray-200 pb-4 text-center">
                <h2 className="text-base font-semibold text-gray-900">
                  School Attendance Report
                </h2>
                <div className="text-sm text-gray-600">{schoolName}</div>
                <div className="mt-1 text-xs text-gray-500">
                  Date: {formatLongDate(data.report_date)} · Class: {data.cls.label} ·
                  Adviser: {data.cls.adviser_name}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Student</th>
                      <th className="px-3 py-2 text-center">Present</th>
                      <th className="px-3 py-2 text-center">Late</th>
                      <th className="px-3 py-2 text-center">Absent</th>
                      <th className="px-3 py-2 text-center">Excused</th>
                      <th className="px-3 py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                          No students enrolled.
                        </td>
                      </tr>
                    ) : (
                      data.rows.map((r, i) => (
                        <tr key={r.student.student_id}>
                          <td className="px-3 py-2 text-gray-500 tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {r.student.last_name}, {r.student.first_name}
                          </td>
                          {(['P', 'L', 'A', 'E'] as const).map((code) => (
                            <td key={code} className="px-3 py-2 text-center font-semibold text-emerald-700">
                              {r.record?.status === code ? '✓' : ''}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {!r.record ? 'Not recorded' : r.record.remarks || ''}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {data.totals && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-gray-50 text-xs font-semibold text-gray-900 tabular-nums">
                        <th className="px-3 py-2.5" />
                        <th className="px-3 py-2.5">Total</th>
                        <th className="px-3 py-2.5 text-center">{data.totals.present}</th>
                        <th className="px-3 py-2.5 text-center">{data.totals.late}</th>
                        <th className="px-3 py-2.5 text-center">{data.totals.unexcused}</th>
                        <th className="px-3 py-2.5 text-center">{data.totals.excused}</th>
                        <th className="px-3 py-2.5">
                          Rate: {data.totals.rate.toFixed(2)}%
                        </th>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className={btnPrimaryCls}
              >
                Print / Save as PDF
              </button>
              <a
                href={`/api/reports/daily?class_id=${data.cls.class_id}&date=${data.report_date}&format=csv`}
                className={btnSecondaryCls}
              >
                Download CSV
              </a>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function StudentReportView({
  schoolName,
  initialStudentId,
  onNavigate,
}: {
  schoolName: string;
  initialStudentId?: number;
  onNavigate: (r: RouteState) => void;
}) {
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<{
    stu: (Student & { current_class_label: string }) | null;
    matches: Student[];
    summary: AttendanceSummary | null;
    records: Array<AttendanceRecord & { class_label: string; absence_status: string }>;
  } | null>(null);
  const [searched, setSearched] = useState(false);

  const load = useCallback(
    (opts: { student_id?: number; q?: string } = {}) => {
      const params = new URLSearchParams();
      if (opts.student_id) params.set('student_id', String(opts.student_id));
      else if (opts.q ?? q) params.set('q', (opts.q ?? q).trim());
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      apiFetch<typeof data>(`/api/reports/student?${params.toString()}`).then((res) => {
        setData(res);
        setSearched(Boolean(opts.student_id || (opts.q ?? q)));
      });
    },
    [q, dateFrom, dateTo],
  );

  useEffect(() => {
    if (initialStudentId) load({ student_id: initialStudentId });
  }, [initialStudentId, load]);

  return (
    <div>
      <PageHeader
        title="Student Attendance Report"
        actions={
          <button
            type="button"
            onClick={() => onNavigate({ page: 'reports', sub: 'hub' })}
            className={btnSecondaryCls}
          >
            All Reports
          </button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load({ q });
        }}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-white p-4 no-print"
      >
        <div className="min-w-[200px] flex-1">
          <label htmlFor="rs-q" className="mb-1 block text-xs font-medium text-gray-700">
            Student
          </label>
          <input
            id="rs-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Student no. or name"
            className={inputCls}
          />
        </div>
        <div className="w-40">
          <label htmlFor="rs-from" className="mb-1 block text-xs font-medium text-gray-700">
            From
          </label>
          <input
            id="rs-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="w-40">
          <label htmlFor="rs-to" className="mb-1 block text-xs font-medium text-gray-700">
            To
          </label>
          <input
            id="rs-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputCls}
          />
        </div>
        <button type="submit" className={btnPrimaryCls}>
          Generate
        </button>
      </form>

      {data?.matches && data.matches.length > 1 && !data.stu && (
        <div className="mb-6 rounded-md border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Select a student</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {data.matches.map((m) => (
              <li key={m.student_id} className="py-1.5">
                <button
                  type="button"
                  onClick={() => load({ student_id: m.student_id })}
                  className="text-blue-700 hover:underline cursor-pointer"
                >
                  {m.first_name} {m.last_name} ({m.student_number})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {searched && data && !data.stu && data.matches.length === 0 && (
        <AlertBanner
          flash={{ type: 'warning', text: `No student matches "${q}".` }}
        />
      )}

      {data?.stu && data.summary && (
        <div>
          <div className="rounded-md border border-gray-200 bg-white p-6">
            <div className="mb-5 border-b border-gray-200 pb-4 text-center">
              <h2 className="text-base font-semibold text-gray-900">
                Student Attendance Report
              </h2>
              <div className="text-sm text-gray-600">{schoolName}</div>
              {(dateFrom || dateTo) && (
                <div className="mt-1 text-xs text-gray-500">
                  Period: {dateFrom || 'start'} to {dateTo || 'present'}
                </div>
              )}
            </div>

            <dl className="mb-6 grid grid-cols-1 gap-x-8 divide-y divide-gray-100 text-sm sm:grid-cols-2">
              <div className="flex justify-between py-2">
                <dt className="text-gray-500">Student</dt>
                <dd className="font-medium text-gray-900">
                  {data.stu.first_name} {data.stu.last_name}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-gray-500">Student No.</dt>
                <dd className="font-mono font-medium text-gray-900">
                  {data.stu.student_number}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-gray-500">Class</dt>
                <dd className="font-medium text-gray-900">
                  {data.stu.current_class_label}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-gray-500">Attendance Percentage</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {data.summary.rate.toFixed(2)}%
                </dd>
              </div>
            </dl>

            <SummaryStrip summary={data.summary} />

            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Attendance History
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Absence</th>
                    <th className="px-3 py-2">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.records.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                        No attendance records in this period.
                      </td>
                    </tr>
                  ) : (
                    data.records.map((a) => (
                      <tr key={a.attendance_id}>
                        <td className="px-3 py-2 tabular-nums text-gray-700">
                          {formatShortDate(a.attendance_date)}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{a.class_label}</td>
                        <td className="px-3 py-2">
                          <StatusText status={a.status} />
                        </td>
                        <td className="px-3 py-2 text-gray-600">{a.absence_status}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {a.remarks || ''}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className={btnPrimaryCls}
            >
              Print / Save as PDF
            </button>
            <a
              href={`/api/reports/student?student_id=${data.stu.student_id}&date_from=${dateFrom}&date_to=${dateTo}&format=csv`}
              className={btnSecondaryCls}
            >
              Download CSV
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ClassReportView({
  schoolName,
  initialClassId,
  onNavigate,
}: {
  schoolName: string;
  initialClassId?: number;
  onNavigate: (r: RouteState) => void;
}) {
  const [classId, setClassId] = useState(initialClassId ? String(initialClassId) : '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<{
    classes: Array<ClassSection & { label: string; school_year_name: string }>;
    cls: (ClassSection & { label: string; school_year_name: string; adviser_name: string }) | null;
    rows: Array<{ student: Student } & AttendanceSummary>;
    totals: AttendanceSummary | null;
    threshold: number;
  } | null>(null);

  const load = useCallback(
    (cid = classId) => {
      const params = new URLSearchParams();
      if (cid) params.set('class_id', cid);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      apiFetch<typeof data>(`/api/reports/class?${params.toString()}`).then(setData);
    },
    [classId, dateFrom, dateTo],
  );

  useEffect(() => {
    load(classId);
  }, [load, classId]);

  return (
    <div>
      <PageHeader
        title="Class Attendance Report"
        actions={
          <button
            type="button"
            onClick={() => onNavigate({ page: 'reports', sub: 'hub' })}
            className={btnSecondaryCls}
          >
            All Reports
          </button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(classId);
        }}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-white p-4 no-print"
      >
        <div className="w-64">
          <label htmlFor="rc-class" className="mb-1 block text-xs font-medium text-gray-700">
            Class
          </label>
          <select
            id="rc-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={inputCls}
          >
            <option value="">-- Select class --</option>
            {data?.classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.label} ({c.school_year_name})
              </option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label htmlFor="rc-from" className="mb-1 block text-xs font-medium text-gray-700">
            From
          </label>
          <input
            id="rc-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="w-40">
          <label htmlFor="rc-to" className="mb-1 block text-xs font-medium text-gray-700">
            To
          </label>
          <input
            id="rc-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputCls}
          />
        </div>
        <button type="submit" className={btnPrimaryCls}>
          Generate
        </button>
      </form>

      {data?.cls && (
        <div>
          <div className="rounded-md border border-gray-200 bg-white p-6">
            <div className="mb-5 border-b border-gray-200 pb-4 text-center">
              <h2 className="text-base font-semibold text-gray-900">
                Class Attendance Report
              </h2>
              <div className="text-sm text-gray-600">{schoolName}</div>
              <div className="mt-1 text-xs text-gray-500">
                Class: {data.cls.label} · School Year {data.cls.school_year_name} · Adviser:{' '}
                {data.cls.adviser_name}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2 text-right">Present</th>
                    <th className="px-3 py-2 text-right">Late</th>
                    <th className="px-3 py-2 text-right">Absent</th>
                    <th className="px-3 py-2 text-right">Excused</th>
                    <th className="px-3 py-2 text-right">Unexcused</th>
                    <th className="px-3 py-2 text-right">Days</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.rows.map((r) => (
                    <tr key={r.student.student_id}>
                      <td className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate({
                              page: 'reports',
                              sub: 'student',
                              studentId: r.student.student_id,
                            })
                          }
                          className="text-blue-700 hover:underline cursor-pointer text-left"
                        >
                          {r.student.last_name}, {r.student.first_name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.present}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.late}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.absent}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.excused}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          r.unexcused >= data.threshold
                            ? 'font-semibold text-red-700'
                            : ''
                        }`}
                      >
                        {r.unexcused}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.total_days}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {r.rate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data.totals && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50 text-xs font-semibold text-gray-900 tabular-nums">
                      <th className="px-3 py-2.5">Class Total</th>
                      <th className="px-3 py-2.5 text-right">{data.totals.present}</th>
                      <th className="px-3 py-2.5 text-right">{data.totals.late}</th>
                      <th className="px-3 py-2.5 text-right">{data.totals.absent}</th>
                      <th className="px-3 py-2.5 text-right">{data.totals.excused}</th>
                      <th className="px-3 py-2.5 text-right">{data.totals.unexcused}</th>
                      <th className="px-3 py-2.5 text-right">{data.totals.total_days}</th>
                      <th className="px-3 py-2.5 text-right">
                        {data.totals.rate.toFixed(1)}%
                      </th>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Sorted by number of absences (highest first).
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className={btnPrimaryCls}
            >
              Print / Save as PDF
            </button>
            <a
              href={`/api/reports/class?class_id=${data.cls.class_id}&date_from=${dateFrom}&date_to=${dateTo}&format=csv`}
              className={btnSecondaryCls}
            >
              Download CSV
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomReportView({
  schoolName,
  onNavigate,
}: {
  schoolName: string;
  onNavigate: (r: RouteState) => void;
}) {
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    school_year_id: '',
    grade_level: '',
    section: '',
    student_id: '',
    status: '',
  });
  const [data, setData] = useState<{
    ran: boolean;
    totals: AttendanceSummary | null;
    total_count: number;
    records: Array<
      AttendanceRecord & {
        student_number: string;
        student_name: string;
        grade_level: string;
        section: string;
        absence_status: string;
      }
    >;
    school_years: SchoolYear[];
    grades: string[];
    sections: string[];
    students: Student[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runReport = useCallback((run = false, f = filters) => {
    const params = new URLSearchParams();
    if (run) params.set('run', '1');
    Object.entries(f).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    setError(null);
    apiFetch<typeof data>(`/api/reports/custom?${params.toString()}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [filters]);

  useEffect(() => {
    runReport(false);
  }, [runReport]);

  const csvParams = new URLSearchParams({ run: '1', format: 'csv' });
  Object.entries(filters).forEach(([k, v]) => {
    if (v) csvParams.set(k, v);
  });

  return (
    <div>
      <PageHeader
        title="Custom Attendance Report"
        actions={
          <button
            type="button"
            onClick={() => onNavigate({ page: 'reports', sub: 'hub' })}
            className={btnSecondaryCls}
          >
            All Reports
          </button>
        }
      />

      {error && <AlertBanner flash={{ type: 'danger', text: error }} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runReport(true, filters);
        }}
        className="mb-6 grid grid-cols-1 items-end gap-3 rounded-md border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 no-print"
      >
        <div>
          <label htmlFor="cu-from" className="mb-1 block text-xs font-medium text-gray-700">
            From
          </label>
          <input
            id="cu-from"
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="cu-to" className="mb-1 block text-xs font-medium text-gray-700">
            To
          </label>
          <input
            id="cu-to"
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="cu-sy" className="mb-1 block text-xs font-medium text-gray-700">
            School Year
          </label>
          <select
            id="cu-sy"
            value={filters.school_year_id}
            onChange={(e) => setFilters({ ...filters, school_year_id: e.target.value })}
            className={inputCls}
          >
            <option value="">All</option>
            {data?.school_years.map((sy) => (
              <option key={sy.school_year_id} value={sy.school_year_id}>
                {sy.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cu-grade" className="mb-1 block text-xs font-medium text-gray-700">
            Grade Level
          </label>
          <select
            id="cu-grade"
            value={filters.grade_level}
            onChange={(e) => setFilters({ ...filters, grade_level: e.target.value })}
            className={inputCls}
          >
            <option value="">All</option>
            {data?.grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cu-sec" className="mb-1 block text-xs font-medium text-gray-700">
            Section
          </label>
          <select
            id="cu-sec"
            value={filters.section}
            onChange={(e) => setFilters({ ...filters, section: e.target.value })}
            className={inputCls}
          >
            <option value="">All</option>
            {data?.sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cu-stu" className="mb-1 block text-xs font-medium text-gray-700">
            Student
          </label>
          <select
            id="cu-stu"
            value={filters.student_id}
            onChange={(e) => setFilters({ ...filters, student_id: e.target.value })}
            className={inputCls}
          >
            <option value="">All</option>
            {data?.students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.last_name}, {s.first_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cu-status" className="mb-1 block text-xs font-medium text-gray-700">
            Attendance Status
          </label>
          <select
            id="cu-status"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className={inputCls}
          >
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className={btnPrimaryCls}>
            Generate
          </button>
          <button
            type="button"
            onClick={() => {
              const empty = {
                date_from: '',
                date_to: '',
                school_year_id: '',
                grade_level: '',
                section: '',
                student_id: '',
                status: '',
              };
              setFilters(empty);
              runReport(false, empty);
            }}
            className={btnSecondaryCls}
          >
            Reset
          </button>
        </div>
      </form>

      {data?.ran && data.totals && (
        <div>
          <div className="rounded-md border border-gray-200 bg-white p-6">
            <div className="mb-4 text-center">
              <h2 className="text-base font-semibold text-gray-900">
                Attendance Report
              </h2>
              <div className="text-sm text-gray-600">{schoolName}</div>
            </div>

            <SummaryStrip summary={data.totals} />

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Student No.</th>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2">Section</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Absence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.records.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                        No records match the filters.
                      </td>
                    </tr>
                  ) : (
                    data.records.map((a) => (
                      <tr key={a.attendance_id}>
                        <td className="px-3 py-2 tabular-nums text-gray-700">
                          {formatShortDate(a.attendance_date)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">
                          {a.student_number}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {a.student_name}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{a.grade_level}</td>
                        <td className="px-3 py-2 text-gray-600">{a.section}</td>
                        <td className="px-3 py-2">
                          <StatusText status={a.status} />
                        </td>
                        <td className="px-3 py-2 text-gray-600">{a.absence_status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data.total_count > 500 && (
              <p className="mt-3 text-xs text-gray-500">
                Showing the first 500 rows. Download the CSV for the complete list.
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className={btnPrimaryCls}
            >
              Print / Save as PDF
            </button>
            <a
              href={`/api/reports/custom?${csvParams.toString()}`}
              className={btnSecondaryCls}
            >
              Download CSV
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
