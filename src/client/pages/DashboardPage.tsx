import React, { useEffect, useState } from 'react';
import { apiFetch, RouteState } from '../api';
import { AttendanceSummary, canAccess, SchoolYear, UserRole } from '../../shared/types';
import { formatLongDate } from '../../shared/validation';
import { LoadingState, PageHeader } from '../components/ui';
import {
  DonutBreakdownChart,
  MonthlyTrendChart,
  SimpleBarChart,
} from '../components/Charts';

interface DashboardPayload {
  school_year: SchoolYear | null;
  today: string;
  total_students: number;
  today_summary: AttendanceSummary;
  overall: AttendanceSummary;
  pie: number[];
  trend_labels: string[];
  trend_rates: number[];
  trend_absences: number[];
  class_labels: string[];
  class_absences: number[];
  grade_labels: string[];
  grade_rates: number[];
  alerts: Array<{
    student_id: number;
    display_name: string;
    student_number: string;
    unexcused: number;
  }>;
  alert_threshold: number;
  frequent: Array<{
    student_id: number;
    display_name: string;
    class_label: string;
    absences: number;
  }>;
}

export function DashboardPage({
  role,
  onNavigate,
}: {
  role: UserRole;
  onNavigate: (r: RouteState) => void;
}) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardPayload>('/api/dashboard')
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, []);

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }
  if (!data) return <LoadingState label="Loading dashboard..." />;

  const kpis = [
    { label: 'Total Students', value: data.total_students, cls: 'text-gray-900' },
    { label: 'Present Today', value: data.today_summary.present, cls: 'text-emerald-700' },
    { label: 'Absent Today', value: data.today_summary.absent, cls: 'text-red-700' },
    { label: 'Late Today', value: data.today_summary.late, cls: 'text-amber-700' },
    {
      label: 'Attendance Rate Today',
      value: data.today_summary.total_days
        ? `${data.today_summary.rate.toFixed(2)}%`
        : '—',
      cls: 'text-gray-900',
    },
    {
      label: 'School Year Rate',
      value: `${data.overall.rate.toFixed(2)}%`,
      cls: 'text-gray-900',
    },
  ];

  return (
    <div>
      <PageHeader
        title="School Attendance Dashboard"
        subtitle={`${formatLongDate(data.today)}${data.school_year ? ` · School Year ${data.school_year.name}` : ''}`}
      />

      {/* KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white px-4 py-3.5">
            <div className="text-xs font-medium text-gray-500">{k.label}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${k.cls}`}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {data.today_summary.total_days === 0 && (
        <p className="mb-6 text-xs text-gray-500">
          No attendance has been recorded yet today.
        </p>
      )}

      {/* Trend Chart */}
      <div className="mb-6 rounded-md border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          Monthly Attendance Trend
        </h2>
        <MonthlyTrendChart
          labels={data.trend_labels}
          rates={data.trend_rates}
          absences={data.trend_absences}
        />
      </div>

      {/* Breakdown Charts */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Present vs. Absent (School Year)
          </h2>
          <DonutBreakdownChart values={data.pie} />
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Absences by Class
          </h2>
          <SimpleBarChart
            labels={data.class_labels}
            values={data.class_absences}
            color="#dc2626"
          />
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Attendance Rate by Grade Level
          </h2>
          <SimpleBarChart
            labels={data.grade_labels}
            values={data.grade_rates}
            color="#15803d"
            unit="%"
            maxOverride={100}
          />
        </div>
      </div>

      {/* Alerts & Frequent Absences */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-red-700">Attendance Alerts</h2>
          <p className="mt-0.5 mb-3 text-xs text-gray-500">
            Students with {data.alert_threshold} or more unexcused absences.
          </p>
          {data.alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No attendance alerts.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {data.alerts.map((a) => (
                <li
                  key={a.student_id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  {canAccess('reports', role) ? (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({
                          page: 'reports',
                          sub: 'student',
                          studentId: a.student_id,
                        })
                      }
                      className="font-medium text-blue-700 hover:underline cursor-pointer text-left"
                    >
                      {a.display_name}
                    </button>
                  ) : (
                    <span className="font-medium text-gray-900">{a.display_name}</span>
                  )}
                  <span className="text-xs font-medium text-red-700 tabular-nums">
                    {a.unexcused} Unexcused Absences
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            Students with Frequent Absences
          </h2>
          {data.frequent.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No absences recorded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 px-3">Class</th>
                    <th className="py-2 pl-3 text-right">Absences</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.frequent.map((f) => (
                    <tr key={f.student_id}>
                      <td className="py-2.5 pr-3 font-medium text-gray-900">
                        {f.display_name}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">{f.class_label}</td>
                      <td className="py-2.5 pl-3 text-right font-medium text-gray-900 tabular-nums">
                        {f.absences}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
