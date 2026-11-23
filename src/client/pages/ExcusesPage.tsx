import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, FlashMessage, RouteState } from '../api';
import {
  AbsenceRecord,
  AttendanceRecord,
  EXCUSE_REASONS,
  ExcuseRecord,
  Student,
} from '../../shared/types';
import { formatDateTime, formatLongDate, formatShortDate } from '../../shared/validation';
import {
  AlertBanner,
  btnDangerCls,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSmPrimaryCls,
  btnSmSecondaryCls,
  btnSuccessCls,
  inputCls,
  LoadingState,
  PageHeader,
  StatusText,
} from '../components/ui';

interface EnrichedExcuse extends ExcuseRecord {
  student_name: string;
  student_number: string;
  absence_date: string;
}

export function ExcusesPage({
  route,
  onNavigate,
}: {
  route: Extract<RouteState, { page: 'excuses' }>;
  onNavigate: (r: RouteState) => void;
}) {
  const sub = route.sub || 'list';
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  if (sub === 'new') {
    return (
      <ExcuseCreateView
        initialAbsenceId={route.absenceId}
        onNavigate={onNavigate}
        onFlash={setFlash}
      />
    );
  }
  if (sub === 'view' && route.id) {
    return (
      <ExcuseDetailView
        excuseId={route.id}
        flash={flash}
        setFlash={setFlash}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <ExcuseListView
      flash={flash}
      setFlash={setFlash}
      onNavigate={onNavigate}
    />
  );
}

function ExcuseListView({
  flash,
  setFlash,
  onNavigate,
}: {
  flash: FlashMessage | null;
  setFlash: (f: FlashMessage | null) => void;
  onNavigate: (r: RouteState) => void;
}) {
  const [status, setStatus] = useState<'Pending' | 'Approved' | 'Rejected' | 'All'>('Pending');
  const [data, setData] = useState<{
    excuses: EnrichedExcuse[];
    counts: Record<'Pending' | 'Approved' | 'Rejected', number>;
  } | null>(null);

  const load = useCallback(
    (s = status) => {
      apiFetch<typeof data>(`/api/excuses?status=${s}`)
        .then(setData)
        .catch((err) => setFlash({ type: 'danger', text: (err as Error).message }));
    },
    [status, setFlash],
  );

  useEffect(() => {
    load(status);
  }, [load, status]);

  const tabs: Array<'Pending' | 'Approved' | 'Rejected' | 'All'> = [
    'Pending',
    'Approved',
    'Rejected',
    'All',
  ];

  return (
    <div>
      <PageHeader
        title="Excuse Requests"
        subtitle="Absent → Excuse Submitted → Pending → Review → Approved / Rejected"
        actions={
          <button
            type="button"
            onClick={() => onNavigate({ page: 'excuses', sub: 'new' })}
            className={btnPrimaryCls}
          >
            New Excuse Request
          </button>
        }
      />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-md border border-gray-200 bg-white p-1.5 w-fit">
        {tabs.map((t) => {
          const active = status === t;
          const count = t !== 'All' && data ? data.counts[t] : null;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setStatus(t)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {t}
              {count !== null ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {!data ? (
        <LoadingState label="Loading excuse requests..." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                <th className="px-4 py-2.5">Submitted</th>
                <th className="px-4 py-2.5">Student</th>
                <th className="px-4 py-2.5">Date of Absence</th>
                <th className="px-4 py-2.5">Reason</th>
                <th className="px-4 py-2.5">Attachment</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.excuses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    No {status === 'All' ? '' : status.toLowerCase()} excuse requests.
                  </td>
                </tr>
              ) : (
                data.excuses.map((e) => (
                  <tr key={e.excuse_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 tabular-nums text-gray-600">
                      {formatShortDate(e.submitted_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {e.student_name}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-700">
                      {formatShortDate(e.absence_date)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{e.reason}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {e.attachment ? 'Yes' : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusText status={e.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate({ page: 'excuses', sub: 'view', id: e.excuse_id })
                        }
                        className={
                          e.status === 'Pending' ? btnSmPrimaryCls : btnSmSecondaryCls
                        }
                      >
                        {e.status === 'Pending' ? 'Review' : 'View'}
                      </button>
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

function ExcuseCreateView({
  initialAbsenceId,
  onNavigate,
  onFlash,
}: {
  initialAbsenceId?: number;
  onNavigate: (r: RouteState) => void;
  onFlash: (f: FlashMessage | null) => void;
}) {
  const [openAbsences, setOpenAbsences] = useState<
    Array<
      AbsenceRecord & {
        student_name: string;
        student_number: string;
        class_label: string;
      }
    >
  >([]);
  const [absenceId, setAbsenceId] = useState<string>(
    initialAbsenceId ? String(initialAbsenceId) : '',
  );
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentData, setAttachmentData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ open_absences: typeof openAbsences }>('/api/excuses/open-absences')
      .then((res) => setOpenAbsences(res.open_absences))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachmentName(null);
      setAttachmentData(null);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
      setError('Attachment must be a PDF, PNG or JPG file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Attachment must be 5 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentData(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ excuse: ExcuseRecord }>('/api/excuses', {
        method: 'POST',
        body: JSON.stringify({
          absence_id: absenceId ? Number(absenceId) : null,
          reason,
          remarks,
          attachment: attachmentName,
          attachment_data: attachmentData,
        }),
      });
      onFlash({
        type: 'success',
        text: 'Excuse request submitted and is now Pending.',
      });
      onNavigate({ page: 'excuses', sub: 'view', id: res.excuse.excuse_id });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) return <LoadingState label="Loading open absences..." />;

  const selectedAbs = initialAbsenceId
    ? openAbsences.find((a) => a.absence_id === initialAbsenceId)
    : null;

  return (
    <div>
      <PageHeader title="Excuse Request" />

      <form
        onSubmit={handleSubmit}
        className="max-w-xl rounded-md border border-gray-200 bg-white p-6"
        noValidate
      >
        {error && (
          <AlertBanner
            flash={{ type: 'danger', text: error }}
            onDismiss={() => setError(null)}
          />
        )}

        <div className="space-y-4">
          {selectedAbs ? (
            <dl className="divide-y divide-gray-100 rounded border border-gray-200 px-3 text-sm">
              <div className="flex justify-between py-2">
                <dt className="text-gray-500">Student</dt>
                <dd className="font-medium text-gray-900">
                  {selectedAbs.student_name} ({selectedAbs.student_number})
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-gray-500">Date of Absence</dt>
                <dd className="font-medium text-gray-900">
                  {formatShortDate(selectedAbs.absence_date)}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-gray-500">Class</dt>
                <dd className="font-medium text-gray-900">{selectedAbs.class_label}</dd>
              </div>
            </dl>
          ) : (
            <div>
              <label htmlFor="ex-abs" className="mb-1 block text-sm font-medium text-gray-700">
                Absence (Student / Date) <span className="text-red-600">*</span>
              </label>
              <select
                id="ex-abs"
                value={absenceId}
                onChange={(e) => setAbsenceId(e.target.value)}
                className={inputCls}
              >
                <option value="">-- Select an unexcused absence --</option>
                {openAbsences.map((a) => (
                  <option key={a.absence_id} value={a.absence_id}>
                    {a.student_name} — {formatShortDate(a.absence_date)} ({a.class_label})
                  </option>
                ))}
              </select>
              {openAbsences.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  There are no unexcused absences without an excuse.
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="ex-reason" className="mb-1 block text-sm font-medium text-gray-700">
              Reason <span className="text-red-600">*</span>
            </label>
            <select
              id="ex-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputCls}
            >
              <option value="">-- Select reason --</option>
              {EXCUSE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ex-rem" className="mb-1 block text-sm font-medium text-gray-700">
              Remarks
            </label>
            <textarea
              id="ex-rem"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Required when reason is Other"
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="ex-file" className="mb-1 block text-sm font-medium text-gray-700">
              Attachment
            </label>
            <input
              id="ex-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFile}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500">
              Medical certificate or parent&apos;s letter · PDF/PNG/JPG · max 5 MB
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-4">
          <button type="submit" className={btnPrimaryCls}>
            Submit
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'excuses', sub: 'list' })}
            className={btnSecondaryCls}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ExcuseDetailView({
  excuseId,
  flash,
  setFlash,
  onNavigate,
}: {
  excuseId: number;
  flash: FlashMessage | null;
  setFlash: (f: FlashMessage | null) => void;
  onNavigate: (r: RouteState) => void;
}) {
  const [data, setData] = useState<{
    excuse: ExcuseRecord;
    student: Student;
    absence: AbsenceRecord;
    class_label: string;
    attendance: AttendanceRecord;
    submitter_name: string | null;
    reviewer_name: string | null;
    can_review: boolean;
  } | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<typeof data>(`/api/excuses/${excuseId}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [excuseId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReview = async (decision: 'Approved' | 'Rejected') => {
    setError(null);
    try {
      await apiFetch(`/api/excuses/${excuseId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, review_remarks: reviewRemarks }),
      });
      setFlash({
        type: decision === 'Approved' ? 'success' : 'info',
        text:
          decision === 'Approved'
            ? `Excuse approved. ${data?.student.first_name} ${data?.student.last_name}'s absence on ${formatShortDate(data?.absence.absence_date)} is now Excused.`
            : 'Excuse rejected. The absence remains Unexcused.',
      });
      onNavigate({ page: 'excuses', sub: 'list' });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!data) return <LoadingState label="Loading excuse request..." />;

  const { excuse: ex } = data;

  return (
    <div>
      <PageHeader title={`Excuse Request #${ex.excuse_id}`} />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}
      {error && (
        <AlertBanner
          flash={{ type: 'danger', text: error }}
          onDismiss={() => setError(null)}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-gray-200 bg-white p-5">
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
              <dt className="text-gray-500">Date of Absence</dt>
              <dd className="font-medium text-gray-900">
                {formatLongDate(data.absence.absence_date)}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Attendance</dt>
              <dd>
                <StatusText status={data.attendance.status} />
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Reason</dt>
              <dd className="font-medium text-gray-900">{ex.reason}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Remarks</dt>
              <dd className="font-medium text-gray-900">{ex.remarks || '—'}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Attachment</dt>
              <dd className="font-medium text-gray-900">
                {ex.attachment && ex.attachment_data ? (
                  <a
                    href={ex.attachment_data}
                    download={ex.attachment}
                    className="text-blue-700 hover:underline"
                  >
                    {ex.attachment}
                  </a>
                ) : (
                  ex.attachment || 'None'
                )}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Submitted</dt>
              <dd className="font-medium text-gray-900">
                {formatDateTime(ex.submitted_at)}
                {data.submitter_name ? ` by ${data.submitter_name}` : ''}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Status</dt>
              <dd>
                <StatusText status={ex.status} />
              </dd>
            </div>
            {ex.reviewed_at && (
              <>
                <div className="flex justify-between py-2">
                  <dt className="text-gray-500">Reviewed</dt>
                  <dd className="font-medium text-gray-900">
                    {formatDateTime(ex.reviewed_at)}
                    {data.reviewer_name ? ` by ${data.reviewer_name}` : ''}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-gray-500">Review Remarks</dt>
                  <dd className="font-medium text-gray-900">
                    {ex.review_remarks || '—'}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {ex.status === 'Pending' && data.can_review && (
          <div className="rounded-md border border-gray-200 bg-white p-5 h-fit">
            <h2 className="text-sm font-semibold text-gray-900">
              Teacher / Adviser Review
            </h2>
            <p className="mt-1 mb-4 text-xs text-gray-500">
              Approving changes the attendance status from Absent to Excused.
            </p>
            <div>
              <label
                htmlFor="ex-rev-rem"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Review Remarks
              </label>
              <textarea
                id="ex-rev-rem"
                rows={3}
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                placeholder="Required when rejecting"
                className={inputCls}
              />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleReview('Approved')}
                className={btnSuccessCls}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => handleReview('Rejected')}
                className={btnDangerCls}
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => onNavigate({ page: 'excuses', sub: 'list' })}
          className={btnSecondaryCls}
        >
          Back to Excuses
        </button>
      </div>
    </div>
  );
}
