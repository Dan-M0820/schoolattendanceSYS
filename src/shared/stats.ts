import {
  AttendanceRecord,
  AttendanceStatusCode,
  AttendanceSummary,
  ClassSection,
} from './types';

export type StatusCounts = Record<AttendanceStatusCode, number>;

export function emptyCounts(): StatusCounts {
  return { P: 0, L: 0, A: 0, E: 0 };
}

export function summarizeCounts(
  counts: StatusCounts,
  lateCountsAsPresent = true,
): AttendanceSummary {
  const total = counts.P + counts.L + counts.A + counts.E;
  const attended = counts.P + (lateCountsAsPresent ? counts.L : 0);
  const rate = total > 0 ? Math.round((attended / total) * 10000) / 100 : 0.0;
  return {
    total_days: total,
    present: counts.P,
    late: counts.L,
    absent: counts.A + counts.E,
    excused: counts.E,
    unexcused: counts.A,
    rate,
  };
}

export function countRecords(records: Pick<AttendanceRecord, 'status'>[]): StatusCounts {
  const counts = emptyCounts();
  for (const r of records) {
    if (r.status in counts) {
      counts[r.status] += 1;
    }
  }
  return counts;
}

export interface AttendanceFilters {
  date_from?: string;
  date_to?: string;
  school_year_id?: number;
  grade_level?: string;
  section?: string;
  class_id?: number;
  student_id?: number;
  status?: AttendanceStatusCode;
}

export function filterAttendanceRecords(
  records: AttendanceRecord[],
  classesById: Map<number, ClassSection>,
  filters: AttendanceFilters = {},
): AttendanceRecord[] {
  return records.filter((r) => {
    if (filters.date_from && r.attendance_date < filters.date_from) return false;
    if (filters.date_to && r.attendance_date > filters.date_to) return false;
    const cls = classesById.get(r.class_id);
    if (filters.school_year_id && cls?.school_year_id !== filters.school_year_id) return false;
    if (filters.grade_level && cls?.grade_level !== filters.grade_level) return false;
    if (filters.section && cls?.section !== filters.section) return false;
    if (filters.class_id && r.class_id !== filters.class_id) return false;
    if (filters.student_id && r.student_id !== filters.student_id) return false;
    if (filters.status && r.status !== filters.status) return false;
    return true;
  });
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
