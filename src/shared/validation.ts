export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const STUDENT_NUMBER_RE = /^\d{4}-\d{4}$/;
const CONTACT_RE = /^09\d{9}$/;
const USERNAME_RE = /^[A-Za-z0-9_.]{3,50}$/;

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function required(value: string | null | undefined, field: string): string {
  const cleaned = (value ?? '').trim();
  if (!cleaned) {
    throw new ValidationError(`${field} is required.`);
  }
  return cleaned;
}

export function optional(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').trim();
  return cleaned || null;
}

export function parseDate(
  value: string | null | undefined,
  field = 'Date',
  options: { allowFuture?: boolean; minYear?: number; today?: string } = {},
): string {
  const { allowFuture = false, minYear = 1990, today = todayIso() } = options;
  const raw = required(value, field);

  let year: number;
  let month: number;
  let day: number;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (usMatch) {
    month = Number(usMatch[1]);
    day = Number(usMatch[2]);
    year = Number(usMatch[3]);
  } else {
    throw new ValidationError(`${field} '${raw}' is not a valid date.`);
  }

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    throw new ValidationError(`${field} '${raw}' is not a valid date.`);
  }

  if (year < minYear) {
    throw new ValidationError(`${field} is too far in the past.`);
  }

  const normalized = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!allowFuture && normalized > today) {
    throw new ValidationError(`${field} cannot be in the future.`);
  }

  return normalized;
}

export function formatLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatShortDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const datePart = isoDate.slice(0, 10);
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return isoDate;
  return `${m}/${d}/${y}`;
}

export function formatDateTime(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return '—';
  const dt = new Date(isoDateTime);
  if (Number.isNaN(dt.getTime())) return isoDateTime;
  return dt.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function validateStudentNumber(value: string | null | undefined): string {
  const cleaned = required(value, 'Student number');
  if (!STUDENT_NUMBER_RE.test(cleaned)) {
    throw new ValidationError(
      'Student number must follow the format YYYY-NNNN (e.g. 2026-0001).',
    );
  }
  return cleaned;
}

export function validateContactNumber(value: string | null | undefined): string | null {
  const cleaned = optional(value);
  if (cleaned === null) return null;
  const normalized = cleaned.replace(/[\s-]/g, '');
  if (!CONTACT_RE.test(normalized)) {
    throw new ValidationError(
      'Contact number must be an 11-digit mobile number starting with 09.',
    );
  }
  return normalized;
}

export function validateChoice<T extends string>(
  value: string | null | undefined,
  options: readonly T[],
  field: string,
): T {
  const cleaned = required(value, field);
  if (!options.includes(cleaned as T)) {
    throw new ValidationError(`Please select a valid ${field.toLowerCase()}.`);
  }
  return cleaned as T;
}

export function validateUsername(value: string | null | undefined): string {
  const cleaned = required(value, 'Username');
  if (!USERNAME_RE.test(cleaned)) {
    throw new ValidationError(
      'Username must be 3-50 letters, numbers, dots or underscores.',
    );
  }
  return cleaned;
}

export function validatePassword(
  value: string | null | undefined,
  field = 'Password',
): string {
  const pw = value ?? '';
  if (pw.length < 8) {
    throw new ValidationError(`${field} must be at least 8 characters.`);
  }
  if (!(/[A-Za-z]/.test(pw) && /\d/.test(pw))) {
    throw new ValidationError(`${field} must contain both letters and numbers.`);
  }
  return pw;
}

export function validateSchoolDate(
  value: string | null | undefined,
  schoolYear?: { name: string; start_date: string; end_date: string } | null,
  today?: string,
): string {
  const parsed = parseDate(value, 'Attendance date', { today });
  const [y, m, d] = parsed.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = dt.getUTCDay(); // 0 = Sun, 6 = Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    throw new ValidationError(
      `${formatLongDate(parsed)} is a weekend. Attendance is recorded on school days only.`,
    );
  }
  if (schoolYear && (parsed < schoolYear.start_date || parsed > schoolYear.end_date)) {
    throw new ValidationError(
      `${formatLongDate(parsed)} is outside school year ${schoolYear.name} (${formatShortDate(schoolYear.start_date)} - ${formatShortDate(schoolYear.end_date)}).`,
    );
  }
  return parsed;
}
