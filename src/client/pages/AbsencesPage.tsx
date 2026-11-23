import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, FlashMessage, RouteState } from '../api';
import {
  AbsenceRecord,
  AttendanceRecord,
  AttendanceSummary,
  ClassSection,
  ExcuseRecord,
  Student,
} from '../../shared/types';
import { formatDateTime, formatLongDate, formatShortDate } from '../../shared/validation';
import {
  AlertBanner,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSmPrimaryCls,
  btnSmSecondaryCls,
  inputCls,
  LoadingState,
  PageHeader,
  Pagination,
  StatusText,
  SummaryStrip,
} from '../components/ui';

interface EnrichedAbsence extends AbsenceRecord {
  student: Student;
  class_label: string;
  latest_excuse: ExcuseRecord | null;
  has_open_excuse: boolean;
}

export function AbsencesPage({
  route,
  onNavigate,
}: {
  route: Extract<RouteState, { page: 'absences' }>;
  onNavigate: (r: RouteState) => void;
}) {
  const sub = route.sub || 'list';
  if (sub === 'view' && route.id) {
    return <AbsenceDetailsView absenceId={route.id} onNavigate={onNavigate} />;
  }
  if (sub === 'summary') {
    return (
      <AbsenceSummaryView
        initialStudentId={route.studentId}
        onNavigate={onNavigate}
      />
    );
  }
  return <AbsenceListView onNavigate={onNavigate} />;
}

function AbsenceListView({ onNavigate }: { onNavigate: (r: RouteState) => void }) {
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    items: EnrichedAbsence[];
    page: number;
    pages: number;
    total: number;
    classes: Array<ClassSection & { label: string; school_year_name: string }>;
  } | null>(null);

  const load = useCallback(
    (targetPage = page) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (classId) params.set('class_id', classId);
      if (status) params.set('status', status);
      params.set('page', String(targetPage));
      setError(null);
      apiFetch<typeof data>(`/api/absences?${params.toString()}`)
        .then(setData)
        .catch((err) => setError((err as Error).message));
    },
    [q, dateFrom, dateTo, classId, status, page],
  );

  useEffect(() => {
    load(page);
  }, [load, page]);

  return (
    <div>
      <PageHeader
        title="Absence Records"
        subtitle="Created automatically whenever a student is marked Absent"
        actions={
          <button
            type="button"
            onClick={() => onNavigate({ page: 'absences', sub: 'summary' })}
            className={btnSecondaryCls}
          >
            Absence Summary
          </button>
        }
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
          setPage(1);
          load(1);
        }}
        className="mb-4 grid grid-cols-1 items-end gap-3 rounded-md border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <div>
          <label htmlFor="ab-q" className="mb-1 block text-xs font-medium text-gray-700">
            Student
          </label>
          <input
            id="ab-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="No. or name"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="ab-from" className="mb-1 block text-xs font-medium text-gray-700">
            From
          </label>
          <input
            id="ab-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="ab-to" className="mb-1 block text-xs font-medium text-gray-700">
            To
          </label>
          <input
            id="ab-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="ab-class" className="mb-1 block text-xs font-medium text-gray-700">
            Class
          </label>
          <select
            id="ab-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
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
        <div>
          <label htmlFor="ab-status" className="mb-1 block text-xs font-medium text-gray-700">
            Status
          </label>
          <select
            id="ab-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputCls}
          >
            <option value="">All</option>
            <option value="Unexcused">Unexcused</option>
            <option value="Excused">Excused</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className={btnPrimaryCls}>
            Filter
          </button>
          <button
            type="button"
            onClick={() => {
              setQ('');
              setDateFrom('');
              setDateTo('');
              setClassId('');
              setStatus('');
              setPage(1);
            }}
            className={btnSecondaryCls}
          >
            Reset
          </button>
        </div>
      </form>

      {!data ? (
        <LoadingState label="Loading absence records..." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Student</th>
                  <th className="px-4 py-2.5">Class</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Excuse</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      No absence records match the filters.
                    </td>
                  </tr>
                ) : (
                  data.items.map((a) => (
                    <tr key={a.absence_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 tabular-nums text-gray-700">
                        {formatShortDate(a.absence_date)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {a.student.first_name} {a.student.last_name}{' '}
                        <span className="font-mono text-xs font-normal text-gray-500">
                          {a.student.student_number}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{a.class_label}</td>
                      <td className="px-4 py-2.5">
                        <StatusText status={a.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        {a.latest_excuse ? (
                          <StatusText status={a.latest_excuse.status} />
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate({
                                page: 'absences',
                                sub: 'view',
                                id: a.absence_id,
                              })
                            }
                            className={btnSmSecondaryCls}
                          >
                            Details
                          </button>
                          {a.status === 'Unexcused' && !a.has_open_excuse && (
                            <button
                              type="button"
                              onClick={() =>
                                onNavigate({
                                  page: 'excuses',
                                  sub: 'new',
                                  absenceId: a.absence_id,
                                })
                              }
                              className={btnSmPrimaryCls}
                            >
                              Submit Excuse
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

function AbsenceDetailsView({
  absenceId,
  onNavigate,
}: {
  absenceId: number;
  onNavigate: (r: RouteState) => void;
}) {
  const [data, setData] = useState<{
    absence: AbsenceRecord;
    student: Student;
    class_label: string;
    attendance: AttendanceRecord;
    recorder_name: string | null;
    excuses: Array<ExcuseRecord & { reviewer_name: string | null }>;
    has_open_excuse: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<typeof data>(`/api/absences/${absenceId}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [absenceId]);

  if (error) return <AlertBanner flash={{ type: 'danger', text: error }} />;
  if (!data) return <LoadingState label="Loading absence details..." />;

  return (
    <div>
      <PageHeader title="Absence Details" />

      <div className="mb-6 max-w-2xl rounded-md border border-gray-200 bg-white p-5">
        <dl className="divide-y divide-gray-100 text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Student</dt>
            <dd className="font-medium text-gray-900">
              {data.student.first_name} {data.student.last_name} (
              {data.student.student_number})
            </dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Class</dt>
            <dd className="font-medium text-gray-900">{data.class_label}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Date</dt>
            <dd className="font-medium text-gray-900">
              {formatLongDate(data.absence.absence_date)}
            </dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Attendance Status</dt>
            <dd>
              <StatusText status={data.attendance.status} />
            </dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Absence Status</dt>
            <dd>
              <StatusText status={data.absence.status} />
            </dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Recorded By</dt>
            <dd className="font-medium text-gray-900">{data.recorder_name || '—'}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">Remarks</dt>
            <dd className="font-medium text-gray-900">
              {data.attendance.remarks || '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex items-center gap-2 border-t border-gray-200 pt-4">
          {data.absence.status === 'Unexcused' && !data.has_open_excuse && (
            <button
              type="button"
              onClick={() =>
                onNavigate({
                  page: 'excuses',
                  sub: 'new',
                  absenceId: data.absence.absence_id,
                })
              }
              className={btnPrimaryCls}
            >
              Submit Excuse
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate({ page: 'absences', sub: 'list' })}
            className={btnSecondaryCls}
          >
            Back
          </button>
        </div>
      </div>

      <h2 className="mb-3 text-base font-semibold text-gray-900">Excuse Requests</h2>
      <div className="max-w-2xl overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
              <th className="px-4 py-2.5">Submitted</th>
              <th className="px-4 py-2.5">Reason</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Reviewed By</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.excuses.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No excuse submitted.
                </td>
              </tr>
            ) : (
              data.excuses.map((e) => (
                <tr key={e.excuse_id}>
                  <td className="px-4 py-2.5 text-xs text-gray-600 tabular-nums">
                    {formatDateTime(e.submitted_at)}
                  </td>
                  <td className="px-4 py-2.5 text-gray-900">{e.reason}</td>
                  <td className="px-4 py-2.5">
                    <StatusText status={e.status} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{e.reviewer_name || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({ page: 'excuses', sub: 'view', id: e.excuse_id })
                      }
                      className={btnSmSecondaryCls}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbsenceSummaryView({
  initialStudentId,
  onNavigate,
}: {
  initialStudentId?: number;
  onNavigate: (r: RouteState) => void;
}) {
  const [q, setQ] = useState('');
  const [data, setData] = useState<{
    student: Student | null;
    current_class: string | null;
    summary: AttendanceSummary | null;
    matches: Student[];
  } | null>(null);
  const [searched, setSearched] = useState(false);

  const search = useCallback((params: { q?: string; student_id?: number }) => {
    const qs = new URLSearchParams();
    if (params.student_id) qs.set('student_id', String(params.student_id));
    else if (params.q) qs.set('q', params.q);
    apiFetch<typeof data>(`/api/absences/summary?${qs.toString()}`).then((res) => {
      setData(res);
      setSearched(Boolean(params.q || params.student_id));
    });
  }, []);

  useEffect(() => {
    if (initialStudentId) search({ student_id: initialStudentId });
  }, [initialStudentId, search]);

  return (
    <div>
      <PageHeader
        title="Attendance Summary"
        subtitle="Attendance Rate = (Present Days / Total School Days) × 100"
        actions={
          <button
            type="button"
            onClick={() => onNavigate({ page: 'absences', sub: 'list' })}
            className={btnSecondaryCls}
          >
            Back to Absences
          </button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search({ q });
        }}
        className="mb-6 flex items-end gap-3 rounded-md border border-gray-200 bg-white p-4 max-w-lg"
      >
        <div className="flex-1">
          <label htmlFor="abs-sum-q" className="mb-1 block text-xs font-medium text-gray-700">
            Student
          </label>
          <input
            id="abs-sum-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Student no. or name"
            className={inputCls}
          />
        </div>
        <button type="submit" className={btnPrimaryCls}>
          Show Summary
        </button>
      </form>

      {data?.matches && data.matches.length > 1 && !data.student && (
        <div className="mb-6 rounded-md border border-gray-200 bg-white p-4 max-w-lg">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Select a student</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {data.matches.map((m) => (
              <li key={m.student_id} className="py-1.5">
                <button
                  type="button"
                  onClick={() => search({ student_id: m.student_id })}
                  className="text-blue-700 hover:underline cursor-pointer"
                >
                  {m.first_name} {m.last_name} ({m.student_number})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {searched && data && !data.student && data.matches.length === 0 && (
        <AlertBanner
          flash={{ type: 'warning', text: `No student matches "${q}".` }}
        />
      )}

      {data?.student && data.summary && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            {data.student.first_name} {data.student.last_name}{' '}
            <span className="font-normal text-sm text-gray-500">
              · {data.student.student_number} · {data.current_class || 'Not enrolled'}
            </span>
          </h2>
          <SummaryStrip summary={data.summary} />
          <p className="text-xs text-gray-500">
            Present days used in the rate include late arrivals when enabled in Settings.
          </p>
        </div>
      )}
    </div>
  );
}
