import React from 'react';
import { AttendanceSummary, STATUS_LABELS, AttendanceStatusCode } from '../../shared/types';
import { FlashMessage } from '../api';

export function StatusText({ status }: { status: string }) {
  const map: Record<string, string> = {
    P: 'text-emerald-700',
    Present: 'text-emerald-700',
    Active: 'text-emerald-700',
    Approved: 'text-emerald-700',
    Enrolled: 'text-emerald-700',
    L: 'text-amber-700',
    Late: 'text-amber-700',
    Pending: 'text-amber-700',
    A: 'text-red-700',
    Absent: 'text-red-700',
    Unexcused: 'text-red-700',
    Rejected: 'text-red-700',
    Inactive: 'text-gray-500',
    Dropped: 'text-gray-500',
    Transferred: 'text-gray-500',
    E: 'text-indigo-700',
    Excused: 'text-indigo-700',
  };
  const label =
    status in STATUS_LABELS
      ? STATUS_LABELS[status as AttendanceStatusCode]
      : status;
  const color = map[status] || 'text-gray-700';
  return <span className={`font-medium ${color}`}>{label}</span>;
}

export function AlertBanner({
  flash,
  onDismiss,
}: {
  flash: FlashMessage;
  onDismiss?: () => void;
}) {
  const styles: Record<FlashMessage['type'], string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
  };
  return (
    <div
      role="alert"
      className={`mb-4 flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm ${styles[flash.type]}`}
    >
      <div className="whitespace-pre-line">{flash.text}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-medium opacity-70 hover:opacity-100"
          aria-label="Dismiss message"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function SummaryStrip({ summary }: { summary: AttendanceSummary }) {
  const items = [
    { label: 'School Days', value: summary.total_days, cls: 'text-gray-900' },
    { label: 'Present', value: summary.present, cls: 'text-emerald-700' },
    { label: 'Late', value: summary.late, cls: 'text-amber-700' },
    { label: 'Absent', value: summary.absent, cls: 'text-red-700' },
    { label: 'Excused', value: summary.excused, cls: 'text-indigo-700' },
    { label: 'Unexcused', value: summary.unexcused, cls: 'text-red-700' },
    { label: 'Attendance Rate', value: `${summary.rate.toFixed(2)}%`, cls: 'text-gray-900' },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 divide-y divide-gray-200 rounded-md border border-gray-200 bg-white sm:grid-cols-4 lg:grid-cols-7 lg:divide-x lg:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="px-4 py-3">
          <div className="text-xs font-medium text-gray-500">{item.label}</div>
          <div className={`mt-1 text-lg font-semibold tabular-nums ${item.cls}`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  total,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-gray-600 no-print">
      <span>
        Page {page} of {pages} · {total} records
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
      {label}
    </div>
  );
}

export const inputCls =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600';
export const btnPrimaryCls =
  'inline-flex items-center justify-center rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer';
export const btnSecondaryCls =
  'inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer';
export const btnDangerCls =
  'inline-flex items-center justify-center rounded-md bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer';
export const btnSuccessCls =
  'inline-flex items-center justify-center rounded-md bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer';
export const btnSmSecondaryCls =
  'inline-flex items-center justify-center rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap shrink-0 cursor-pointer';
export const btnSmPrimaryCls =
  'inline-flex items-center justify-center rounded bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer';
